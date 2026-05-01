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

// Standard OIDC claims plus AAF/bridge-specific extras that are forwarded to
// the relying party.  All Entra-proprietary fields (oid, tid, ver, uti, rh,
// xms_*, wids, aio, …) are intentionally excluded to prevent non-standard
// claims from confusing AAF/OSP's claim parser.
const ALLOWED_CLAIMS = new Set([
  'sub', 'name', 'given_name', 'family_name', 'email', 'email_verified',
  'preferred_username', 'locale', 'zoneinfo', 'updated_at', 'picture',
  'website', 'phone_number', 'phone_number_verified', 'address', 'birthdate',
  'gender', 'profile',
  // AAF / bridge-specific extras
  'upn', 'groups', 'roles', 'amr', 'acr', 'aal', 'auth_time', 'nonce',
]);

export async function generateIdToken(
  claims: Record<string, unknown>,
  clientId: string,
  nonce: string | null
): Promise<string> {
  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const sub = (claims['sub'] as string) || (claims['oid'] as string) || 'unknown';

  // Only forward allowed OIDC/AAF claims; strip Entra-proprietary fields.
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(claims)) {
    if (ALLOWED_CLAIMS.has(key)) {
      payload[key] = claims[key];
    }
  }
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
