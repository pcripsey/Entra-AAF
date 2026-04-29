import { logger } from '../utils/logger';

const SENSITIVE_QUERY_PARAMS = new Set([
  'client_secret',
  'secret',
  'code',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
]);

function sanitizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const param of SENSITIVE_QUERY_PARAMS) {
      if (u.searchParams.has(param)) {
        u.searchParams.set(param, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function destinationDnsFromUrl(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return raw;
  }
}

/**
 * Wraps an async function call with outbound HTTP request logging.
 * Logs destination DNS name, method, URL (sensitive params redacted),
 * duration, and success/error status.
 */
export async function logOutboundRequest<T>(
  method: string,
  url: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const destination_dns = destinationDnsFromUrl(url);
  const safeUrl = sanitizeUrl(url);

  try {
    const result = await fn();
    const duration = Date.now() - start;
    logger.info(
      `[OUTBOUND] ${JSON.stringify({ method, url: safeUrl, destination_dns, status: 'success', duration: `${duration}ms` })}`,
    );
    return result;
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const errorMessage =
      err instanceof Error
        ? err.message.split('\n')[0].substring(0, 200)
        : 'Unknown error';
    logger.warn(
      `[OUTBOUND] ${JSON.stringify({ method, url: safeUrl, destination_dns, status: 'error', error: errorMessage, duration: `${duration}ms` })}`,
    );
    throw err;
  }
}
