import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { createAuditLog } from '../models/auditLog';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error(`Unhandled error: ${err.message}\n${err.stack}`);
  try {
    const rawMessage = err.message.split('\n')[0].substring(0, 200);
    const safeMessage = rawMessage.length > 0 ? rawMessage : 'Unknown error';
    createAuditLog('system_error', null, `${req.method} ${req.path}: ${safeMessage}`, req.ip || null);
  } catch {
    // Avoid recursive errors if the DB itself is unavailable
  }
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({
    error: 'internal_server_error',
    error_description: process.env.NODE_ENV === 'development' ? err.message : 'An internal error occurred',
  });
}
