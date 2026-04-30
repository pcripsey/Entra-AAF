import { config } from '../config';
import { getAafMfaConfig } from '../models/config';
import { logger } from '../utils/logger';

/**
 * Returns true when the AAF MFA step-up flow is configured.
 * Step-up is enabled when an AAF authorize endpoint is set either via the
 * environment variable AAF_AUTHORIZE_ENDPOINT or via the admin-configured
 * aafMfa.authorizeEndpoint database value.
 */
export function isAafMfaConfigured(): boolean {
  const dbConfig = getAafMfaConfig();
  const authorizeEndpoint =
    dbConfig.authorizeEndpoint || config.aafMfa.authorizeEndpoint;
  return !!authorizeEndpoint;
}

/**
 * Builds the authorization URL that the bridge uses to redirect the user to
 * AAF for MFA (the bridge acts as an OIDC client to AAF's authorization
 * server in this hop).
 *
 * @param bridgeState  The bridge's own session state, passed as the OAuth2
 *                     `state` parameter so that AAF returns it verbatim and
 *                     the bridge can correlate the callback.
 * @param callbackUri  The bridge's callback URI that AAF will redirect to
 *                     after MFA (e.g. `{BASE_URL}/callback/aaf`).
 */
export function generateAafMfaAuthorizationUrl(
  bridgeState: string,
  callbackUri: string
): string {
  const dbConfig = getAafMfaConfig();
  const authorizeEndpoint =
    dbConfig.authorizeEndpoint || config.aafMfa.authorizeEndpoint;
  const clientId = dbConfig.clientId || config.aafMfa.clientId;

  if (!authorizeEndpoint) {
    throw new Error('AAF MFA authorize endpoint is not configured');
  }

  const url = new URL(authorizeEndpoint);
  url.searchParams.set('response_type', 'code');
  if (clientId) {
    url.searchParams.set('client_id', clientId);
  }
  url.searchParams.set('redirect_uri', callbackUri);
  url.searchParams.set('state', bridgeState);
  url.searchParams.set('scope', 'openid');

  return url.toString();
}

/**
 * Exchanges the AAF MFA authorization code for tokens in order to verify
 * that MFA was actually completed.  Returns `true` when the exchange
 * succeeds, `false` otherwise.
 *
 * If no AAF token endpoint is configured the bridge trusts the callback
 * state correlation alone and returns `true`.
 */
export async function exchangeAafMfaCode(
  code: string,
  bridgeState: string,
  callbackUri: string
): Promise<boolean> {
  const dbConfig = getAafMfaConfig();
  const tokenEndpoint = dbConfig.tokenEndpoint || config.aafMfa.tokenEndpoint;
  const clientId = dbConfig.clientId || config.aafMfa.clientId;
  const clientSecret = dbConfig.clientSecret || config.aafMfa.clientSecret;

  if (!tokenEndpoint) {
    // No token endpoint configured — trust state correlation alone.
    // NOTE: For production deployments, configure AAF_TOKEN_ENDPOINT so the
    // bridge can cryptographically verify that the MFA code was issued by AAF
    // and has not been replayed.  Without it, anyone who can observe a valid
    // bridgeState value could forge a callback.
    logger.warn(`AAF MFA: no token endpoint configured; trusting state correlation for bridgeState=${bridgeState}. Set AAF_TOKEN_ENDPOINT for production.`);
    return true;
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUri,
      state: bridgeState,
    });
    if (clientId) body.set('client_id', clientId);
    if (clientSecret) body.set('client_secret', clientSecret);

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error(`AAF MFA token exchange failed: ${response.status} ${text}`);
      return false;
    }

    return true;
  } catch (err) {
    logger.error(`AAF MFA token exchange error: ${String(err)}`);
    return false;
  }
}
