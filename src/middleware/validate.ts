import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Validation middleware factory using Zod
 */
export const validate = (
  schema: ZodSchema,
  source: RequestPart = 'body'
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const validated = schema.parse(data);
      req[source] = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: Record<string, string[]> = {};
        
        error.errors.forEach((err) => {
          const path = err.path.join('.');
          if (!validationErrors[path]) {
            validationErrors[path] = [];
          }
          validationErrors[path].push(err.message);
        });

        next(new ValidationError('Validation failed', validationErrors));
      } else {
        next(error);
      }
    }
  };
};

// Common validation schemas
export const schemas = {
  // UUID validation
  uuid: z.string().uuid('Invalid UUID format'),

  // Booking schemas
  bookTicket: z.object({
    routeId: z.string().uuid('Invalid route ID'),
    scheduleId: z.string().uuid('Invalid schedule ID'),
    seatNumber: z.string().max(10).optional(),
    passengerName: z.string().min(2, 'Name must be at least 2 characters').max(255),
    passengerEmail: z.string().email('Invalid email address'),
    passengerPhone: z.string().max(20).optional(),
    price: z.number().positive('Price must be greater than 0'),
    currency: z.string().length(3).default('USD'),
  }),

  reserveTicket: z.object({
    routeId: z.string().uuid('Invalid route ID'),
    scheduleId: z.string().uuid('Invalid schedule ID'),
    seatNumber: z.string().max(10).optional(),
    passengerName: z.string().min(2, 'Name must be at least 2 characters').max(255),
    passengerEmail: z.string().email('Invalid email address'),
    passengerPhone: z.string().max(20).optional(),
    price: z.number().positive('Price must be greater than 0'),
    currency: z.string().length(3).default('USD'),
    reservationDurationMinutes: z.number().min(5).max(60).optional(),
  }),

  confirmTicket: z.object({
    bookingId: z.string().uuid('Invalid booking ID'),
    paymentId: z.string().uuid('Invalid payment ID'),
  }),

  cancelTicket: z.object({
    bookingId: z.string().uuid('Invalid booking ID'),
    reason: z.string().max(500).optional(),
  }),

  // Query schemas
  getUserTickets: z.object({
    status: z.enum(['PENDING', 'RESERVED', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED']).optional(),
    page: z.string().transform(Number).pipe(z.number().min(1)).optional(),
    limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
  }),

  getTicketDetails: z.object({
    bookingId: z.string().uuid('Invalid booking ID'),
  }),
};

export default validate;

