/**
 * Entra External Authentication Method (EAM) flow controller.
 *
 * This implements the bridge's role as an external MFA provider for Microsoft
 * Entra ID.  After Entra completes its own first-factor authentication, it
 * redirects the user's browser here so the bridge can perform the AAF MFA
 * second factor and return the result to Entra.
 *
 * Entra EAM flow:
 *  1. User authenticates with Entra (password / first factor).
 *  2. Entra's Conditional Access policy requires the External Authentication
 *     Method registered at {BASE_URL}/entra-eam.
 *  3. Entra redirects the user to GET /entra-eam (or POSTs via form_post) with:
 *       - client_id   : the bridge's Entra app registration client ID
 *       - redirect_uri: Entra's callback URI (login.microsoftonline.com/…)
 *       - state       : opaque state value from Entra
 *       - nonce       : anti-replay nonce
 *       - login_hint  : user's email / UPN
 *       - request     : (optional) Entra-signed JWT with user context
 *  4. Bridge creates a session pre-marked as entra_verified (Entra did 1FA).
 *  5. Bridge redirects to /login/aaf for AAF MFA (second factor).
 *  6. After AAF MFA succeeds, /callback/aaf detects is_entra_initiated and
 *     issues a signed id_token, then redirects to Entra's redirect_uri.
 *  7. Entra validates the id_token, sees amr=["mfa","aaf"], aal="MFA", and
 *     completes the authentication.
 *
 * Security:
 *  - The client_id parameter must match the configured Entra client ID.
 *  - The redirect_uri must either be in ENTRA_EAM_ALLOWED_REDIRECT_URIS or
 *    originate from login.microsoftonline.com / login.microsoft.com.
 *  - When Entra supplies a `request` JWT it is cryptographically verified
 *    against Entra's JWKS before any session is created.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { createBridgeSession, markBridgeSessionEntraInitiated } from '../services/sessionService';
import { updateSessionTokens, markEntraVerified, setAafOriginalState } from '../models/session';
import { getEntraConfig } from '../models/config';
import { verifyEntraIdToken, decodeIdTokenHint } from '../services/oidcClientService';
import { isAafMfaConfigured } from '../services/aafMfaService';
import { createAuditLog } from '../models/auditLog';
import { logger } from '../utils/logger';

/**
 * Validates that the supplied redirect_uri is trustworthy for the EAM flow.
 * It must either be in the explicit allow-list (ENTRA_EAM_ALLOWED_REDIRECT_URIS)
 * or originate from an official Microsoft login domain.
 */
function isAllowedEamRedirectUri(uri: string): boolean {
  const explicit = config.entraEam.allowedRedirectUris;
  if (explicit.length > 0 && explicit.includes(uri)) return true;
  try {
    const { hostname } = new URL(uri);
    return (
      hostname === 'login.microsoftonline.com' ||
      hostname === 'login.microsoft.com' ||
      hostname === 'login.microsoftonline.us' ||
      hostname === 'login.chinacloudapi.cn'
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET|POST /entra-eam — Entra redirects here after first-factor authentication
// ---------------------------------------------------------------------------

export async function entraEam(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      client_id,
      redirect_uri,
      state: entraState,
      nonce,
      login_hint,
      request: requestJwt,
      id_token_hint,
      claims,
    } = { ...req.query, ...(req.body as Record<string, string>) } as Record<string, string>;

    const entraConfig = getEntraConfig();
    const expectedClientId = entraConfig.clientId || config.entra.clientId;

    // Validate client_id — must match the configured Entra app registration
    if (!expectedClientId || client_id !== expectedClientId) {
      createAuditLog('entra_eam_rejected', null, `Unknown client_id: received "${client_id || '(none)'}", expected "${expectedClientId || '(not configured)'}"`, req.ip || null);
      res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
      return;
    }

    // Validate redirect_uri — must be an Entra-owned URI or in the allow-list
    if (!redirect_uri || !isAllowedEamRedirectUri(redirect_uri)) {
      createAuditLog('entra_eam_rejected', null, `Invalid redirect_uri: ${redirect_uri}`, req.ip || null);
      res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri is not allowed' });
      return;
    }

    if (!isAafMfaConfigured()) {
      createAuditLog('entra_eam_rejected', null, 'AAF MFA not configured; EAM flow unavailable', req.ip || null);
      res.status(503).json({
        error: 'service_unavailable',
        error_description: 'AAF MFA is not configured on this bridge',
      });
      return;
    }

    // If Entra supplied a signed `request` JWT or `id_token_hint` (form_post),
    // verify it before trusting any user claims it contains.  If verification
    // fails, reject the request so an unauthenticated caller cannot fabricate
    // an identity.  `request` JWT (GET flow) takes precedence over
    // `id_token_hint` (form_post flow); both are cryptographically verified
    // via the same `verifyEntraIdToken` call, so there is no privilege
    // escalation risk if both are present simultaneously.
    let jwtClaims: Record<string, unknown> | null = null;
    const jwtToVerify = requestJwt || id_token_hint;
    if (jwtToVerify) {
      try {
        jwtClaims = await verifyEntraIdToken(jwtToVerify);
        logger.debug('[EAM] Entra request JWT verified successfully');
      } catch (err) {
        createAuditLog('entra_eam_rejected', null, `Invalid request JWT: ${String(err)}`, req.ip || null);
        res.status(400).json({ error: 'invalid_request', error_description: 'request JWT signature verification failed' });
        return;
      }
    }

    // Build the user identity that will seed the bridge session.
    // Prefer claims from the verified request JWT; fall back to login_hint.
    const userClaims: Record<string, unknown> = {};
    if (jwtClaims) {
      // Pull safe user-identity fields from the verified JWT
      const SAFE_FIELDS = ['sub', 'oid', 'email', 'preferred_username', 'upn', 'name', 'given_name', 'family_name', 'tid'];
      for (const field of SAFE_FIELDS) {
        if (jwtClaims[field] !== undefined) {
          userClaims[field] = jwtClaims[field];
        }
      }
    } else if (login_hint) {
      // No verified JWT — only store the login_hint as email; do NOT mark the
      // identity as Entra-verified without cryptographic proof.
      userClaims['preferred_username'] = login_hint;
      userClaims['email'] = login_hint;
    }

    // Create bridge session.  The redirect_uri here is Entra's callback URI —
    // after AAF MFA succeeds the bridge will redirect back to it.
    const bridgeState = uuidv4();
    const bridgeNonce = nonce || uuidv4();

    createBridgeSession(
      bridgeState,
      bridgeNonce,
      redirect_uri,
      client_id,
      null,
      null,
      true,              // is_entra_initiated
      entraState || null // entra_transaction_id — Entra's own state token
    );

    // Persist Entra's state so we can echo it back after AAF MFA
    if (entraState) {
      setAafOriginalState(bridgeState, entraState);
    }

    // Extract ACR value from Entra's claims request and store it in the session
    let requestedAcr: string | null = null;
    if (claims) {
      try {
        const parsedClaims = JSON.parse(claims) as Record<string, unknown>;
        const idTokenClaims = parsedClaims['id_token'] as Record<string, unknown> | undefined;
        const acrClaim = idTokenClaims?.['acr'] as Record<string, unknown> | undefined;
        if (acrClaim) {
          const acrValues = acrClaim['values'] as string[] | undefined;
          const acrValue = typeof acrClaim['value'] === 'string' ? acrClaim['value'] : undefined;
          requestedAcr = acrValues?.[0] ?? acrValue ?? null;
        }
      } catch (err) {
        logger.warn(`[EAM] Failed to parse claims parameter; acr will use default: ${String(err)}`);
      }
    }

    // Mark the session as Entra-verified (Entra already performed 1FA)
    if (Object.keys(userClaims).length > 0 || requestedAcr) {
      updateSessionTokens(bridgeState, {}, userClaims, null, requestedAcr);
    }
    markEntraVerified(bridgeState);
    markBridgeSessionEntraInitiated(bridgeState, entraState || null);

    const userIdentifier =
      (userClaims['preferred_username'] as string) ||
      (userClaims['email'] as string) ||
      login_hint ||
      'unknown';

    createAuditLog(
      'entra_eam_initiated',
      userIdentifier,
      `EAM flow started; bridgeState: ${bridgeState}`,
      req.ip || null
    );

    // Hand off to AAF MFA (second factor)
    res.redirect(`/login/aaf?state=${encodeURIComponent(bridgeState)}`);
  } catch (err) {
    next(err);
  }
}

/**
 * Decodes the `id_token_hint` JWT payload without signature verification.
 * Re-exported here so `oidcProvider.ts` can use it in both the `/authorize`
 * id_token_hint shortcut flow and any EAM-related logic without changing its
 * existing import surface.  All security-relevant checks must use
 * `verifyEntraIdToken` before calling this function.
 */
export { decodeIdTokenHint };
