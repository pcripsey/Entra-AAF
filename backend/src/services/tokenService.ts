import { SignJWT, jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { getPrivateKey, getPublicKey } from '../utils/jwks';

interface AuthCodeEntry {
  sessionState: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCodeEntry>();

export function generateAuthCode(sessionState: string): string {
  const code = uuidv4();
  authCodes.set(code, {
    sessionState,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return code;
}

export function validateAuthCode(code: string): string | null {
  const entry = authCodes.get(code);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authCodes.delete(code);
    return null;
  }
  authCodes.delete(code);
  return entry.sessionState;
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
