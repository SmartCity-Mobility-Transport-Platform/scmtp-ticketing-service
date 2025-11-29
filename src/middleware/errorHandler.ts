import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AppError, ValidationError } from '../utils/errors';
import logger from '../utils/logger';
import { config } from '../config';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  stack?: string;
}

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log the error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
  });

  // Handle known application errors
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    // Add validation errors if present
    if (err instanceof ValidationError && Object.keys(err.errors).length > 0) {
      response.error.details = { validationErrors: err.errors };
    }

    // Add stack trace in development
    if (config.env === 'development') {
      response.stack = err.stack;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unknown errors
  const response: ErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.env === 'production' 
        ? 'An unexpected error occurred' 
        : err.message,
    },
  };

  if (config.env === 'development') {
    response.stack = err.stack;
  }

  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(response);
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

export default { errorHandler, notFoundHandler };

