import readDb from '../infrastructure/database/readDb';
import redis, { cacheKeys } from '../infrastructure/cache/redis';
import { BookingView, GetTicketDetailsQuery } from '../models/booking';
import { BadRequestError, BookingNotFoundError, ForbiddenError } from '../utils/errors';
import logger from '../utils/logger';

const CACHE_TTL_SECONDS = 300; // 5 minutes cache

export const getTicketDetailsHandler = async (
  query: GetTicketDetailsQuery
): Promise<BookingView> => {
  logger.info('Executing GetTicketDetails query', { query });

  // Validate query
  validateQuery(query);

  // Try cache first
  const cacheKey = cacheKeys.ticketDetails(query.bookingId);
  const cached = await redis.get<BookingView>(cacheKey);

  if (cached) {
    // Verify user owns this ticket (from cache)
    if (cached.userId !== query.userId) {
      throw new ForbiddenError('You are not authorized to view this ticket');
    }
    logger.debug('Cache hit for ticket details', { bookingId: query.bookingId });
    return cached;
  }

  // Query from read database
  const sqlQuery = `
    SELECT 
      id, user_id, route_id, route_name, schedule_id,
      departure_time, arrival_time, origin_stop, destination_stop,
      seat_number, passenger_name, passenger_email,
      price, currency, status, created_at
    FROM user_tickets_view
    WHERE id = $1
  `;

  const row = await readDb.queryOne<BookingViewRow>(sqlQuery, [query.bookingId]);

  if (!row) {
    throw new BookingNotFoundError(query.bookingId);
  }

  // Verify user owns this ticket
  if (row.user_id !== query.userId) {
    throw new ForbiddenError('You are not authorized to view this ticket');
  }

  const ticket = mapRowToBookingView(row);

  // Cache the result
  await redis.set(cacheKey, ticket, CACHE_TTL_SECONDS);

  logger.info('GetTicketDetails query executed', { bookingId: query.bookingId });

  return ticket;
};

function validateQuery(query: GetTicketDetailsQuery): void {
  if (!query.bookingId) {
    throw new BadRequestError('bookingId is required');
  }
  if (!query.userId) {
    throw new BadRequestError('userId is required');
  }
}

interface BookingViewRow {
  id: string;
  user_id: string;
  route_id: string;
  route_name: string | null;
  schedule_id: string;
  departure_time: string | null;
  arrival_time: string | null;
  origin_stop: string | null;
  destination_stop: string | null;
  seat_number: string | null;
  passenger_name: string;
  passenger_email: string;
  price: string;
  currency: string;
  status: string;
  created_at: string;
}

function mapRowToBookingView(row: BookingViewRow): BookingView {
  return {
    id: row.id,
    userId: row.user_id,
    routeId: row.route_id,
    routeName: row.route_name,
    scheduleId: row.schedule_id,
    departureTime: row.departure_time,
    arrivalTime: row.arrival_time,
    originStop: row.origin_stop,
    destinationStop: row.destination_stop,
    seatNumber: row.seat_number,
    passengerName: row.passenger_name,
    passengerEmail: row.passenger_email,
    price: parseFloat(row.price),
    currency: row.currency,
    status: row.status as BookingView['status'],
    createdAt: new Date(row.created_at),
  };
}

export default getTicketDetailsHandler;

