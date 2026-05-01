import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { getJwks } from '../utils/jwks';
import { createBridgeSession, getBridgeSession, getActiveSessions } from '../services/sessionService';
import { generateAuthorizationUrl, exchangeCode, getUserInfo, verifyEntraIdToken } from '../services/oidcClientService';
import { isAafMfaConfigured, generateAafMfaAuthorizationUrl, exchangeAafMfaCode, getAafMfaUserInfo } from '../services/aafMfaService';
import { updateSessionTokens, markEntraVerified, markAafMfaVerified, setAafOriginalState, updateSessionNonce, BridgeSession } from '../models/session';
import { getAafConfig, getAafMfaConfig, getAttributeMappings } from '../models/config';
import { generateAuthCode, validateAuthCode, generateIdToken, generateAccessToken, validateAccessToken } from '../services/tokenService';
import { createAuditLog } from '../models/auditLog';
import { logger } from '../utils/logger';

type SessionWithState = { aafState?: string; bridgeState?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merges stored AMR/ACR claims from a session into the user-claims object and
 * adds AAF MFA markers when step-up was completed.  Mutates `userClaims`.
 */
function enrichClaimsWithStepUp(userClaims: Record<string, unknown>, session: BridgeSession): void {
  if (session.amr_claims) {
    try {
      const existing = JSON.parse(session.amr_claims) as string[];
      userClaims['amr'] = session.aaf_mfa_verified
        ? Array.from(new Set([...existing, 'mfa', 'aaf']))
        : existing;
    } catch (err) {
      logger.warn(`Failed to parse stored AMR claims for session ${session.id}: ${String(err)}`);
    }
  } else if (session.aaf_mfa_verified) {
    userClaims['amr'] = ['mfa', 'aaf'];
  }

  if (session.acr_claims) {
    userClaims['acr'] = session.acr_claims;
  }

  if (session.aaf_mfa_verified) {
    userClaims['aal'] = 'MFA';
  }
}

/**
 * Parses and sanitizes the `claims` query parameter for forwarding to OSP.
 * OSP only supports `acr` inside `id_token`; all other claim names are
 * stripped and a warning is logged.  Returns the sanitized JSON string, or
 * `undefined` when the `claims` parameter is absent, malformed, or contains
 * no supported claims.
 */
function sanitizeClaimsParameter(claims: string | undefined): string | undefined {
  if (!claims) return undefined;
  try {
    const parsed = JSON.parse(claims) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logger.warn('authorize: malformed claims parameter (not a JSON object); ignoring');
      return undefined;
    }
    const claimsObj = parsed as Record<string, unknown>;
    const idTokenClaims = claimsObj.id_token;
    if (idTokenClaims === null || typeof idTokenClaims !== 'object' || Array.isArray(idTokenClaims)) {
      return undefined;
    }
    const idTokenObj = idTokenClaims as Record<string, unknown>;
    const stripped = Object.keys(idTokenObj).filter(k => k !== 'acr');
    if (stripped.length > 0) {
      logger.warn(`authorize: stripping unsupported claims from 'claims' parameter (OSP only supports acr): ${stripped.join(', ')}`);
    }
    const { acr } = idTokenObj;
    return acr !== undefined ? JSON.stringify({ id_token: { acr } }) : undefined;
  } catch (err) {
    logger.warn(`authorize: malformed claims parameter; ignoring: ${String(err)}`);
    return undefined;
  }
}

export function discovery(req: Request, res: Response): void {
  const baseUrl = config.baseUrl;
  const aafMfaConfig = getAafMfaConfig();
  // The bridge is the JWT issuer and holds the signing keys, so issuer and
  // jwks_uri always point here. The authorization, token, and userinfo
  // endpoints advertise the AAF endpoints (when configured) so that Entra
  // can use them directly. This intentional proxy arrangement means the
  // issuer does not match those endpoints, which is by design.
  res.json({
    issuer: baseUrl,
    authorization_endpoint: aafMfaConfig.authorizeEndpoint || `${baseUrl}/authorize`,
    token_endpoint: aafMfaConfig.tokenEndpoint || `${baseUrl}/token`,
    userinfo_endpoint: aafMfaConfig.userInfoEndpoint || `${baseUrl}/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'name', 'email', 'upn', 'amr', 'acr', 'aal', 'auth_time'],
  });
}

export function jwks(req: Request, res: Response): void {
  res.json(getJwks());
}

// ---------------------------------------------------------------------------
// /authorize — entry point from AAF; initiates the step-up flow
// ---------------------------------------------------------------------------

export async function authorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { client_id, redirect_uri, response_type, state, nonce, id_token_hint, claims } = req.query as Record<string, string>;

    // Extract and sanitize the claims parameter — OSP only supports 'acr'
    const sanitizedClaims = sanitizeClaimsParameter(claims);

    const aafConfig = getAafConfig();
    const aafClientId = aafConfig.clientId || config.aaf.clientId;
    const aafRedirectUris = aafConfig.redirectUris.length ? aafConfig.redirectUris : config.aaf.redirectUris;

    if (client_id !== aafClientId) {
      createAuditLog('authorize_rejected', client_id || null, 'Unknown client_id', req.ip || null);
      res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
      return;
    }

    if (!aafRedirectUris.includes(redirect_uri)) {
      createAuditLog('authorize_rejected', client_id, `Invalid redirect_uri: ${redirect_uri}`, req.ip || null);
      res.status(400).json({ error: 'invalid_request', error_description: 'Invalid redirect_uri' });
      return;
    }

    if (response_type !== 'code') {
      createAuditLog('authorize_rejected', client_id, `Unsupported response_type: ${response_type}`, req.ip || null);
      res.status(400).json({ error: 'unsupported_response_type' });
      return;
    }

    if (!state) {
      createAuditLog('authorize_rejected', client_id || null, 'Missing state parameter', req.ip || null);
      res.status(400).json({ error: 'invalid_request', error_description: 'state parameter is required' });
      return;
    }

    // Cryptographically verify id_token_hint if provided
    let validatedHint: string | null = null;
    if (id_token_hint) {
      try {
        await verifyEntraIdToken(id_token_hint);
        validatedHint = id_token_hint;
      } catch {
        logger.warn('Received id_token_hint with invalid signature or claims; ignoring');
      }
    }

    const bridgeState = uuidv4();
    const bridgeNonce = nonce || uuidv4();

    createBridgeSession(bridgeState, bridgeNonce, redirect_uri, client_id, validatedHint, sanitizedClaims);

    // Persist the original AAF state in the DB so it survives all cross-domain
    // redirects without relying solely on the Express session cookie.
    if (state) {
      setAafOriginalState(bridgeState, state);
    }

    const sess = (req.session as unknown) as SessionWithState;
    sess.aafState = state;
    sess.bridgeState = bridgeState;

    createAuditLog('authorize_request', client_id, `redirect_uri: ${redirect_uri}`, req.ip || null);

    // Begin step-up: send the user to Entra ID for first-factor authentication.
    res.redirect(`/login/entra?state=${encodeURIComponent(bridgeState)}`);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// /login/entra — redirect user to Entra ID for first-factor authentication
// ---------------------------------------------------------------------------

export async function loginEntra(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { state: bridgeState } = req.query as Record<string, string>;

    if (!bridgeState) {
      createAuditLog('login_entra_failed', null, 'Missing state parameter', req.ip || null);
      res.status(400).send('Missing state parameter');
      return;
    }

    const bridgeSession = getBridgeSession(bridgeState);
    if (!bridgeSession) {
      createAuditLog('login_entra_failed', null, 'Invalid or expired session state', req.ip || null);
      res.status(400).send('Invalid or expired session state');
      return;
    }

    const sess = (req.session as unknown) as SessionWithState;
    sess.bridgeState = bridgeState;

    let nonceToUse = bridgeSession.nonce;
    if (!nonceToUse) {
      nonceToUse = uuidv4();
      updateSessionNonce(bridgeState, nonceToUse);
    }

    const authUrl = await generateAuthorizationUrl(
      bridgeState,
      nonceToUse,
      bridgeSession.id_token_hint
    );

    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// /callback/entra — Entra ID redirects here after first-factor auth
// ---------------------------------------------------------------------------

export async function callbackEntra(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, state, error, error_description } = req.query as Record<string, string>;

    if (error) {
      logger.error(`Entra callback error: ${error} - ${error_description}`);
      createAuditLog('authentication_failure', null, `Entra error: ${error} – ${error_description || ''}`, req.ip || null);
      res.status(400).json({ error: 'authentication_failed', error_description: 'Entra ID authentication failed' });
      return;
    }

    if (!code || !state) {
      createAuditLog('authentication_failure', null, 'Callback missing code or state parameter', req.ip || null);
      res.status(400).send('Missing code or state');
      return;
    }

    const bridgeSession = getBridgeSession(state);
    if (!bridgeSession) {
      createAuditLog('authentication_failure', null, 'Invalid or expired session state', req.ip || null);
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
    markEntraVerified(state);

    const userIdentifier =
      (mappedClaims['preferred_username'] as string) ||
      (mappedClaims['upn'] as string) ||
      (mappedClaims['email'] as string) ||
      'unknown';

    createAuditLog(
      'entra_auth_success',
      userIdentifier,
      `sub: ${String(mappedClaims['sub'] || mappedClaims['oid'])}`,
      req.ip || null
    );

    if (isAafMfaConfigured()) {
      // Step-up: proceed to AAF MFA second factor
      res.redirect(`/login/aaf?state=${encodeURIComponent(state)}`);
    } else {
      // No MFA configured: generate auth code and redirect directly to AAF
      const authCode = generateAuthCode(state);

      const sess = (req.session as unknown) as SessionWithState;
      const aafState = sess.aafState || bridgeSession.aaf_original_state || state;

      const redirectUri = bridgeSession.aaf_redirect_uri || config.aaf.redirectUris[0];
      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set('code', authCode);
      redirectUrl.searchParams.set('state', aafState);

      createAuditLog(
        'authentication_success',
        userIdentifier,
        `sub: ${String(mappedClaims['sub'] || mappedClaims['oid'])}`,
        req.ip || null
      );

      res.redirect(redirectUrl.toString());
    }
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// /callback — backward-compatible alias for /callback/entra
// ---------------------------------------------------------------------------

export const callback = callbackEntra;

// ---------------------------------------------------------------------------
// /login/aaf — redirect user to AAF for MFA (second factor)
// ---------------------------------------------------------------------------

export async function loginAaf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { state: bridgeState } = req.query as Record<string, string>;

    if (!bridgeState) {
      createAuditLog('login_aaf_failed', null, 'Missing state parameter', req.ip || null);
      res.status(400).send('Missing state parameter');
      return;
    }

    const bridgeSession = getBridgeSession(bridgeState);
    if (!bridgeSession) {
      createAuditLog('login_aaf_failed', null, 'Invalid or expired session state', req.ip || null);
      res.status(400).send('Invalid or expired session state');
      return;
    }

    if (!bridgeSession.entra_verified) {
      createAuditLog('login_aaf_failed', null, 'Entra authentication not yet completed', req.ip || null);
      res.status(400).send('First-factor authentication (Entra ID) has not been completed');
      return;
    }

    const callbackUri = `${config.baseUrl}/callback/aaf`;
    const aafMfaUrl = generateAafMfaAuthorizationUrl(bridgeState, callbackUri, bridgeSession.requested_claims);

    createAuditLog('aaf_mfa_initiated', null, `bridgeState: ${bridgeState}`, req.ip || null);

    res.redirect(aafMfaUrl);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// /callback/aaf — AAF MFA redirects here after second-factor completion
// ---------------------------------------------------------------------------

export async function callbackAaf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, state: bridgeState, error, error_description } = req.query as Record<string, string>;

    if (error) {
      logger.error(`AAF MFA callback error: ${error} - ${error_description}`);
      createAuditLog('aaf_mfa_failure', null, `AAF error: ${error} – ${error_description || ''}`, req.ip || null);
      res.status(400).json({ error: 'mfa_failed', error_description: 'AAF MFA authentication failed' });
      return;
    }

    if (!bridgeState) {
      createAuditLog('aaf_mfa_failure', null, 'Callback missing state parameter', req.ip || null);
      res.status(400).send('Missing state parameter');
      return;
    }

    const bridgeSession = getBridgeSession(bridgeState);
    if (!bridgeSession) {
      createAuditLog('aaf_mfa_failure', null, 'Invalid or expired session state', req.ip || null);
      res.status(400).send('Invalid or expired session state');
      return;
    }

    if (!bridgeSession.entra_verified) {
      createAuditLog('aaf_mfa_failure', null, 'Entra auth not verified for this session', req.ip || null);
      res.status(400).send('First-factor (Entra) authentication is missing');
      return;
    }

    if (!code) {
      createAuditLog('aaf_mfa_failure', null, 'Callback missing code parameter', req.ip || null);
      res.status(400).send('Missing authorization code');
      return;
    }

    // Exchange the AAF MFA code to verify completion (if token endpoint configured)
    const callbackUri = `${config.baseUrl}/callback/aaf`;
    const mfaResult = await exchangeAafMfaCode(code, bridgeState, callbackUri);
    if (!mfaResult.verified) {
      createAuditLog('aaf_mfa_failure', null, 'AAF MFA code exchange failed', req.ip || null);
      res.status(400).send('AAF MFA verification failed');
      return;
    }

    // Fetch additional claims from AAF MFA userinfo and merge them into the session.
    // Core OIDC claims (sub, iss, aud, iat, exp) are preserved from the original
    // session to prevent claim injection from a potentially compromised AAF endpoint.
    if (mfaResult.accessToken) {
      const aafUserInfo = await getAafMfaUserInfo(mfaResult.accessToken);
      if (Object.keys(aafUserInfo).length > 0 && bridgeSession.user_claims) {
        const existingClaims = JSON.parse(bridgeSession.user_claims) as Record<string, unknown>;
        // Merge AAF claims additively; core OIDC claims from the original session take precedence
        const PROTECTED_CLAIMS = new Set(['sub', 'iss', 'aud', 'iat', 'exp', 'nonce']);
        const safeMfaClaims = Object.fromEntries(
          Object.entries(aafUserInfo).filter(([k]) => !PROTECTED_CLAIMS.has(k))
        );
        const mergedClaims = { ...existingClaims, ...safeMfaClaims };
        const entraTokens = bridgeSession.entra_tokens
          ? JSON.parse(bridgeSession.entra_tokens) as object
          : {};
        const existingAmrClaims = bridgeSession.amr_claims
          ? JSON.parse(bridgeSession.amr_claims) as string[]
          : null;
        updateSessionTokens(bridgeState, entraTokens, mergedClaims, existingAmrClaims, bridgeSession.acr_claims);
      }
    }

    markAafMfaVerified(bridgeState);

    // Generate the final authorization code for the original AAF OIDC client
    const authCode = generateAuthCode(bridgeState);

    const sess = (req.session as unknown) as SessionWithState;
    const aafOriginalState = sess.aafState || bridgeSession.aaf_original_state || bridgeState;

    const redirectUri = bridgeSession.aaf_redirect_uri || config.aaf.redirectUris[0];
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', authCode);
    redirectUrl.searchParams.set('state', aafOriginalState);

    createAuditLog('aaf_mfa_success', null, `bridgeState: ${bridgeState}`, req.ip || null);
    createAuditLog('authentication_success', null, `Step-up complete for bridgeState: ${bridgeState}`, req.ip || null);

    res.redirect(redirectUrl.toString());
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// /token — AAF exchanges the authorization code for tokens
// ---------------------------------------------------------------------------

export async function token(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { grant_type, code, client_id, client_secret } = req.body as Record<string, string>;

    if (grant_type !== 'authorization_code') {
      createAuditLog('token_request_failed', client_id || null, `Unsupported grant_type: ${grant_type}`, req.ip || null);
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }

    const aafConfig = getAafConfig();
    const expectedClientId = aafConfig.clientId || config.aaf.clientId;
    const expectedClientSecret = aafConfig.clientSecret || config.aaf.clientSecret;

    if (client_id !== expectedClientId || client_secret !== expectedClientSecret) {
      createAuditLog('token_request_failed', client_id || null, 'Invalid client credentials', req.ip || null);
      res.status(401).json({ error: 'invalid_client' });
      return;
    }

    const sessionState = validateAuthCode(code);
    if (!sessionState) {
      createAuditLog('token_request_failed', client_id, 'Invalid or expired authorization code', req.ip || null);
      res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
      return;
    }

    const bridgeSession = getBridgeSession(sessionState);
    if (!bridgeSession || !bridgeSession.user_claims) {
      createAuditLog('token_request_failed', client_id, 'Session not found or missing claims', req.ip || null);
      res.status(400).json({ error: 'invalid_grant', error_description: 'Session not found or missing claims' });
      return;
    }

    // When step-up is configured, both factors must be verified before tokens
    // are issued.
    if (isAafMfaConfigured() && !bridgeSession.aaf_mfa_verified) {
      createAuditLog('token_request_failed', client_id, 'AAF MFA not completed for this session', req.ip || null);
      res.status(400).json({ error: 'invalid_grant', error_description: 'Step-up MFA not completed' });
      return;
    }

    const userClaims = JSON.parse(bridgeSession.user_claims) as Record<string, unknown>;
    const sub = (userClaims['sub'] as string) || (userClaims['oid'] as string) || 'unknown';

    // Merge AMR/ACR claims and inject step-up context using the shared helper
    enrichClaimsWithStepUp(userClaims, bridgeSession);

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

// ---------------------------------------------------------------------------
// /userinfo — returns claims for a valid access token
// ---------------------------------------------------------------------------

export async function userinfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      createAuditLog('userinfo_failed', null, 'Missing or malformed Authorization header', req.ip || null);
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    const tokenStr = authHeader.substring(7);
    const payload = await validateAccessToken(tokenStr);

    if (!payload) {
      createAuditLog('userinfo_failed', null, 'Invalid or expired access token', req.ip || null);
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    const sub = payload['sub'] as string;

    // Look up the active session to return enriched claims (amr/acr/aal) rather
    // than just the raw access-token payload.
    const sessions = getActiveSessions();
    const session = sessions.find(s => {
      if (!s.user_claims) return false;
      try {
        const c = JSON.parse(s.user_claims) as Record<string, unknown>;
        return (c['sub'] as string) === sub || (c['oid'] as string) === sub;
      } catch { return false; }
    });

    if (session?.user_claims) {
      const userClaims = JSON.parse(session.user_claims) as Record<string, unknown>;
      enrichClaimsWithStepUp(userClaims, session);
      res.json({ sub, ...userClaims });
    } else {
      res.json({ sub, ...payload });
    }
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// /entra-login — removed; retained as 410 Gone for graceful deprecation
// ---------------------------------------------------------------------------

export function entraLogin(_req: Request, res: Response): void {
  res.status(410).json({
    error: 'endpoint_removed',
    error_description: 'The /entra-login endpoint has been removed. Use the standard OIDC authorization code flow via /authorize.',
  });
}
