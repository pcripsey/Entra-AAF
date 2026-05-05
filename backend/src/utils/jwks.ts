import { generateKeyPair, exportJWK, exportPKCS8, exportSPKI, importPKCS8, importSPKI, KeyLike } from 'jose';
import * as x509 from '@peculiar/x509';
import { webcrypto, createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from './logger';

// Provide the WebCrypto implementation to @peculiar/x509
x509.cryptoProvider.set(webcrypto as Crypto);

let privateKeyCache: KeyLike | null = null;
let publicKeyCache: KeyLike | null = null;
let jwksCache: object | null = null;

/** Strip PEM headers/footers and whitespace, returning raw base64. */
function pemToBase64(pem: string): string {
  return pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
}

/** Decode a PEM string to a DER Buffer. */
function pemToBuffer(pem: string): Buffer {
  return Buffer.from(pemToBase64(pem), 'base64');
}

/**
 * Ensure a self-signed certificate exists at certPath.
 * Generates and persists one if it is absent, otherwise loads from disk.
 */
async function ensureCertificate(
  publicPem: string,
  privatePem: string,
  certPath: string,
): Promise<string> {
  if (fs.existsSync(certPath)) {
    return fs.readFileSync(certPath, 'utf8');
  }

  logger.info('Generating self-signed X.509 certificate for JWKS x5c...');

  // @peculiar/x509 requires CryptoKey; re-import from PEM via WebCrypto.
  const rsaParams = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
  const cryptoPrivateKey = await webcrypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(privatePem),
    rsaParams,
    false,
    ['sign'],
  );
  const cryptoPublicKey = await webcrypto.subtle.importKey(
    'spki',
    pemToBuffer(publicPem),
    rsaParams,
    true,
    ['verify'],
  );

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: 'CN=Entra-AAF Bridge',
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // 10 years
    signingAlgorithm: rsaParams,
    keys: { privateKey: cryptoPrivateKey, publicKey: cryptoPublicKey },
    extensions: [
      new x509.BasicConstraintsExtension(false),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature),
    ],
  });

  const certPem = cert.toString('pem');
  fs.writeFileSync(certPath, certPem, { mode: 0o644 });
  logger.info('Self-signed certificate generated and saved.');
  return certPem;
}

export async function initializeKeys(): Promise<void> {
  const privateKeyPath = path.resolve(config.jwtPrivateKeyPath);
  const publicKeyPath = path.resolve(config.jwtPublicKeyPath);
  const certPath = path.resolve(config.jwtCertPath);

  const keysDir = path.dirname(privateKeyPath);
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  let privatePem: string;
  let publicPem: string;

  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    logger.info('Generating new RSA key pair...');
    const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    privatePem = await exportPKCS8(privateKey);
    publicPem = await exportSPKI(publicKey);
    fs.writeFileSync(privateKeyPath, privatePem, { mode: 0o600 });
    fs.writeFileSync(publicKeyPath, publicPem);
    logger.info('RSA key pair generated and saved.');
    privateKeyCache = privateKey;
    publicKeyCache = publicKey;
  } else {
    privatePem = fs.readFileSync(privateKeyPath, 'utf8');
    publicPem = fs.readFileSync(publicKeyPath, 'utf8');
    privateKeyCache = await importPKCS8(privatePem, 'RS256');
    publicKeyCache = await importSPKI(publicPem, 'RS256');
    logger.info('RSA key pair loaded from disk.');
  }

  // Ensure a certificate exists; generate one from the current key pair if not.
  const certPem = await ensureCertificate(publicPem, privatePem, certPath);
  const certDer = pemToBuffer(certPem);

  // x5c: base64-encoded DER (no PEM headers), wrapped in an array per RFC 7517
  const x5c = pemToBase64(certPem);
  // x5t: base64url SHA-1 thumbprint of the DER certificate
  const x5t = createHash('sha1').update(certDer).digest('base64url');
  // x5t#S256: base64url SHA-256 thumbprint of the DER certificate
  const x5tS256 = createHash('sha256').update(certDer).digest('base64url');

  const jwk = await exportJWK(publicKeyCache!);
  jwksCache = {
    keys: [{
      ...jwk,
      use: 'sig',
      alg: 'RS256',
      kid: 'bridge-key-1',
      x5c: [x5c],
      x5t,
      'x5t#S256': x5tS256,
    }],
  };

  logger.info('JWKS cache built with x5c, x5t, and x5t#S256.');
}

export function getPrivateKey(): KeyLike {
  if (!privateKeyCache) throw new Error('Keys not initialized');
  return privateKeyCache;
}

export function getPublicKey(): KeyLike {
  if (!publicKeyCache) throw new Error('Keys not initialized');
  return publicKeyCache;
}

export function getJwks(): object {
  if (!jwksCache) throw new Error('Keys not initialized');
  return jwksCache;
}
