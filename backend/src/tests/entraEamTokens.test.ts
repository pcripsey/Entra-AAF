import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair, jwtVerify, type JWK, SignJWT } from 'jose';
import type { BridgeSession } from '../models/session';

const TEST_CLIENT_ID = 'entra-app-client-id';
const TEST_ISSUER = 'https://login.microsoftonline.com/test-tenant/v2.0';
const TEST_BASE_URL = 'https://bridge.example.com';

process.env.NODE_ENV = 'test';
process.env.BASE_URL = TEST_BASE_URL;
process.env.ENTRA_CLIENT_ID = TEST_CLIENT_ID;
process.env.ENTRA_EAM_MAX_TOKEN_AGE_SECONDS = '300';
process.env.JWT_PRIVATE_KEY_PATH = '/tmp/entra-aaf-tests/private.pem';
process.env.JWT_PUBLIC_KEY_PATH = '/tmp/entra-aaf-tests/public.pem';
process.env.JWT_CERT_PATH = '/tmp/entra-aaf-tests/cert.pem';

type OidcClientServiceModule = typeof import('../services/oidcClientService');
type OidcProviderModule = typeof import('../controllers/oidcProvider');
type TokenServiceModule = typeof import('../services/tokenService');
type JwksModule = typeof import('../utils/jwks');

type VerificationContext = {
  clientId: string;
  expectedIssuer: string;
  jwks: ReturnType<typeof createLocalJWKSet>;
};

let oidcClientServicePromise: Promise<OidcClientServiceModule> | null = null;
let oidcProviderPromise: Promise<OidcProviderModule> | null = null;
let tokenServicePromise: Promise<TokenServiceModule> | null = null;
let jwksPromise: Promise<JwksModule> | null = null;

async function loadOidcClientService(): Promise<OidcClientServiceModule> {
  if (!oidcClientServicePromise) {
    oidcClientServicePromise = import('../services/oidcClientService');
  }
  return oidcClientServicePromise;
}

async function loadOidcProvider(): Promise<OidcProviderModule> {
  if (!oidcProviderPromise) {
    oidcProviderPromise = import('../controllers/oidcProvider');
  }
  return oidcProviderPromise;
}

async function loadTokenService(): Promise<TokenServiceModule> {
  if (!tokenServicePromise) {
    tokenServicePromise = import('../services/tokenService');
  }
  return tokenServicePromise;
}

async function loadJwks(): Promise<JwksModule> {
  if (!jwksPromise) {
    jwksPromise = import('../utils/jwks');
  }
  return jwksPromise;
}

async function createVerificationContext(): Promise<{
  context: VerificationContext;
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
}> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const jwkSet = createLocalJWKSet({
    keys: [
      {
        ...(publicJwk as JWK),
        alg: 'RS256',
        kid: 'test-key',
        use: 'sig',
      },
    ],
  });

  return {
    context: {
      clientId: TEST_CLIENT_ID,
      expectedIssuer: TEST_ISSUER,
      jwks: jwkSet,
    },
    privateKey,
  };
}

async function signToken(
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'],
  overrides?: Partial<Record<string, unknown>> & { iat?: number; exp?: number; aud?: string | string[]; iss?: string }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'subject-123',
    oid: 'object-123',
    tid: 'tenant-123',
    nonce: 'nonce-123',
    iat: now - 120,
    exp: now - 30,
    ...(overrides ?? {}),
  };

  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer((overrides?.iss as string | undefined) ?? TEST_ISSUER)
    .setAudience((overrides?.aud as string | string[] | undefined) ?? TEST_CLIENT_ID)
    .setIssuedAt(typeof payload.iat === 'number' ? payload.iat : now - 120);

  if (typeof payload.exp === 'number') {
    jwt = jwt.setExpirationTime(payload.exp);
  }

  return jwt.sign(privateKey);
}

test('verifyEntraEamRequestToken accepts an expired but recent Entra EAM token', async () => {
  const { verifyEntraEamRequestToken } = await loadOidcClientService();
  const { context, privateKey } = await createVerificationContext();
  const token = await signToken(privateKey, { exp: Math.floor(Date.now() / 1000) - 20 });

  const payload = await verifyEntraEamRequestToken(token, { context });

  assert.equal(payload.sub, 'subject-123');
  assert.equal(payload.oid, 'object-123');
  assert.equal(payload.tid, 'tenant-123');
  assert.equal(payload.nonce, 'nonce-123');
});

test('verifyEntraEamRequestToken rejects a token with an invalid signature', async () => {
  const { verifyEntraEamRequestToken } = await loadOidcClientService();
  const { context } = await createVerificationContext();
  const { privateKey: otherPrivateKey } = await generateKeyPair('RS256');
  const token = await signToken(otherPrivateKey);

  await assert.rejects(
    () => verifyEntraEamRequestToken(token, { context }),
  );
});

test('verifyEntraEamRequestToken rejects the wrong audience or issuer', async () => {
  const { verifyEntraEamRequestToken } = await loadOidcClientService();
  const { context, privateKey } = await createVerificationContext();
  const wrongAudienceToken = await signToken(privateKey, { aud: 'different-client-id' });
  const wrongIssuerToken = await signToken(privateKey, { iss: 'https://login.microsoftonline.com/other/v2.0' });

  await assert.rejects(
    () => verifyEntraEamRequestToken(wrongAudienceToken, { context }),
    /audience claim mismatch/,
  );
  await assert.rejects(
    () => verifyEntraEamRequestToken(wrongIssuerToken, { context }),
    /issuer claim mismatch/,
  );
});

test('verifyEntraEamRequestToken rejects a stale Entra EAM token beyond the replay window', async () => {
  const { verifyEntraEamRequestToken } = await loadOidcClientService();
  const { context, privateKey } = await createVerificationContext();
  const staleIssuedAt = Math.floor(Date.now() / 1000) - 900;
  const token = await signToken(privateKey, {
    iat: staleIssuedAt,
    exp: staleIssuedAt + 60,
  });

  await assert.rejects(
    () => verifyEntraEamRequestToken(token, { context }),
    /maximum allowed EAM age/,
  );
});

test('verifyEntraEamRequestToken rejects a token whose iat is too far in the future', async () => {
  const { verifyEntraEamRequestToken } = await loadOidcClientService();
  const { context, privateKey } = await createVerificationContext();
  const futureIssuedAt = Math.floor(Date.now() / 1000) + 120;
  const token = await signToken(privateKey, {
    iat: futureIssuedAt,
    exp: futureIssuedAt + 120,
  });

  await assert.rejects(
    () => verifyEntraEamRequestToken(token, { context }),
    /iat claim is in the future/,
  );
});

test('verifyEntraEamRequestToken rejects a token whose nbf is in the future', async () => {
  const { verifyEntraEamRequestToken } = await loadOidcClientService();
  const { context, privateKey } = await createVerificationContext();
  const futureNotBefore = Math.floor(Date.now() / 1000) + 120;
  const token = await signToken(privateKey, {
    nbf: futureNotBefore,
    exp: futureNotBefore + 120,
  });

  await assert.rejects(
    () => verifyEntraEamRequestToken(token, { context }),
    /nbf claim is in the future/,
  );
});

test('verifyEntraEamRequestToken rejects a token missing required identity claims', async () => {
  const { verifyEntraEamRequestToken } = await loadOidcClientService();
  const { context, privateKey } = await createVerificationContext();
  const token = await signToken(privateKey, { oid: undefined });

  await assert.rejects(
    () => verifyEntraEamRequestToken(token, { context }),
    /missing required oid claim/,
  );
});

test('verifyEntraEamRequestToken rejects a token whose exp predates iat', async () => {
  const { verifyEntraEamRequestToken } = await loadOidcClientService();
  const { context, privateKey } = await createVerificationContext();
  const issuedAt = Math.floor(Date.now() / 1000) - 30;
  const token = await signToken(privateKey, {
    iat: issuedAt,
    exp: issuedAt - 1,
  });

  await assert.rejects(
    () => verifyEntraEamRequestToken(token, { context }),
    /exp claim predates iat/,
  );
});

test('verifyEntraIdToken still rejects an ordinarily expired Entra ID token', async () => {
  const { verifyEntraIdToken } = await loadOidcClientService();
  const { context, privateKey } = await createVerificationContext();
  const token = await signToken(privateKey, { exp: Math.floor(Date.now() / 1000) - 120 });

  await assert.rejects(
    () => verifyEntraIdToken(token, { context }),
    /exp/,
  );
});

test('Entra-initiated result tokens preserve subject and nonce and emit valid EAM amr/acr claims', async () => {
  const { enrichClaimsWithStepUp } = await loadOidcProvider();
  const { generateIdToken } = await loadTokenService();
  const { initializeKeys, getPublicKey } = await loadJwks();

  await initializeKeys();

  const claims: Record<string, unknown> = {
    sub: 'subject-123',
    oid: 'object-123',
    tid: 'tenant-123',
    amr: ['mfa', 'sms'],
  };
  const session = {
    id: '1',
    state: 'bridge-state',
    nonce: 'nonce-123',
    entra_tokens: null,
    aaf_auth_code: null,
    user_claims: null,
    aaf_redirect_uri: 'https://login.microsoftonline.com/test/oauth2/v2.0/externalauthprovider',
    aaf_client_id: TEST_CLIENT_ID,
    amr_claims: JSON.stringify(['mfa', 'sms']),
    acr_claims: 'possessionorinherence',
    id_token_hint: null,
    entra_verified: 1,
    aaf_mfa_verified: 1,
    aaf_original_state: null,
    requested_claims: null,
    is_entra_initiated: 1,
    entra_transaction_id: null,
    code_challenge: null,
    code_challenge_method: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  } satisfies BridgeSession;

  enrichClaimsWithStepUp(claims, session);
  const token = await generateIdToken(claims, TEST_CLIENT_ID, session.nonce);
  const { payload } = await jwtVerify(token, getPublicKey(), {
    issuer: TEST_BASE_URL,
    audience: TEST_CLIENT_ID,
  });

  assert.equal(payload.sub, 'subject-123');
  assert.equal(payload.nonce, 'nonce-123');
  assert.deepEqual(payload.amr, ['sms']);
  assert.equal(payload.acr, 'possessionorinherence');
  assert.equal(decodeJwt(token).sub, 'subject-123');
});
