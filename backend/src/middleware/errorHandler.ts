import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error(`Unhandled error: ${err.message}\n${err.stack}`);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({
    error: 'internal_server_error',
    error_description: process.env.NODE_ENV === 'development' ? err.message : 'An internal error occurred',
  });
}
