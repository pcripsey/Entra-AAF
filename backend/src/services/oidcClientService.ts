import { Issuer, Client, TokenSet } from 'openid-client';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getEntraConfig } from '../models/config';
import { config } from '../config';
import { logger } from '../utils/logger';
import { logEntraOutbound, sanitizeObject } from '../middleware/outboundLogger';

let cachedClient: Client | null = null;
let cachedTenantId = '';

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
export async function verifyEntraIdToken(idToken: string): Promise<Record<string, unknown>> {
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

  const JWKS = createRemoteJWKSet(new URL(jwksUri));

  const { payload } = await jwtVerify(idToken, JWKS, {
    algorithms: ['RS256'],
    issuer: expectedIssuer,
    audience: clientId,
    clockTolerance: 60,
  });

  logger.debug('Entra ID token signature verified successfully');
  return payload as Record<string, unknown>;
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
