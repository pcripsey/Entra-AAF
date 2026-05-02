import { SignJWT, jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { getPrivateKey, getPublicKey } from '../utils/jwks';
import { getDb } from '../models/database';

interface AuthCodeRow {
  session_state: string;
  expires_at: string;
}

export function generateAuthCode(sessionState: string): string {
  const db = getDb();
  const code = uuidv4();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO auth_codes (code, session_state, expires_at) VALUES (?, ?, ?)').run(code, sessionState, expiresAt);
  // Opportunistically clean up expired codes
  db.prepare('DELETE FROM auth_codes WHERE expires_at < ?').run(new Date().toISOString());
  return code;
}

export function validateAuthCode(code: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT session_state, expires_at FROM auth_codes WHERE code = ?').get(code) as AuthCodeRow | undefined;
  if (!row) return null;
  db.prepare('DELETE FROM auth_codes WHERE code = ?').run(code);
  if (new Date(row.expires_at) < new Date()) return null;
  return row.session_state;
}

export async function generateIdToken(
  claims: Record<string, unknown>,
  clientId: string,
  nonce: string | null
): Promise<string> {
  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const sub = (claims['sub'] as string) || (claims['oid'] as string) || 'unknown';

  const payload: Record<string, unknown> = { ...claims };
  if (nonce) {
    payload['nonce'] = nonce;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'bridge-key-1' })
    .setIssuer(config.baseUrl)
    .setAudience(clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setSubject(sub)
    .sign(privateKey);
}

export async function generateAccessToken(sub: string, clientId: string): Promise<string> {
  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ sub, client_id: clientId })
    .setProtectedHeader({ alg: 'RS256', kid: 'bridge-key-1' })
    .setIssuer(config.baseUrl)
    .setAudience(clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
}

export async function validateAccessToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const publicKey = getPublicKey();
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: config.baseUrl,
    });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
