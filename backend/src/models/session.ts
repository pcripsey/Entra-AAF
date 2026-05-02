import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';

export interface BridgeSession {
  id: string;
  state: string;
  nonce: string | null;
  entra_tokens: string | null;
  aaf_auth_code: string | null;
  user_claims: string | null;
  aaf_redirect_uri: string | null;
  aaf_client_id: string | null;
  amr_claims: string | null;
  acr_claims: string | null;
  id_token_hint: string | null;
  entra_verified: number;
  aaf_mfa_verified: number;
  aaf_original_state: string | null;
  requested_claims: string | null;
  created_at: string;
  expires_at: string;
}

export function createSession(
  state: string,
  nonce: string | null,
  expiresAt: Date,
  aafRedirectUri?: string,
  aafClientId?: string,
  idTokenHint?: string | null,
  requestedClaims?: string | null
): BridgeSession {
  const db = getDb();
  const session: BridgeSession = {
    id: uuidv4(),
    state,
    nonce,
    entra_tokens: null,
    aaf_auth_code: null,
    user_claims: null,
    aaf_redirect_uri: aafRedirectUri || null,
    aaf_client_id: aafClientId || null,
    amr_claims: null,
    acr_claims: null,
    id_token_hint: idTokenHint || null,
    entra_verified: 0,
    aaf_mfa_verified: 0,
    aaf_original_state: null,
    requested_claims: requestedClaims || null,
    created_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  };
  db.prepare(`
    INSERT INTO sessions (id, state, nonce, entra_tokens, aaf_auth_code, user_claims, aaf_redirect_uri, aaf_client_id, amr_claims, acr_claims, id_token_hint, entra_verified, aaf_mfa_verified, aaf_original_state, requested_claims, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(session.id, session.state, session.nonce, null, null, null, session.aaf_redirect_uri, session.aaf_client_id, null, null, session.id_token_hint, 0, 0, null, session.requested_claims, session.created_at, session.expires_at);
  return session;
}

export function getSession(state: string): BridgeSession | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE state = ?').get(state) as BridgeSession | undefined;
  return row || null;
}

export function updateSessionTokens(
  state: string,
  entraTokens: object,
  userClaims: object,
  amrClaims?: string[] | null,
  acrClaims?: string | null
): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET entra_tokens = ?, user_claims = ?, amr_claims = ?, acr_claims = ? WHERE state = ?')
    .run(
      JSON.stringify(entraTokens),
      JSON.stringify(userClaims),
      amrClaims != null ? JSON.stringify(amrClaims) : null,
      acrClaims ?? null,
      state
    );
}

export function setAafAuthCode(state: string, code: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET aaf_auth_code = ? WHERE state = ?').run(code, state);
}

export function markEntraVerified(state: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET entra_verified = 1 WHERE state = ?').run(state);
}

export function markAafMfaVerified(state: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET aaf_mfa_verified = 1 WHERE state = ?').run(state);
}

export function setAafOriginalState(state: string, aafState: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET aaf_original_state = ? WHERE state = ?').run(aafState, state);
}

export function updateSessionNonce(state: string, nonce: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET nonce = ? WHERE state = ?').run(nonce, state);
}

export function updateSessionUserClaims(state: string, userClaims: object): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET user_claims = ? WHERE state = ?')
    .run(JSON.stringify(userClaims), state);
}

export function deleteSession(state: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE state = ?').run(state);
}

export function cleanupExpiredSessions(): number {
  const db = getDb();
  const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  return result.changes;
}

export function getAllActiveSessions(): BridgeSession[] {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE expires_at > ?').all(new Date().toISOString()) as BridgeSession[];
}
