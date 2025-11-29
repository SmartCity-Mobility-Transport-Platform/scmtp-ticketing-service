import { v4 as uuidv4 } from 'uuid';
import { publishEvent, KAFKA_TOPICS } from '../infrastructure/messaging/kafka';
import {
  TicketEventType,
  TicketBookedEvent,
  TicketReservedEvent,
  TicketConfirmedEvent,
  TicketCancelledEvent,
  TicketExpiredEvent,
} from './types';
import { Booking } from '../models/booking';
import logger from '../utils/logger';

const createBaseEvent = (
  eventType: TicketEventType,
  aggregateId: string,
  correlationId?: string
) => ({
  eventId: uuidv4(),
  eventType,
  aggregateId,
  aggregateType: 'Booking',
  timestamp: new Date(),
  version: 1,
  correlationId,
});

export const eventPublisher = {
  // Publish TicketBooked event
  publishTicketBooked: async (
    booking: Booking,
    correlationId?: string
  ): Promise<void> => {
    const event: TicketBookedEvent = {
      ...createBaseEvent(TicketEventType.TICKET_BOOKED, booking.id, correlationId),
      eventType: TicketEventType.TICKET_BOOKED,
      payload: {
        bookingId: booking.id,
        userId: booking.userId,
        routeId: booking.routeId,
        scheduleId: booking.scheduleId,
        seatNumber: booking.seatNumber,
        passengerName: booking.passengerName,
        passengerEmail: booking.passengerEmail,
        price: booking.price,
        currency: booking.currency,
      },
    };

    await publishEvent(KAFKA_TOPICS.TICKET_EVENTS, event);
    logger.info('TicketBooked event published', { bookingId: booking.id });
  },

  // Publish TicketReserved event
  publishTicketReserved: async (
    booking: Booking,
    expiresAt: Date,
    correlationId?: string
  ): Promise<void> => {
    const event: TicketReservedEvent = {
      ...createBaseEvent(TicketEventType.TICKET_RESERVED, booking.id, correlationId),
      eventType: TicketEventType.TICKET_RESERVED,
      payload: {
        bookingId: booking.id,
        userId: booking.userId,
        routeId: booking.routeId,
        scheduleId: booking.scheduleId,
        seatNumber: booking.seatNumber,
        passengerName: booking.passengerName,
        passengerEmail: booking.passengerEmail,
        price: booking.price,
        currency: booking.currency,
        expiresAt,
      },
    };

    await publishEvent(KAFKA_TOPICS.TICKET_EVENTS, event);
    logger.info('TicketReserved event published', { bookingId: booking.id, expiresAt });
  },

  // Publish TicketConfirmed event
  publishTicketConfirmed: async (
    bookingId: string,
    userId: string,
    paymentId: string,
    correlationId?: string
  ): Promise<void> => {
    const event: TicketConfirmedEvent = {
      ...createBaseEvent(TicketEventType.TICKET_CONFIRMED, bookingId, correlationId),
      eventType: TicketEventType.TICKET_CONFIRMED,
      payload: {
        bookingId,
        userId,
        paymentId,
        confirmedAt: new Date(),
      },
    };

    await publishEvent(KAFKA_TOPICS.TICKET_EVENTS, event);
    logger.info('TicketConfirmed event published', { bookingId, paymentId });
  },

  // Publish TicketCancelled event
  publishTicketCancelled: async (
    bookingId: string,
    userId: string,
    reason?: string,
    refundAmount?: number,
    correlationId?: string
  ): Promise<void> => {
    const event: TicketCancelledEvent = {
      ...createBaseEvent(TicketEventType.TICKET_CANCELLED, bookingId, correlationId),
      eventType: TicketEventType.TICKET_CANCELLED,
      payload: {
        bookingId,
        userId,
        reason,
        cancelledAt: new Date(),
        refundAmount,
      },
    };

    await publishEvent(KAFKA_TOPICS.TICKET_EVENTS, event);
    logger.info('TicketCancelled event published', { bookingId, reason });
  },

  // Publish TicketExpired event
  publishTicketExpired: async (
    bookingId: string,
    userId: string,
    correlationId?: string
  ): Promise<void> => {
    const event: TicketExpiredEvent = {
      ...createBaseEvent(TicketEventType.TICKET_EXPIRED, bookingId, correlationId),
      eventType: TicketEventType.TICKET_EXPIRED,
      payload: {
        bookingId,
        userId,
        expiredAt: new Date(),
      },
    };

    await publishEvent(KAFKA_TOPICS.TICKET_EVENTS, event);
    logger.info('TicketExpired event published', { bookingId });
  },
};

export default eventPublisher;

