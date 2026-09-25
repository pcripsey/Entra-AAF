import { randomBytes, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

type AdminSession = {
  csrfToken?: string;
};

const CSRF_HEADER_NAME = 'x-csrf-token';

function getAllowedAdminOrigins(): Set<string> {
  const candidates = config.corsOrigins && config.corsOrigins.length > 0
    ? config.corsOrigins
    : [config.baseUrl];

  const allowedOrigins = new Set<string>();
  for (const candidate of candidates) {
    try {
      allowedOrigins.add(new URL(candidate).origin);
    } catch {
      // Ignore invalid configured origins; CORS validation handles these separately.
    }
  }

  return allowedOrigins;
}

function getRequestOrigin(req: Request): string | null {
  const originHeader = req.get('origin');
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      return null;
    }
  }

  const refererHeader = req.get('referer');
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin;
    } catch {
      return null;
    }
  }

  return null;
}

function getOrCreateCsrfToken(req: Request): string {
  const sess = req.session as unknown as AdminSession;
  if (!sess.csrfToken) {
    sess.csrfToken = randomBytes(32).toString('base64url');
  }
  return sess.csrfToken;
}

function tokensMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function getAdminCsrfToken(req: Request, res: Response): void {
  const csrfToken = getOrCreateCsrfToken(req);
  res.json({
    csrfToken,
    headerName: 'X-CSRF-Token',
  });
}

export function requireAdminCsrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const allowedOrigins = getAllowedAdminOrigins();
  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    res.status(403).json({
      error: 'invalid_origin',
      error_description: 'Admin requests must originate from a trusted origin.',
    });
    return;
  }

  const sess = req.session as unknown as AdminSession;
  const expectedToken = sess.csrfToken;
  const receivedToken = req.get(CSRF_HEADER_NAME);

  if (!expectedToken || !receivedToken || !tokensMatch(expectedToken, receivedToken)) {
    res.status(403).json({
      error: 'invalid_csrf_token',
      error_description: 'Missing or invalid CSRF token. Refresh the page and try again.',
    });
    return;
  }

  next();
}
