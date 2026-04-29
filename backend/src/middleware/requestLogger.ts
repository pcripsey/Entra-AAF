import dns from 'dns';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Simple LRU cache for reverse DNS lookups (IP → hostname).
const DNS_CACHE_MAX = 256;
const dnsCache = new Map<string, string>();

function getCachedDns(ip: string): string | undefined {
  const value = dnsCache.get(ip);
  if (value !== undefined) {
    // Refresh insertion order (LRU behaviour).
    dnsCache.delete(ip);
    dnsCache.set(ip, value);
  }
  return value;
}

function setCachedDns(ip: string, hostname: string): void {
  if (dnsCache.size >= DNS_CACHE_MAX) {
    // Evict the oldest entry.
    const oldest = dnsCache.keys().next().value;
    if (oldest !== undefined) {
      dnsCache.delete(oldest);
    }
  }
  dnsCache.set(ip, hostname);
}

const DNS_LOOKUP_TIMEOUT_MS = 3000;

function reverseLookup(ip: string): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(ip), DNS_LOOKUP_TIMEOUT_MS);
    dns.reverse(ip, (err, hostnames) => {
      clearTimeout(timer);
      if (err || !hostnames || hostnames.length === 0) {
        resolve(ip);
      } else {
        resolve(hostnames[0]);
      }
    });
  });
}

async function getSourceDns(ip: string): Promise<string> {
  const cached = getCachedDns(ip);
  if (cached !== undefined) {
    return cached;
  }
  const hostname = await reverseLookup(ip);
  setCachedDns(ip, hostname);
  return hostname;
}

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
      source_ip: ip,
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

    // Perform reverse DNS lookup asynchronously before logging. A timeout
    // ensures logging is not delayed indefinitely when DNS is unresponsive.
    getSourceDns(ip)
      .then((source_dns) => {
        entry.source_dns = source_dns !== ip ? source_dns : undefined;
        logger[level](`[REQUEST] ${JSON.stringify(entry)}`);
      })
      .catch(() => {
        logger[level](`[REQUEST] ${JSON.stringify(entry)}`);
      });
  });

  next();
}
