import { Router, Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validate';
import { getUserTicketsHandler, getTicketDetailsHandler } from '../queries';
import { BookingStatus } from '../models/booking';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /tickets/queries/my-tickets
 * Get current user's tickets with optional filtering
 */
router.get(
  '/my-tickets',
  authenticate,
  validate(schemas.getUserTickets, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getUserTicketsHandler({
        userId: req.user!.userId,
        status: req.query.status as BookingStatus | undefined,
        page: req.query.page as number | undefined,
        limit: req.query.limit as number | undefined,
      });

      logger.info('Retrieved user tickets', { 
        userId: req.user!.userId, 
        count: result.data.length,
        total: result.total 
      });

      res.status(StatusCodes.OK).json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /tickets/queries/:bookingId
 * Get specific ticket details
 */
router.get(
  '/:bookingId',
  authenticate,
  validate(schemas.getTicketDetails, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await getTicketDetailsHandler({
        bookingId: req.params.bookingId,
        userId: req.user!.userId,
      });

      logger.info('Retrieved ticket details', { 
        bookingId: req.params.bookingId,
        userId: req.user!.userId 
      });

      res.status(StatusCodes.OK).json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

