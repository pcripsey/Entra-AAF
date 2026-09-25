import { Issuer, Client, TokenSet } from 'openid-client';
import { compactVerify, createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { getEntraConfig } from '../models/config';
import { config } from '../config';
import { logger } from '../utils/logger';
import { logEntraOutbound, sanitizeObject } from '../middleware/outboundLogger';

let cachedClient: Client | null = null;
let cachedTenantId = '';

type JwtVerificationKey = Parameters<typeof compactVerify>[1];

interface EntraJwtVerificationContext {
  clientId: string;
  expectedIssuer: string;
  jwks: JwtVerificationKey;
}

interface EntraJwtVerificationOverrides {
  context?: EntraJwtVerificationContext;
  currentDate?: Date;
}

function parseNumericDateClaim(payload: Record<string, unknown>, claim: 'iat' | 'exp' | 'nbf'): number | null {
  const value = payload[claim];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function validateJwtAudience(payload: Record<string, unknown>, expectedAudience: string): void {
  const aud = payload['aud'];
  if (typeof aud === 'string') {
    if (aud !== expectedAudience) {
      throw new Error('JWT audience claim mismatch');
    }
    return;
  }

  if (Array.isArray(aud) && aud.every((value): value is string => typeof value === 'string')) {
    if (!aud.includes(expectedAudience)) {
      throw new Error('JWT audience claim mismatch');
    }
    return;
  }

  throw new Error('JWT audience claim is missing or invalid');
}

function validateStringClaim(payload: Record<string, unknown>, claim: string): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`JWT missing required ${claim} claim`);
  }
  return value;
}

async function getEntraJwtVerificationContext(): Promise<EntraJwtVerificationContext> {
  const entraConfig = getEntraConfig();
  const clientId = entraConfig.clientId || config.entra.clientId;

  // getEntraClient() performs OIDC discovery and caches the result, so calling
  // it here avoids a redundant discovery round-trip on subsequent requests.
  const client = await getEntraClient();

  const jwksUri = client.issuer.metadata.jwks_uri as string | undefined;
  const expectedIssuer = client.issuer.metadata.issuer as string | undefined;

  if (!jwksUri || !expectedIssuer) {
    throw new Error('Entra ID OIDC discovery did not return required metadata (jwks_uri, issuer)');
  }

  return {
    clientId,
    expectedIssuer,
    jwks: createRemoteJWKSet(new URL(jwksUri)),
  };
}

export async function getEntraClient(): Promise<Client> {
  const entraConfig = getEntraConfig();
  const tenantId = entraConfig.tenantId || config.entra.tenantId;
  const clientId = entraConfig.clientId || config.entra.clientId;
  const clientSecret = entraConfig.clientSecret || config.entra.clientSecret;
  const redirectUri = entraConfig.redirectUri || config.entra.redirectUri;

  if (cachedClient && cachedTenantId === tenantId) {
    return cachedClient;
  }

  if (!tenantId || !clientId) {
    throw new Error('Entra ID not configured');
  }

  logger.info(`Discovering Entra ID OIDC configuration for tenant: ${tenantId}`);
  const discoveryUrl =
    config.entra.discoveryUrl ||
    `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
  const issuer = await logEntraOutbound(
    'GET',
    discoveryUrl,
    undefined,
    () => Issuer.discover(discoveryUrl),
    (result) => ({ metadata: result.metadata as Record<string, unknown> }),
  );

  cachedClient = new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [redirectUri],
    response_types: ['code'],
  });

  cachedTenantId = tenantId;
  return cachedClient;
}

export async function generateAuthorizationUrl(state: string, nonce: string, idTokenHint?: string | null): Promise<string> {
  const client = await getEntraClient();
  const entraConfig = getEntraConfig();
  const params: Record<string, string> = {
    scope: 'openid profile email',
    state,
    nonce,
    redirect_uri: entraConfig.redirectUri || config.entra.redirectUri,
  };
  if (idTokenHint) {
    params['id_token_hint'] = idTokenHint;
  }
  return client.authorizationUrl(params);
}

export async function exchangeCode(code: string, state: string): Promise<TokenSet> {
  const client = await getEntraClient();
  const entraConfig = getEntraConfig();
  // Use the token endpoint from the discovered issuer metadata for logging;
  // client.callback() will use the same endpoint internally.
  const tokenEndpoint =
    (client.issuer.token_endpoint as string | undefined) ||
    'https://login.microsoftonline.com/oauth2/v2.0/token';
  const redirectUri = entraConfig.redirectUri || config.entra.redirectUri;

  // Build a representative request body for logging purposes only.  The
  // actual POST body is assembled and sent by openid-client internally;
  // this object captures the expected fields so operators can see what
  // was (approximately) sent to the token endpoint.  Sensitive values are
  // redacted by sanitizeObject() before they reach the log.
  const requestBody: Record<string, unknown> = {
    grant_type: 'authorization_code',
    client_id: entraConfig.clientId || config.entra.clientId,
    redirect_uri: redirectUri,
    code,
    client_secret: entraConfig.clientSecret || config.entra.clientSecret,
  };

  const tokenSet = await logEntraOutbound(
    'POST',
    tokenEndpoint,
    requestBody,
    () => client.callback(redirectUri, { code, state }, { state }),
    (result) => sanitizeObject(result as unknown as Record<string, unknown>),
  );
  return tokenSet;
}

export async function getUserInfo(tokenSet: TokenSet): Promise<Record<string, unknown>> {
  const client = await getEntraClient();
  const idTokenClaims = tokenSet.claims() as Record<string, unknown>;
  if (tokenSet.access_token) {
    try {
      const userinfoEndpoint = client.issuer.metadata.userinfo_endpoint as string | undefined;
      const accessToken = tokenSet.access_token;
      if (userinfoEndpoint) {
        const userInfoClaims = await logEntraOutbound(
          'GET',
          userinfoEndpoint,
          undefined,
          () => client.userinfo(accessToken) as Promise<Record<string, unknown>>,
          (result) => result as Record<string, unknown>,
        );
        return { ...idTokenClaims, ...userInfoClaims };
      }
    } catch (err) {
      logger.warn(`getUserInfo: Entra userinfo call failed, using ID token claims: ${String(err)}`);
    }
  }
  return idTokenClaims;
}

/**
 * Verifies an Entra ID token's cryptographic signature against Microsoft's JWKS
 * endpoint and validates standard OIDC claims (iss, aud, exp).
 *
 * The JWKS URI and expected issuer are resolved dynamically via the Entra OIDC
 * discovery document, using the same cached client as the rest of the service.
 *
 * Returns the verified token payload on success, or throws on failure.
 */
export async function verifyEntraIdToken(
  idToken: string,
  overrides?: EntraJwtVerificationOverrides
): Promise<Record<string, unknown>> {
  const { clientId, expectedIssuer, jwks } = overrides?.context ?? await getEntraJwtVerificationContext();

  const { payload } = await jwtVerify(idToken, jwks, {
    algorithms: ['RS256'],
    issuer: expectedIssuer,
    audience: clientId,
    clockTolerance: 60,
    currentDate: overrides?.currentDate,
  });

  logger.debug('Entra ID token signature verified successfully');
  return payload as Record<string, unknown>;
}

/**
 * Verifies an Entra EAM handoff token (`request` or `id_token_hint`) while
 * intentionally allowing an already-expired JWT when it was issued recently
 * enough to satisfy anti-replay limits.
 */
export async function verifyEntraEamRequestToken(
  token: string,
  overrides?: EntraJwtVerificationOverrides
): Promise<Record<string, unknown>> {
  const context = overrides?.context ?? await getEntraJwtVerificationContext();
  const currentDate = overrides?.currentDate ?? new Date();

  await compactVerify(token, context.jwks, {
    algorithms: ['RS256'],
  });

  const payload = decodeJwt(token) as Record<string, unknown>;

  if (payload['iss'] !== context.expectedIssuer) {
    throw new Error('JWT issuer claim mismatch');
  }

  validateJwtAudience(payload, context.clientId);

  const iat = parseNumericDateClaim(payload, 'iat');
  if (iat === null) {
    throw new Error('JWT missing required iat claim');
  }

  const nowSeconds = Math.floor(currentDate.getTime() / 1000);
  if (iat > nowSeconds + 60) {
    throw new Error('JWT iat claim is in the future');
  }

  const maxTokenAgeSeconds = config.entraEam.maxTokenAgeSeconds;
  if (nowSeconds - iat > maxTokenAgeSeconds + 60) {
    throw new Error(`JWT exceeds maximum allowed EAM age of ${maxTokenAgeSeconds} seconds`);
  }

  // EAM handoff tokens are Microsoft-signed identity assertions. Require the
  // stable identity claims the rest of the bridge relies on when seeding the
  // Entra-initiated session.
  validateStringClaim(payload, 'sub');
  validateStringClaim(payload, 'oid');
  validateStringClaim(payload, 'tid');

  const nbf = parseNumericDateClaim(payload, 'nbf');
  if (nbf !== null && nbf > nowSeconds + 60) {
    throw new Error('JWT nbf claim is in the future');
  }

  const exp = parseNumericDateClaim(payload, 'exp');
  if (exp === null) {
    throw new Error('JWT missing required exp claim');
  }

  if (exp < iat) {
    throw new Error('JWT exp claim predates iat');
  }

  if (nowSeconds - exp > maxTokenAgeSeconds + 60) {
    throw new Error(`JWT expiration is older than the allowed EAM grace window of ${maxTokenAgeSeconds} seconds`);
  }

  if (exp >= nowSeconds - 60) {
    logger.debug('Entra EAM handoff token verified successfully (not expired)');
  } else {
    logger.debug('Entra EAM handoff token verified successfully (expired-but-fresh)');
  }

  return payload;
}

export function decodeIdTokenHint(hint: string): Record<string, unknown> | null {
  try {
    const parts = hint.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const payloadJson = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function invalidateClientCache(): void {
  cachedClient = null;
  cachedTenantId = '';
}
