import { EachMessagePayload } from 'kafkajs';
import readDb from '../infrastructure/database/readDb';
import redis, { cacheKeys } from '../infrastructure/cache/redis';
import { 
  TicketEventType, 
  TicketBookedEvent, 
  TicketReservedEvent,
  TicketConfirmedEvent, 
  TicketCancelledEvent 
} from '../events/types';
import logger from '../utils/logger';

/**
 * Ticket Projector - Updates the read model based on domain events
 * This is a key component of the CQRS pattern
 */
export const ticketProjector = {
  /**
   * Process incoming Kafka messages and update read model
   */
  processMessage: async (payload: EachMessagePayload): Promise<void> => {
    const { topic, partition, message } = payload;
    
    if (!message.value) {
      logger.warn('Received empty message', { topic, partition });
      return;
    }

    try {
      const event = JSON.parse(message.value.toString());
      const eventType = message.headers?.eventType?.toString() || event.eventType;

      logger.info('Processing event for projection', { 
        eventType, 
        aggregateId: event.aggregateId 
      });

      switch (eventType) {
        case TicketEventType.TICKET_BOOKED:
          await handleTicketBooked(event as TicketBookedEvent);
          break;
        case TicketEventType.TICKET_RESERVED:
          await handleTicketReserved(event as TicketReservedEvent);
          break;
        case TicketEventType.TICKET_CONFIRMED:
          await handleTicketConfirmed(event as TicketConfirmedEvent);
          break;
        case TicketEventType.TICKET_CANCELLED:
          await handleTicketCancelled(event as TicketCancelledEvent);
          break;
        default:
          logger.warn('Unknown event type', { eventType });
      }

      // Update projection checkpoint
      await updateCheckpoint(event.eventId);

    } catch (error) {
      logger.error('Error processing event for projection', { error, payload });
      throw error;
    }
  },
};

/**
 * Handle TicketBooked event - Insert new record into read model
 */
async function handleTicketBooked(event: TicketBookedEvent): Promise<void> {
  const { payload } = event;

  await readDb.query(
    `INSERT INTO user_tickets_view (
      id, user_id, route_id, schedule_id, seat_number,
      passenger_name, passenger_email, price, currency, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = NOW()`,
    [
      payload.bookingId,
      payload.userId,
      payload.routeId,
      payload.scheduleId,
      payload.seatNumber,
      payload.passengerName,
      payload.passengerEmail,
      payload.price,
      payload.currency,
      'PENDING',
      event.timestamp,
    ]
  );

  // Invalidate user's tickets cache
  await redis.delPattern(`${cacheKeys.userTickets(payload.userId)}:*`);

  // Update schedule availability
  await updateScheduleAvailability(payload.scheduleId, 1);

  logger.info('Projected TicketBooked event', { bookingId: payload.bookingId });
}

/**
 * Handle TicketReserved event - Insert/update with RESERVED status
 */
async function handleTicketReserved(event: TicketReservedEvent): Promise<void> {
  const { payload } = event;

  await readDb.query(
    `INSERT INTO user_tickets_view (
      id, user_id, route_id, schedule_id, seat_number,
      passenger_name, passenger_email, price, currency, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = NOW()`,
    [
      payload.bookingId,
      payload.userId,
      payload.routeId,
      payload.scheduleId,
      payload.seatNumber,
      payload.passengerName,
      payload.passengerEmail,
      payload.price,
      payload.currency,
      'RESERVED',
      event.timestamp,
    ]
  );

  // Invalidate caches
  await redis.delPattern(`${cacheKeys.userTickets(payload.userId)}:*`);

  // Update schedule availability
  await updateScheduleAvailability(payload.scheduleId, 1);

  logger.info('Projected TicketReserved event', { bookingId: payload.bookingId });
}

/**
 * Handle TicketConfirmed event - Update status to CONFIRMED
 */
async function handleTicketConfirmed(event: TicketConfirmedEvent): Promise<void> {
  const { payload } = event;

  await readDb.query(
    `UPDATE user_tickets_view 
     SET status = $1, updated_at = NOW()
     WHERE id = $2`,
    ['CONFIRMED', payload.bookingId]
  );

  // Invalidate caches
  await redis.del(cacheKeys.ticketDetails(payload.bookingId));
  await redis.delPattern(`${cacheKeys.userTickets(payload.userId)}:*`);

  logger.info('Projected TicketConfirmed event', { bookingId: payload.bookingId });
}

/**
 * Handle TicketCancelled event - Update status to CANCELLED
 */
async function handleTicketCancelled(event: TicketCancelledEvent): Promise<void> {
  const { payload } = event;

  // Get booking details first to update availability
  const booking = await readDb.queryOne<{ schedule_id: string }>(
    `SELECT schedule_id FROM user_tickets_view WHERE id = $1`,
    [payload.bookingId]
  );

  await readDb.query(
    `UPDATE user_tickets_view 
     SET status = $1, updated_at = NOW()
     WHERE id = $2`,
    ['CANCELLED', payload.bookingId]
  );

  // Invalidate caches
  await redis.del(cacheKeys.ticketDetails(payload.bookingId));
  await redis.delPattern(`${cacheKeys.userTickets(payload.userId)}:*`);

  // Update schedule availability (decrease booked count)
  if (booking) {
    await updateScheduleAvailability(booking.schedule_id, -1);
  }

  logger.info('Projected TicketCancelled event', { bookingId: payload.bookingId });
}

/**
 * Update schedule availability in read model
 */
async function updateScheduleAvailability(
  scheduleId: string,
  delta: number
): Promise<void> {
  await readDb.query(
    `INSERT INTO schedule_availability_view (schedule_id, total_seats, booked_seats)
     VALUES ($1, 50, GREATEST(0, $2))
     ON CONFLICT (schedule_id) DO UPDATE SET
       booked_seats = GREATEST(0, schedule_availability_view.booked_seats + $2),
       updated_at = NOW()`,
    [scheduleId, delta]
  );

  // Invalidate cache
  await redis.del(cacheKeys.scheduleAvailability(scheduleId));
}

/**
 * Update projection checkpoint
 */
async function updateCheckpoint(eventId: string): Promise<void> {
  await readDb.query(
    `INSERT INTO projection_checkpoints (projection_name, last_processed_event_id, last_processed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (projection_name) DO UPDATE SET
       last_processed_event_id = EXCLUDED.last_processed_event_id,
       last_processed_at = NOW()`,
    ['ticket_projector', eventId]
  );
}

export default ticketProjector;

