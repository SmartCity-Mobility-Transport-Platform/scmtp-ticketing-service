import readDb from '../infrastructure/database/readDb';
import redis, { cacheKeys } from '../infrastructure/cache/redis';
import { 
  BookingView, 
  GetUserTicketsQuery, 
  PaginatedResult 
} from '../models/booking';
import { BadRequestError } from '../utils/errors';
import logger from '../utils/logger';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const CACHE_TTL_SECONDS = 60; // 1 minute cache

export const getUserTicketsHandler = async (
  query: GetUserTicketsQuery
): Promise<PaginatedResult<BookingView>> => {
  logger.info('Executing GetUserTickets query', { query });

  // Validate query
  validateQuery(query);

  const page = query.page || DEFAULT_PAGE;
  const limit = Math.min(query.limit || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = (page - 1) * limit;

  // Try cache first (only if no status filter for simplicity)
  if (!query.status) {
    const cacheKey = `${cacheKeys.userTickets(query.userId)}:page:${page}:limit:${limit}`;
    const cached = await redis.get<PaginatedResult<BookingView>>(cacheKey);
    
    if (cached) {
      logger.debug('Cache hit for user tickets', { userId: query.userId });
      return cached;
    }
  }

  // Build query
  let sqlQuery = `
    SELECT 
      id, user_id, route_id, route_name, schedule_id,
      departure_time, arrival_time, origin_stop, destination_stop,
      seat_number, passenger_name, passenger_email,
      price, currency, status, created_at
    FROM user_tickets_view
    WHERE user_id = $1
  `;
  
  const params: unknown[] = [query.userId];
  let paramIndex = 2;

  if (query.status) {
    sqlQuery += ` AND status = $${paramIndex}`;
    params.push(query.status);
    paramIndex++;
  }

  // Get total count
  const countQuery = `SELECT COUNT(*) FROM user_tickets_view WHERE user_id = $1${
    query.status ? ` AND status = $2` : ''
  }`;
  const countParams = query.status ? [query.userId, query.status] : [query.userId];
  
  const countResult = await readDb.queryOne<{ count: string }>(countQuery, countParams);
  const total = parseInt(countResult?.count || '0', 10);

  // Add ordering and pagination
  sqlQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  // Execute query
  const rows = await readDb.query<BookingViewRow>(sqlQuery, params);

  const result: PaginatedResult<BookingView> = {
    data: rows.map(mapRowToBookingView),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  // Cache the result
  if (!query.status) {
    const cacheKey = `${cacheKeys.userTickets(query.userId)}:page:${page}:limit:${limit}`;
    await redis.set(cacheKey, result, CACHE_TTL_SECONDS);
  }

  logger.info('GetUserTickets query executed', { 
    userId: query.userId, 
    total, 
    returned: result.data.length 
  });

  return result;
};

function validateQuery(query: GetUserTicketsQuery): void {
  if (!query.userId) {
    throw new BadRequestError('userId is required');
  }
  if (query.page && query.page < 1) {
    throw new BadRequestError('page must be at least 1');
  }
  if (query.limit && query.limit < 1) {
    throw new BadRequestError('limit must be at least 1');
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

export default getUserTicketsHandler;

