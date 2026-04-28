import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
]);

const SENSITIVE_BODY_FIELDS = new Set([
  'password',
  'client_secret',
  'clientSecret',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
]);

function sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  const sanitized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return sanitized;
}

function sanitizeBody(body: unknown): unknown {
  if (Array.isArray(body)) {
    return body.map(sanitizeBody);
  }
  if (body && typeof body === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      result[key] = SENSITIVE_BODY_FIELDS.has(key) ? '[REDACTED]' : sanitizeBody(value);
    }
    return result;
  }
  return body;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const hasBody = req.body && Object.keys(req.body as object).length > 0;
    const isError = res.statusCode >= 400;

    const entry: Record<string, unknown> = {
      method: req.method,
      url: req.originalUrl,
      ip,
      status: res.statusCode,
      duration: `${duration}ms`,
    };

    if (isError) {
      entry.headers = sanitizeHeaders(req.headers as Record<string, string | string[] | undefined>);
    }

    if (hasBody) {
      entry.body = sanitizeBody(req.body);
    }

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`[REQUEST] ${JSON.stringify(entry)}`);
  });

  next();
}
