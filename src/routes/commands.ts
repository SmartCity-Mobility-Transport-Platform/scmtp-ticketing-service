import { Router, Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validate';
import {
  bookTicketHandler,
  reserveTicketHandler,
  confirmTicketHandler,
  cancelTicketHandler,
} from '../commands';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /tickets/commands/book
 * Book a ticket (direct booking, not part of saga)
 */
router.post(
  '/book',
  authenticate,
  validate(schemas.bookTicket),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
      
      const result = await bookTicketHandler(
        {
          userId: req.user!.userId,
          routeId: req.body.routeId,
          scheduleId: req.body.scheduleId,
          seatNumber: req.body.seatNumber,
          passengerName: req.body.passengerName,
          passengerEmail: req.body.passengerEmail,
          passengerPhone: req.body.passengerPhone,
          price: req.body.price,
          currency: req.body.currency,
        },
        correlationId
      );

      logger.info('Ticket booked', { bookingId: result.booking.id, userId: req.user!.userId });

      res.status(StatusCodes.CREATED).json({
        success: true,
        data: result.booking,
        meta: {
          correlationId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /tickets/commands/reserve
 * Reserve a ticket (for saga - payment service calls this)
 */
router.post(
  '/reserve',
  authenticate,
  validate(schemas.reserveTicket),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

      const result = await reserveTicketHandler(
        {
          userId: req.user!.userId,
          routeId: req.body.routeId,
          scheduleId: req.body.scheduleId,
          seatNumber: req.body.seatNumber,
          passengerName: req.body.passengerName,
          passengerEmail: req.body.passengerEmail,
          passengerPhone: req.body.passengerPhone,
          price: req.body.price,
          currency: req.body.currency,
          reservationDurationMinutes: req.body.reservationDurationMinutes,
        },
        correlationId
      );

      logger.info('Ticket reserved', { 
        bookingId: result.booking.id, 
        expiresAt: result.expiresAt,
        userId: req.user!.userId 
      });

      res.status(StatusCodes.CREATED).json({
        success: true,
        data: {
          booking: result.booking,
          expiresAt: result.expiresAt,
        },
        meta: {
          correlationId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /tickets/commands/confirm
 * Confirm a reserved ticket (for saga - after payment success)
 */
router.post(
  '/confirm',
  authenticate,
  validate(schemas.confirmTicket),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

      const result = await confirmTicketHandler(
        {
          bookingId: req.body.bookingId,
          paymentId: req.body.paymentId,
        },
        correlationId
      );

      logger.info('Ticket confirmed', { 
        bookingId: result.booking.id, 
        paymentId: req.body.paymentId,
        userId: req.user!.userId 
      });

      res.status(StatusCodes.OK).json({
        success: true,
        data: result.booking,
        meta: {
          correlationId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /tickets/commands/cancel
 * Cancel a ticket
 */
router.post(
  '/cancel',
  authenticate,
  validate(schemas.cancelTicket),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

      const result = await cancelTicketHandler(
        {
          bookingId: req.body.bookingId,
          userId: req.user!.userId,
          reason: req.body.reason,
        },
        correlationId
      );

      logger.info('Ticket cancelled', { 
        bookingId: result.booking.id, 
        refundAmount: result.refundAmount,
        userId: req.user!.userId 
      });

      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          booking: result.booking,
          refundAmount: result.refundAmount,
        },
        meta: {
          correlationId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

