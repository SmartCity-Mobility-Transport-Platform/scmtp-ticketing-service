import { v4 as uuidv4 } from 'uuid';
import writeDb from '../infrastructure/database/writeDb';
import { eventPublisher } from '../events/publisher';
import { Booking, BookingStatus, ConfirmTicketCommand } from '../models/booking';
import { 
  BadRequestError, 
  BookingNotFoundError, 
  InvalidBookingStateError 
} from '../utils/errors';
import logger from '../utils/logger';

export interface ConfirmTicketResult {
  booking: Booking;
}

export const confirmTicketHandler = async (
  command: ConfirmTicketCommand,
  correlationId?: string
): Promise<ConfirmTicketResult> => {
  logger.info('Executing ConfirmTicket command', { command, correlationId });

  // Validate command
  validateConfirmTicketCommand(command);

  // Execute in transaction
  const booking = await writeDb.transaction(async (client) => {
    // Get current booking with lock
    const currentBooking = await client.query(
      `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
      [command.bookingId]
    );

    if (currentBooking.rows.length === 0) {
      throw new BookingNotFoundError(command.bookingId);
    }

    const existingBooking = currentBooking.rows[0];

    // Validate booking state - must be RESERVED or PENDING to confirm
    if (existingBooking.status !== BookingStatus.RESERVED && 
        existingBooking.status !== BookingStatus.PENDING) {
      throw new InvalidBookingStateError(
        existingBooking.status,
        `${BookingStatus.RESERVED} or ${BookingStatus.PENDING}`
      );
    }

    // Check if reservation has expired
    if (existingBooking.expires_at && new Date(existingBooking.expires_at) < new Date()) {
      throw new InvalidBookingStateError(existingBooking.status, 'Reservation has expired');
    }

    const now = new Date();

    // Update booking to confirmed
    const result = await client.query(
      `UPDATE bookings 
       SET status = $1, payment_id = $2, confirmed_at = $3, updated_at = $4, expires_at = NULL
       WHERE id = $5
       RETURNING *`,
      [BookingStatus.CONFIRMED, command.paymentId, now, now, command.bookingId]
    );

    // Update seat status to BOOKED (permanent)
    if (existingBooking.seat_number) {
      await client.query(
        `UPDATE seat_availability 
         SET status = 'BOOKED', locked_until = NULL, updated_at = $1
         WHERE schedule_id = $2 AND seat_number = $3`,
        [now, existingBooking.schedule_id, existingBooking.seat_number]
      );
    }

    // Store event in event store
    await client.query(
      `INSERT INTO booking_events (
        event_id, event_type, aggregate_id, aggregate_type, payload, correlation_id, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv4(),
        'TICKET_CONFIRMED',
        command.bookingId,
        'Booking',
        JSON.stringify({
          bookingId: command.bookingId,
          paymentId: command.paymentId,
          confirmedAt: now.toISOString(),
        }),
        correlationId || null,
        2, // Version incremented
      ]
    );

    return mapRowToBooking(result.rows[0]);
  });

  // Publish event to Kafka
  try {
    await eventPublisher.publishTicketConfirmed(
      booking.id,
      booking.userId,
      command.paymentId,
      correlationId
    );
  } catch (error) {
    logger.error('Failed to publish TicketConfirmed event', { bookingId: booking.id, error });
  }

  logger.info('ConfirmTicket command executed successfully', { 
    bookingId: booking.id, 
    paymentId: command.paymentId 
  });
  
  return { booking };
};

function validateConfirmTicketCommand(command: ConfirmTicketCommand): void {
  if (!command.bookingId) {
    throw new BadRequestError('bookingId is required');
  }
  if (!command.paymentId) {
    throw new BadRequestError('paymentId is required');
  }
}

function mapRowToBooking(row: Record<string, unknown>): Booking {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    routeId: row.route_id as string,
    scheduleId: row.schedule_id as string,
    seatNumber: row.seat_number as string | null,
    passengerName: row.passenger_name as string,
    passengerEmail: row.passenger_email as string,
    passengerPhone: row.passenger_phone as string | null,
    price: parseFloat(row.price as string),
    currency: row.currency as string,
    status: row.status as BookingStatus,
    paymentId: row.payment_id as string | null,
    reservedAt: row.reserved_at ? new Date(row.reserved_at as string) : null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at as string) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export default confirmTicketHandler;

