import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { getJwks } from '../utils/jwks';
import { createBridgeSession, getBridgeSession } from '../services/sessionService';
import { generateAuthorizationUrl, exchangeCode, getUserInfo, decodeIdTokenHint } from '../services/oidcClientService';
import { updateSessionTokens } from '../models/session';
import { getAafConfig, getAttributeMappings } from '../models/config';
import { generateAuthCode, validateAuthCode, generateIdToken, generateAccessToken, validateAccessToken } from '../services/tokenService';
import { createAuditLog } from '../models/auditLog';
import { logger } from '../utils/logger';

type SessionWithState = { aafState?: string; bridgeState?: string };

export function discovery(req: Request, res: Response): void {
  const baseUrl = config.baseUrl;
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    userinfo_endpoint: `${baseUrl}/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'name', 'email', 'upn', 'amr', 'acr', 'auth_time'],
  });
}

export function jwks(req: Request, res: Response): void {
  res.json(getJwks());
}

export async function authorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { client_id, redirect_uri, response_type, state, nonce, id_token_hint } = req.query as Record<string, string>;

    const aafConfig = getAafConfig();
    const aafClientId = aafConfig.clientId || config.aaf.clientId;
    const aafRedirectUris = aafConfig.redirectUris.length ? aafConfig.redirectUris : config.aaf.redirectUris;

    if (client_id !== aafClientId) {
      res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
      return;
    }

    if (!aafRedirectUris.includes(redirect_uri)) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Invalid redirect_uri' });
      return;
    }

    if (response_type !== 'code') {
      res.status(400).json({ error: 'unsupported_response_type' });
      return;
    }

    // Validate id_token_hint structure if provided
    let validatedHint: string | null = null;
    if (id_token_hint) {
      const hintPayload = decodeIdTokenHint(id_token_hint);
      if (hintPayload) {
        validatedHint = id_token_hint;
      } else {
        logger.warn('Received malformed id_token_hint; ignoring');
      }
    }

    const bridgeState = uuidv4();
    const bridgeNonce = nonce || uuidv4();

    createBridgeSession(bridgeState, bridgeNonce, redirect_uri, client_id, validatedHint);

    const sess = (req.session as unknown) as SessionWithState;
    sess.aafState = state;
    sess.bridgeState = bridgeState;

    const authUrl = await generateAuthorizationUrl(bridgeState, bridgeNonce, validatedHint);

    createAuditLog('authorize_request', client_id, `redirect_uri: ${redirect_uri}`, req.ip || null);

    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
}

export async function callback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, state, error, error_description } = req.query as Record<string, string>;

    if (error) {
      logger.error(`Entra callback error: ${error} - ${error_description}`);
      res.status(400).send(`Authentication error: ${error_description || error}`);
      return;
    }

    if (!code || !state) {
      res.status(400).send('Missing code or state');
      return;
    }

    const bridgeSession = getBridgeSession(state);
    if (!bridgeSession) {
      res.status(400).send('Invalid or expired session state');
      return;
    }

    const tokenSet = await exchangeCode(code, state);
    const userClaims = await getUserInfo(tokenSet);

    // Extract AMR and ACR from Entra ID token claims
    const amrClaims = Array.isArray(userClaims['amr'])
      ? (userClaims['amr'] as unknown[]).filter((item): item is string => typeof item === 'string')
      : null;
    const acrClaims = typeof userClaims['acr'] === 'string' ? (userClaims['acr'] as string) : null;

    const mappings = getAttributeMappings();
    const mappedClaims: Record<string, unknown> = { ...userClaims };
    for (const mapping of mappings) {
      if (userClaims[mapping.source] !== undefined) {
        mappedClaims[mapping.target] = userClaims[mapping.source];
      }
    }

    updateSessionTokens(state, { access_token: tokenSet.access_token, id_token: tokenSet.id_token }, mappedClaims, amrClaims, acrClaims);

    const authCode = generateAuthCode(state);

    const sess = (req.session as unknown) as SessionWithState;
    const aafState = sess.aafState || state;

    const redirectUri = bridgeSession.aaf_redirect_uri || config.aaf.redirectUris[0];
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', authCode);
    redirectUrl.searchParams.set('state', aafState);

    createAuditLog(
      'authentication_success',
      (userClaims['preferred_username'] as string) || (userClaims['upn'] as string) || 'unknown',
      `sub: ${String(userClaims['sub'] || userClaims['oid'])}`,
      req.ip || null
    );

    res.redirect(redirectUrl.toString());
  } catch (err) {
    next(err);
  }
}

export async function token(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { grant_type, code, client_id, client_secret } = req.body as Record<string, string>;

    if (grant_type !== 'authorization_code') {
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }

    const aafConfig = getAafConfig();
    const expectedClientId = aafConfig.clientId || config.aaf.clientId;
    const expectedClientSecret = aafConfig.clientSecret || config.aaf.clientSecret;

    if (client_id !== expectedClientId || client_secret !== expectedClientSecret) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }

    const sessionState = validateAuthCode(code);
    if (!sessionState) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
      return;
    }

    const bridgeSession = getBridgeSession(sessionState);
    if (!bridgeSession || !bridgeSession.user_claims) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Session not found or missing claims' });
      return;
    }

    const userClaims = JSON.parse(bridgeSession.user_claims) as Record<string, unknown>;
    const sub = (userClaims['sub'] as string) || (userClaims['oid'] as string) || 'unknown';

    // Merge stored AMR/ACR claims into the token payload
    if (bridgeSession.amr_claims) {
      try {
        userClaims['amr'] = JSON.parse(bridgeSession.amr_claims) as string[];
      } catch {
        // ignore malformed stored value
      }
    }
    if (bridgeSession.acr_claims) {
      userClaims['acr'] = bridgeSession.acr_claims;
    }

    const idToken = await generateIdToken(userClaims, client_id, bridgeSession.nonce);
    const accessToken = await generateAccessToken(sub, client_id);

    createAuditLog('token_issued', client_id, `sub: ${sub}`, req.ip || null);

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: idToken,
      scope: 'openid profile email',
    });
  } catch (err) {
    next(err);
  }
}

export async function userinfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    const tokenStr = authHeader.substring(7);
    const payload = await validateAccessToken(tokenStr);

    if (!payload) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    res.json({ sub: payload['sub'], ...payload });
  } catch (err) {
    next(err);
  }
}
