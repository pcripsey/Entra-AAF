import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import { config } from '../config';
import { getJwks } from '../utils/jwks';
import { createBridgeSession, getBridgeSession, getActiveSessions } from '../services/sessionService';
import { generateAuthorizationUrl, exchangeCode, getUserInfo, verifyEntraIdToken, decodeIdTokenHint } from '../services/oidcClientService';
import { isAafMfaConfigured, generateAafMfaAuthorizationUrl, exchangeAafMfaCode, getAafMfaUserInfo } from '../services/aafMfaService';
import { updateSessionTokens, markEntraVerified, markAafMfaVerified, setAafOriginalState, updateSessionNonce, BridgeSession } from '../models/session';
import { getAafConfig, getAttributeMappings, getScopesSupported, getClaimsSupported } from '../models/config';
import { generateAuthCode, validateAuthCode, generateIdToken, generateAccessToken, validateAccessToken } from '../services/tokenService';
import { createAuditLog } from '../models/auditLog';
import { logger } from '../utils/logger';

type SessionWithState = { aafState?: string; bridgeState?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Synthesises the bridge's own AMR/ACR claims from session state and writes
 * them into the user-claims object.  Mutates `userClaims`.
 *
 * Entra's internal amr (e.g. ["pwd", "mfa"]) is consumed internally for
 * step-up logic and must NOT be forwarded to AAF.
 */
function enrichClaimsWithStepUp(userClaims: Record<string, unknown>, session: BridgeSession): void {
  if (session.aaf_mfa_verified) {
    userClaims['amr'] = ['mfa'];   // array required by OIDC spec and Entra
  } else if (session.entra_verified) {
    userClaims['amr'] = ['pwd'];   // array required by OIDC spec and Entra
  } else {
    delete userClaims['amr'];             // incomplete - omit entirely
  }

  if (session.acr_claims) {
    userClaims['acr'] = session.acr_claims;
  } else if (session.aaf_mfa_verified) {
    // Default ACR for completed AAF MFA — satisfies Entra EAM's
    // possessionorinherence requirement when no explicit acr was stored.
    userClaims['acr'] = 'possessionorinherence';
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
  const discoveryDoc = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/entra-eam`,
    token_endpoint: `${baseUrl}/token`,
    userinfo_endpoint: `${baseUrl}/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    response_types_supported: ['code', 'id_token'],
    response_modes_supported: ['query', 'fragment', 'form_post'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: getScopesSupported(),
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    claims_supported: getClaimsSupported(),
  };
  logger.debug(
    `[ENTRA INBOUND] ${JSON.stringify({
      event: 'discovery_request',
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      ...(req.headers['x-forwarded-for'] ? { x_forwarded_for: req.headers['x-forwarded-for'] } : {}),
      host: req.headers['host'],
      response: discoveryDoc,
    })}`,
  );
  res.json(discoveryDoc);
}

export function jwks(req: Request, res: Response): void {
  const jwksPayload = getJwks();
  logger.debug(
    `[ENTRA INBOUND] ${JSON.stringify({
      event: 'jwks_request',
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      ...(req.headers['x-forwarded-for'] ? { x_forwarded_for: req.headers['x-forwarded-for'] } : {}),
      host: req.headers['host'],
      response: jwksPayload,
    })}`,
  );
  res.json(jwksPayload);
}

// ---------------------------------------------------------------------------
// /authorize — entry point from AAF; initiates the step-up flow
// ---------------------------------------------------------------------------

export async function authorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Merge query-string and POST-body parameters.  req.body takes precedence
    // so that Entra EAM requests (response_mode=form_post) are handled correctly —
    // Entra sends all parameters as form fields with no query string.
    const params = { ...req.query, ...(req.body as Record<string, string>) } as Record<string, string>;
    const {
      client_id,
      redirect_uri,
      response_type,
      state,
      nonce,
      id_token_hint,
      claims,
      code_challenge,
      code_challenge_method,
    } = params;

    // Extract and sanitize the claims parameter — OSP only supports 'acr'
    const sanitizedClaims = sanitizeClaimsParameter(claims);

    const aafConfig = getAafConfig();
    const aafClientId = aafConfig.clientId || config.aaf.clientId;
    const aafRedirectUris = aafConfig.redirectUris.length ? aafConfig.redirectUris : config.aaf.redirectUris;

    if (client_id !== aafClientId) {
      createAuditLog('authorize_rejected', client_id || null, `Unknown client_id: received "${client_id || '(none)'}", expected "${aafClientId}"`, req.ip || null);
      res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
      return;
    }

    if (!aafRedirectUris.includes(redirect_uri)) {
      createAuditLog('authorize_rejected', client_id, `Invalid redirect_uri: ${redirect_uri}`, req.ip || null);
      res.status(400).json({ error: 'invalid_request', error_description: 'Invalid redirect_uri' });
      return;
    }

    if (response_type !== 'code' && response_type !== 'id_token') {
      createAuditLog('authorize_rejected', client_id, `Unsupported response_type: ${response_type}`, req.ip || null);
      res.status(400).json({ error: 'unsupported_response_type' });
      return;
    }

    const isEntraInitiated = response_type === 'id_token';

    if (!state) {
      createAuditLog('authorize_rejected', client_id || null, 'Missing state parameter', req.ip || null);
      res.status(400).json({ error: 'invalid_request', error_description: 'state parameter is required' });
      return;
    }

    // Validate PKCE parameters if provided (RFC 7636)
    if (code_challenge) {
      if (code_challenge_method && code_challenge_method !== 'S256' && code_challenge_method !== 'plain') {
        createAuditLog('authorize_rejected', client_id, `Unsupported code_challenge_method: ${code_challenge_method}`, req.ip || null);
        res.status(400).json({ error: 'invalid_request', error_description: 'Unsupported code_challenge_method; use S256 or plain' });
        return;
      }
    }

    // Cryptographically verify id_token_hint if provided
    let validatedHint: string | null = null;
    let hintClaims: Record<string, unknown> | null = null;
    if (id_token_hint) {
      try {
        await verifyEntraIdToken(id_token_hint);
        validatedHint = id_token_hint;
        hintClaims = decodeIdTokenHint(id_token_hint);
      } catch {
        logger.warn('Received id_token_hint with invalid signature or claims; ignoring');
      }
    }

    const bridgeState = uuidv4();
    const bridgeNonce = nonce || uuidv4();

    createBridgeSession(
      bridgeState,
      bridgeNonce,
      redirect_uri,
      client_id,
      validatedHint,
      sanitizedClaims,
      isEntraInitiated,
      null,
      code_challenge || null,
      code_challenge_method || null
    );

    // Persist the original AAF state in the DB so it survives all cross-domain
    // redirects without relying solely on the Express session cookie.
    if (state) {
      setAafOriginalState(bridgeState, state);
    }

    const sess = (req.session as unknown) as SessionWithState;
    sess.aafState = state;
    sess.bridgeState = bridgeState;

    createAuditLog('authorize_request', client_id, `redirect_uri: ${redirect_uri}`, req.ip || null);

    // When a cryptographically-verified id_token_hint is present, Entra first-
    // factor authentication has already been completed by the caller.  Skip the
    // Entra redirect and proceed directly to AAF MFA (second factor).
    if (validatedHint && hintClaims) {
      const mappedClaims: Record<string, unknown> = { ...hintClaims };
      // Strip Entra's internal amr/acr — bridge synthesises its own
      delete mappedClaims['amr'];
      delete mappedClaims['acr'];
      updateSessionTokens(bridgeState, {}, mappedClaims, null, null);
      markEntraVerified(bridgeState);

      const userIdentifier =
        (mappedClaims['preferred_username'] as string) ||
        (mappedClaims['upn'] as string) ||
        (mappedClaims['email'] as string) ||
        'unknown';

      createAuditLog(
        'entra_auth_via_hint',
        userIdentifier,
        `Entra 1FA satisfied by id_token_hint; bridgeState: ${bridgeState}`,
        req.ip || null
      );

      if (isAafMfaConfigured()) {
        res.redirect(`/login/aaf?state=${encodeURIComponent(bridgeState)}`);
      } else {
        // No MFA configured — issue auth code directly back to the caller
        const authCode = generateAuthCode(bridgeState);
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('code', authCode);
        redirectUrl.searchParams.set('state', state);
        createAuditLog('authentication_success', userIdentifier, `Hint-only flow complete; bridgeState: ${bridgeState}`, req.ip || null);
        res.redirect(redirectUrl.toString());
      }
      return;
    }

    // Normal flow: send the user to Entra ID for first-factor authentication.
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

    // Log the full authorization URL being redirected to; redact nonce and
    // id_token_hint values since these are sensitive.
    try {
      const authUrlParsed = new URL(authUrl);
      const safeParams: Record<string, string> = {};
      const REDACT_AUTH_PARAMS = new Set(['nonce', 'id_token_hint']);
      authUrlParsed.searchParams.forEach((value, key) => {
        safeParams[key] = REDACT_AUTH_PARAMS.has(key) ? '[REDACTED]' : value;
      });
      logger.debug(
        `[ENTRA] ${JSON.stringify({
          event: 'authorization_redirect',
          url: `${authUrlParsed.origin}${authUrlParsed.pathname}`,
          params: safeParams,
        })}`,
      );
    } catch {
      // Best-effort — do not block the redirect on a logging failure
    }

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

    // Log all inbound query params, redacting the authorization code value.
    const safeQuery: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.query as Record<string, string>)) {
      safeQuery[key] = key === 'code' ? '[REDACTED]' : value;
    }
    logger.debug(
      `[ENTRA INBOUND] ${JSON.stringify({
        event: 'callback_entra',
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        query_params: safeQuery,
      })}`,
    );

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

    const mappings = getAttributeMappings();
    const mappedClaims: Record<string, unknown> = { ...userClaims };
    for (const mapping of mappings) {
      if (userClaims[mapping.source] !== undefined) {
        mappedClaims[mapping.target] = userClaims[mapping.source];
      }
    }

    // Strip Entra's internal amr/acr from stored claims — the bridge
    // synthesises its own amr for AAF via enrichClaimsWithStepUp().
    delete mappedClaims['amr'];
    delete mappedClaims['acr'];

    // Pass null for amrClaims/acrClaims so Entra's internal values are never
    // persisted to session.amr_claims or session.acr_claims.
    updateSessionTokens(state, { access_token: tokenSet.access_token, id_token: tokenSet.id_token }, mappedClaims, null, null);
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

    // Re-read the session to pick up merged claims written above
    const finalSession = getBridgeSession(bridgeState) || bridgeSession;
    const finalClaims = finalSession.user_claims
      ? JSON.parse(finalSession.user_claims) as Record<string, unknown>
      : {};
    enrichClaimsWithStepUp(finalClaims, finalSession);

    const sess = (req.session as unknown) as SessionWithState;
    const originalState = sess.aafState || bridgeSession.aaf_original_state || bridgeState;
    const redirectUri = bridgeSession.aaf_redirect_uri || config.aaf.redirectUris[0];

    createAuditLog('aaf_mfa_success', null, `bridgeState: ${bridgeState}`, req.ip || null);
    createAuditLog('authentication_success', null, `Step-up complete for bridgeState: ${bridgeState}`, req.ip || null);

    if (bridgeSession.is_entra_initiated) {
      // -----------------------------------------------------------------------
      // Entra EAM flow — Entra is waiting for an id_token proving the external
      // MFA was completed.  Issue the id_token directly and POST back to
      // Entra's callback URI (aaf_redirect_uri) so it can continue token issuance.
      //
      // NOTE: res.redirect() would send a GET, but the externalauthprovider
      // endpoint only accepts POST (response_mode=form_post), causing AADSTS900561.
      // Use an auto-submitting HTML form instead.
      // -----------------------------------------------------------------------
      const clientId = bridgeSession.aaf_client_id || config.entra.clientId;
      const idToken = await generateIdToken(finalClaims, clientId, bridgeSession.nonce);

      const escapeHtml = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const stateField = originalState
        ? `<input type="hidden" name="state" value="${escapeHtml(originalState)}" />`
        : '';

      const cspNonce = randomBytes(16).toString('base64url');

      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set(
        'Content-Security-Policy',
        `default-src 'none'; script-src 'nonce-${cspNonce}'; form-action https://login.microsoftonline.com https://login.microsoft.com https://login.microsoftonline.us https://login.chinacloudapi.cn`,
      );
      res.send(`<!DOCTYPE html>
<html>
  <head><title>Redirecting\u2026</title></head>
  <body>
    <p>Please wait, redirecting\u2026</p>
    <form id="f" method="POST" action="${escapeHtml(redirectUri)}">
      <input type="hidden" name="id_token" value="${escapeHtml(idToken)}" />
      ${stateField}
      <noscript><button type="submit">Continue</button></noscript>
    </form>
    <script nonce="${escapeHtml(cspNonce)}">document.getElementById('f').submit();</script>
  </body>
</html>`);
    } else {
      // -----------------------------------------------------------------------
      // Standard AAF-as-initiator flow — issue an authorization code that AAF
      // will exchange at /token.
      // -----------------------------------------------------------------------
      const authCode = generateAuthCode(bridgeState);

      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set('code', authCode);
      redirectUrl.searchParams.set('state', originalState);

      res.redirect(redirectUrl.toString());
    }
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// /token — AAF exchanges the authorization code for tokens
// ---------------------------------------------------------------------------

export async function token(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { grant_type, code, client_id, client_secret, code_verifier } = req.body as Record<string, string>;

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

    // PKCE validation (RFC 7636): if the authorization request included a
    // code_challenge the token request must supply the matching code_verifier.
    if (bridgeSession.code_challenge) {
      if (!code_verifier) {
        createAuditLog('token_request_failed', client_id, 'PKCE code_verifier missing', req.ip || null);
        res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier is required' });
        return;
      }
      const method = bridgeSession.code_challenge_method || 'S256';
      let computedChallenge: string;
      if (method === 'S256') {
        computedChallenge = createHash('sha256')
          .update(code_verifier)
          .digest('base64url');
      } else {
        // plain
        computedChallenge = code_verifier;
      }
      if (computedChallenge !== bridgeSession.code_challenge) {
        createAuditLog('token_request_failed', client_id, 'PKCE code_verifier mismatch', req.ip || null);
        res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier does not match code_challenge' });
        return;
      }
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
        return (typeof c['sub'] === 'string' && c['sub'] === sub) ||
               (typeof c['oid'] === 'string' && c['oid'] === sub);
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
