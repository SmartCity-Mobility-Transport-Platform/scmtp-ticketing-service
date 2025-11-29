import { v4 as uuidv4 } from 'uuid';
import writeDb from '../infrastructure/database/writeDb';
import { eventPublisher } from '../events/publisher';
import { Booking, BookingStatus, ReserveTicketCommand } from '../models/booking';
import { BadRequestError, InsufficientSeatsError } from '../utils/errors';
import logger from '../utils/logger';

export interface ReserveTicketResult {
  booking: Booking;
  expiresAt: Date;
}

const DEFAULT_RESERVATION_DURATION_MINUTES = 15;

export const reserveTicketHandler = async (
  command: ReserveTicketCommand,
  correlationId?: string
): Promise<ReserveTicketResult> => {
  logger.info('Executing ReserveTicket command', { command, correlationId });

  // Validate command
  validateReserveTicketCommand(command);

  const reservationDuration = command.reservationDurationMinutes || DEFAULT_RESERVATION_DURATION_MINUTES;
  
  // Execute in transaction
  const result = await writeDb.transaction(async (client) => {
    // Check seat availability if seat number is specified
    if (command.seatNumber) {
      const seatCheck = await client.query(
        `SELECT id, locked_until FROM seat_availability 
         WHERE schedule_id = $1 AND seat_number = $2 
         AND (status = 'AVAILABLE' OR (status = 'LOCKED' AND locked_until < NOW()))
         FOR UPDATE`,
        [command.scheduleId, command.seatNumber]
      );

      if (seatCheck.rows.length === 0) {
        throw new InsufficientSeatsError(`Seat ${command.seatNumber} is not available`);
      }
    }

    // Create reservation
    const bookingId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + reservationDuration * 60 * 1000);

    const bookingResult = await client.query(
      `INSERT INTO bookings (
        id, user_id, route_id, schedule_id, seat_number,
        passenger_name, passenger_email, passenger_phone,
        price, currency, status, reserved_at, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        bookingId,
        command.userId,
        command.routeId,
        command.scheduleId,
        command.seatNumber || null,
        command.passengerName,
        command.passengerEmail,
        command.passengerPhone || null,
        command.price,
        command.currency || 'USD',
        BookingStatus.RESERVED,
        now,
        expiresAt,
        now,
        now,
      ]
    );

    // Lock seat if specified
    if (command.seatNumber) {
      await client.query(
        `UPDATE seat_availability 
         SET status = 'LOCKED', booking_id = $1, locked_until = $2, updated_at = $3
         WHERE schedule_id = $4 AND seat_number = $5`,
        [bookingId, expiresAt, now, command.scheduleId, command.seatNumber]
      );
    }

    // Store event in event store
    await client.query(
      `INSERT INTO booking_events (
        event_id, event_type, aggregate_id, aggregate_type, payload, correlation_id, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv4(),
        'TICKET_RESERVED',
        bookingId,
        'Booking',
        JSON.stringify({
          bookingId,
          userId: command.userId,
          routeId: command.routeId,
          scheduleId: command.scheduleId,
          seatNumber: command.seatNumber,
          price: command.price,
          expiresAt: expiresAt.toISOString(),
        }),
        correlationId || null,
        1,
      ]
    );

    return {
      booking: mapRowToBooking(bookingResult.rows[0]),
      expiresAt,
    };
  });

  // Publish event to Kafka
  try {
    await eventPublisher.publishTicketReserved(result.booking, result.expiresAt, correlationId);
  } catch (error) {
    logger.error('Failed to publish TicketReserved event', { bookingId: result.booking.id, error });
  }

  logger.info('ReserveTicket command executed successfully', { 
    bookingId: result.booking.id, 
    expiresAt: result.expiresAt 
  });
  
  return result;
};

function validateReserveTicketCommand(command: ReserveTicketCommand): void {
  if (!command.userId) {
    throw new BadRequestError('userId is required');
  }
  if (!command.routeId) {
    throw new BadRequestError('routeId is required');
  }
  if (!command.scheduleId) {
    throw new BadRequestError('scheduleId is required');
  }
  if (!command.passengerName) {
    throw new BadRequestError('passengerName is required');
  }
  if (!command.passengerEmail) {
    throw new BadRequestError('passengerEmail is required');
  }
  if (command.price <= 0) {
    throw new BadRequestError('price must be greater than 0');
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

export default reserveTicketHandler;

