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

const SENSITIVE_BODY_FIELDS = new Set([
  'client_secret',
  'code',
  'access_token',
  'refresh_token',
  'id_token',
  'nonce',
  'id_token_hint',
  'password',
]);

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
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
 * Redacts sensitive fields in a flat object, replacing their values with
 * "[REDACTED]".  Non-sensitive fields are passed through unchanged.
 *
 * Note: only top-level keys are inspected.  Nested objects are not
 * recursively sanitized, so callers should only pass flat structures
 * (e.g. token-set responses, POST body parameters) whose sensitive values
 * all live at the top level.
 */
export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = SENSITIVE_BODY_FIELDS.has(key) ? '[REDACTED]' : value;
  }
  return result;
}

/**
 * Redacts sensitive HTTP header values (e.g. Authorization), replacing them
 * with "[REDACTED]".
 */
export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const sanitized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return sanitized;
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

/**
 * Wraps an async call to Entra ID with detailed debug-level logging.
 *
 * Before the call logs `[ENTRA REQUEST]` with method, URL and optional
 * sanitized request details.  After a successful call logs `[ENTRA RESPONSE]`
 * including an optional transformed representation of the result.  On failure
 * logs `[ENTRA RESPONSE ERROR]`.  All sensitive fields are redacted via
 * `sanitizeObject` / `sanitizeHeaders` before logging.
 *
 * The existing `[OUTBOUND]` info/warn log is still emitted so that existing
 * monitoring based on that tag is unaffected.
 */
export async function logEntraOutbound<T>(
  method: string,
  url: string,
  requestDetails: Record<string, unknown> | undefined,
  fn: () => Promise<T>,
  responseTransformer?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const start = Date.now();
  const destination_dns = destinationDnsFromUrl(url);
  const safeUrl = sanitizeUrl(url);

  const safeRequestDetails = requestDetails ? sanitizeObject(requestDetails) : undefined;
  logger.debug(
    `[ENTRA REQUEST] ${JSON.stringify({
      method,
      url: safeUrl,
      ...(safeRequestDetails ? { body: safeRequestDetails } : {}),
    })}`,
  );

  try {
    const result = await fn();
    const duration = Date.now() - start;

    logger.info(
      `[OUTBOUND] ${JSON.stringify({ method, url: safeUrl, destination_dns, status: 'success', duration: `${duration}ms` })}`,
    );

    const responseData = responseTransformer ? responseTransformer(result) : undefined;
    logger.debug(
      `[ENTRA RESPONSE] ${JSON.stringify({
        method,
        url: safeUrl,
        status: 'success',
        duration: `${duration}ms`,
        ...(responseData ? { response: responseData } : {}),
      })}`,
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
    logger.debug(
      `[ENTRA RESPONSE ERROR] ${JSON.stringify({ method, url: safeUrl, status: 'error', error: errorMessage, duration: `${duration}ms` })}`,
    );
    throw err;
  }
}
