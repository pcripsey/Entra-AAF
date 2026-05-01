import { createSession, getSession, deleteSession, getAllActiveSessions, updateSessionUserClaims, BridgeSession } from '../models/session';

export function createBridgeSession(
  state: string,
  nonce: string | null,
  aafRedirectUri: string,
  aafClientId: string,
  idTokenHint?: string | null,
  requestedClaims?: string | null
): BridgeSession {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  return createSession(state, nonce, expiresAt, aafRedirectUri, aafClientId, idTokenHint, requestedClaims);
}

export function getBridgeSession(state: string): BridgeSession | null {
  return getSession(state);
}

export function removeBridgeSession(state: string): void {
  deleteSession(state);
}

export function getActiveSessions(): BridgeSession[] {
  return getAllActiveSessions();
}

/**
 * Returns the Entra access token stored in the session identified by `state`,
 * or `null` when the session does not exist, has no entra_tokens field, the
 * field is not valid JSON, or the token is not a string.
 */
export function getEntraAccessTokenFromSession(state: string): string | null {
  const session = getBridgeSession(state);
  if (!session?.entra_tokens) return null;
  try {
    const tokens = JSON.parse(session.entra_tokens) as Record<string, unknown>;
    return typeof tokens['access_token'] === 'string' ? tokens['access_token'] : null;
  } catch {
    return null;
  }
}

/**
 * Additively merges `additionalClaims` into the stored user_claims for the
 * session identified by `state`.  Keys that already exist in the session are
 * not overwritten, preserving original Entra claims.  Silently no-ops when
 * the session has no user_claims or the stored JSON is unparseable.
 */
export function mergeSessionUserClaims(state: string, additionalClaims: Record<string, unknown>): void {
  const session = getBridgeSession(state);
  if (!session?.user_claims) return;
  try {
    const existing = JSON.parse(session.user_claims) as Record<string, unknown>;
    // Additive only: do not overwrite existing Entra claims
    for (const [key, value] of Object.entries(additionalClaims)) {
      if (!(key in existing)) {
        existing[key] = value;
      }
    }
    updateSessionUserClaims(state, existing);
  } catch {
    // ignore parse errors
  }
}
