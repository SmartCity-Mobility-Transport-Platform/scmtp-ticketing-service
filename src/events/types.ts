// Domain Event Types
export enum TicketEventType {
  TICKET_BOOKED = 'TICKET_BOOKED',
  TICKET_RESERVED = 'TICKET_RESERVED',
  TICKET_CONFIRMED = 'TICKET_CONFIRMED',
  TICKET_CANCELLED = 'TICKET_CANCELLED',
  TICKET_EXPIRED = 'TICKET_EXPIRED',
  TICKET_REFUNDED = 'TICKET_REFUNDED',
}

// Base Event Interface
export interface DomainEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  timestamp: Date;
  version: number;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, unknown>;
}

// Ticket Events
export interface TicketBookedEvent extends DomainEvent {
  eventType: TicketEventType.TICKET_BOOKED;
  payload: {
    bookingId: string;
    userId: string;
    routeId: string;
    scheduleId: string;
    seatNumber: string | null;
    passengerName: string;
    passengerEmail: string;
    price: number;
    currency: string;
  };
}

export interface TicketReservedEvent extends DomainEvent {
  eventType: TicketEventType.TICKET_RESERVED;
  payload: {
    bookingId: string;
    userId: string;
    routeId: string;
    scheduleId: string;
    seatNumber: string | null;
    passengerName: string;
    passengerEmail: string;
    price: number;
    currency: string;
    expiresAt: Date;
  };
}

export interface TicketConfirmedEvent extends DomainEvent {
  eventType: TicketEventType.TICKET_CONFIRMED;
  payload: {
    bookingId: string;
    userId: string;
    paymentId: string;
    confirmedAt: Date;
  };
}

export interface TicketCancelledEvent extends DomainEvent {
  eventType: TicketEventType.TICKET_CANCELLED;
  payload: {
    bookingId: string;
    userId: string;
    reason?: string;
    cancelledAt: Date;
    refundAmount?: number;
  };
}

export interface TicketExpiredEvent extends DomainEvent {
  eventType: TicketEventType.TICKET_EXPIRED;
  payload: {
    bookingId: string;
    userId: string;
    expiredAt: Date;
  };
}

export interface TicketRefundedEvent extends DomainEvent {
  eventType: TicketEventType.TICKET_REFUNDED;
  payload: {
    bookingId: string;
    userId: string;
    refundAmount: number;
    refundedAt: Date;
  };
}

export type TicketEvent =
  | TicketBookedEvent
  | TicketReservedEvent
  | TicketConfirmedEvent
  | TicketCancelledEvent
  | TicketExpiredEvent
  | TicketRefundedEvent;

// Kafka Topics
export const KAFKA_TOPICS = {
  TICKET_EVENTS: 'ticket-events',
  PAYMENT_EVENTS: 'payment-events',
  WALLET_EVENTS: 'wallet-events',
  USER_EVENTS: 'user-events',
} as const;

