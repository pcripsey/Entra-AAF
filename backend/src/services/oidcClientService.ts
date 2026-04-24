import { Issuer, Client, TokenSet } from 'openid-client';
import { getEntraConfig } from '../models/config';
import { config } from '../config';
import { logger } from '../utils/logger';

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
  const issuer = await Issuer.discover(
    `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
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

export async function generateAuthorizationUrl(state: string, nonce: string): Promise<string> {
  const client = await getEntraClient();
  const entraConfig = getEntraConfig();
  return client.authorizationUrl({
    scope: 'openid profile email',
    state,
    nonce,
    redirect_uri: entraConfig.redirectUri || config.entra.redirectUri,
  });
}

export async function exchangeCode(code: string, state: string): Promise<TokenSet> {
  const client = await getEntraClient();
  const entraConfig = getEntraConfig();
  const tokenSet = await client.callback(
    entraConfig.redirectUri || config.entra.redirectUri,
    { code, state },
    { state }
  );
  return tokenSet;
}

export async function getUserInfo(tokenSet: TokenSet): Promise<Record<string, unknown>> {
  const claims = tokenSet.claims();
  return claims as Record<string, unknown>;
}

export function invalidateClientCache(): void {
  cachedClient = null;
  cachedTenantId = '';
}
