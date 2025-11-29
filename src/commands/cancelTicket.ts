import { v4 as uuidv4 } from 'uuid';
import writeDb from '../infrastructure/database/writeDb';
import { eventPublisher } from '../events/publisher';
import { Booking, BookingStatus, CancelTicketCommand } from '../models/booking';
import { 
  BadRequestError, 
  BookingNotFoundError, 
  InvalidBookingStateError,
  ForbiddenError 
} from '../utils/errors';
import logger from '../utils/logger';

export interface CancelTicketResult {
  booking: Booking;
  refundAmount: number | null;
}

export const cancelTicketHandler = async (
  command: CancelTicketCommand,
  correlationId?: string
): Promise<CancelTicketResult> => {
  logger.info('Executing CancelTicket command', { command, correlationId });

  // Validate command
  validateCancelTicketCommand(command);

  // Execute in transaction
  const result = await writeDb.transaction(async (client) => {
    // Get current booking with lock
    const currentBooking = await client.query(
      `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
      [command.bookingId]
    );

    if (currentBooking.rows.length === 0) {
      throw new BookingNotFoundError(command.bookingId);
    }

    const existingBooking = currentBooking.rows[0];

    // For service-to-service calls, userId might not be provided - get it from booking
    const actualUserId = command.userId || existingBooking.user_id;
    
    if (!actualUserId) {
      throw new BadRequestError('userId is required');
    }

    // Verify user owns this booking (skip for service-to-service calls if userId matches booking)
    if (command.userId && existingBooking.user_id !== command.userId) {
      throw new ForbiddenError('You are not authorized to cancel this booking');
    }

    // Validate booking state - can only cancel PENDING, RESERVED, or CONFIRMED
    const cancellableStates = [
      BookingStatus.PENDING,
      BookingStatus.RESERVED,
      BookingStatus.CONFIRMED,
    ];

    if (!cancellableStates.includes(existingBooking.status)) {
      throw new InvalidBookingStateError(
        existingBooking.status,
        cancellableStates.join(' or ')
      );
    }

    const now = new Date();
    
    // Calculate refund amount (full refund if cancelled within policy)
    // In production, this would involve more complex refund policy logic
    let refundAmount: number | null = null;
    if (existingBooking.status === BookingStatus.CONFIRMED) {
      // Simple refund policy: full refund
      refundAmount = parseFloat(existingBooking.price);
    }

    // Update booking to cancelled
    const updateResult = await client.query(
      `UPDATE bookings 
       SET status = $1, cancelled_at = $2, updated_at = $3, expires_at = NULL
       WHERE id = $4
       RETURNING *`,
      [BookingStatus.CANCELLED, now, now, command.bookingId]
    );

    // Release seat if it was locked/booked
    if (existingBooking.seat_number) {
      await client.query(
        `UPDATE seat_availability 
         SET status = 'AVAILABLE', booking_id = NULL, locked_until = NULL, updated_at = $1
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
        'TICKET_CANCELLED',
        command.bookingId,
        'Booking',
        JSON.stringify({
          bookingId: command.bookingId,
          userId: actualUserId,
          reason: command.reason,
          cancelledAt: now.toISOString(),
          refundAmount,
        }),
        correlationId || null,
        2, // Version incremented
      ]
    );

    const booking = mapRowToBooking(updateResult.rows[0]);
    
    return {
      booking,
      refundAmount,
    };
  });

  // Publish event to Kafka
  try {
    await eventPublisher.publishTicketCancelled(
      result.booking.id,
      result.booking.userId,
      command.reason,
      result.refundAmount || undefined,
      correlationId
    );
  } catch (error) {
    logger.error('Failed to publish TicketCancelled event', { bookingId: result.booking.id, error });
  }

  logger.info('CancelTicket command executed successfully', { 
    bookingId: result.booking.id, 
    refundAmount: result.refundAmount 
  });
  
  return result;
};

function validateCancelTicketCommand(command: CancelTicketCommand): void {
  if (!command.bookingId) {
    throw new BadRequestError('bookingId is required');
  }
  // userId is optional - can be obtained from booking for service-to-service calls
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

export default cancelTicketHandler;

