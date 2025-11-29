// Booking Status Enum
export enum BookingStatus {
  PENDING = 'PENDING',
  RESERVED = 'RESERVED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
}

// Booking Entity (Write Model)
export interface Booking {
  id: string;
  userId: string;
  routeId: string;
  scheduleId: string;
  seatNumber: string | null;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string | null;
  price: number;
  currency: string;
  status: BookingStatus;
  paymentId: string | null;
  reservedAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Booking View (Read Model)
export interface BookingView {
  id: string;
  userId: string;
  routeId: string;
  routeName: string | null;
  scheduleId: string;
  departureTime: string | null;
  arrivalTime: string | null;
  originStop: string | null;
  destinationStop: string | null;
  seatNumber: string | null;
  passengerName: string;
  passengerEmail: string;
  price: number;
  currency: string;
  status: BookingStatus;
  createdAt: Date;
}

// Command DTOs
export interface BookTicketCommand {
  userId: string;
  routeId: string;
  scheduleId: string;
  seatNumber?: string;
  passengerName: string;
  passengerEmail: string;
  passengerPhone?: string;
  price: number;
  currency?: string;
}

export interface ReserveTicketCommand {
  userId: string;
  routeId: string;
  scheduleId: string;
  seatNumber?: string;
  passengerName: string;
  passengerEmail: string;
  passengerPhone?: string;
  price: number;
  currency?: string;
  reservationDurationMinutes?: number;
}

export interface ConfirmTicketCommand {
  bookingId: string;
  paymentId: string;
}

export interface CancelTicketCommand {
  bookingId: string;
  userId: string;
  reason?: string;
}

// Query DTOs
export interface GetUserTicketsQuery {
  userId: string;
  status?: BookingStatus;
  page?: number;
  limit?: number;
}

export interface GetTicketDetailsQuery {
  bookingId: string;
  userId: string;
}

// Paginated Response
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

