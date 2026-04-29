import { Issuer, Client, TokenSet } from 'openid-client';
import { getEntraConfig } from '../models/config';
import { config } from '../config';
import { logger } from '../utils/logger';
import { logOutboundRequest } from '../middleware/outboundLogger';

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
  const discoveryUrl = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
  const issuer = await logOutboundRequest('GET', discoveryUrl, () =>
    Issuer.discover(discoveryUrl),
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
  const tokenSet = await logOutboundRequest('POST', tokenEndpoint, () =>
    client.callback(redirectUri, { code, state }, { state }),
  );
  return tokenSet;
}

export async function getUserInfo(tokenSet: TokenSet): Promise<Record<string, unknown>> {
  const claims = tokenSet.claims();
  return claims as Record<string, unknown>;
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
