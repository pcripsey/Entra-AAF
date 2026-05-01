import { createSession, getSession, deleteSession, getAllActiveSessions, BridgeSession } from '../models/session';

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

export function getEntraAccessTokenFromSession(state: string): string | null {
  const session = getBridgeSession(state);
  if (!session?.entra_tokens) return null;
  try {
    const tokens = JSON.parse(session.entra_tokens) as Record<string, unknown>;
    return typeof tokens['access_token'] === 'string' ? tokens['access_token'] : null;
  } catch { return null; }
}
