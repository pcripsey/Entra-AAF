import { generateKeyPair, exportJWK, exportPKCS8, exportSPKI, importPKCS8, importSPKI, KeyLike } from 'jose';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from './logger';

let privateKeyCache: KeyLike | null = null;
let publicKeyCache: KeyLike | null = null;
let jwksCache: object | null = null;

export async function initializeKeys(): Promise<void> {
  const privateKeyPath = path.resolve(config.jwtPrivateKeyPath);
  const publicKeyPath = path.resolve(config.jwtPublicKeyPath);

  const keysDir = path.dirname(privateKeyPath);
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    logger.info('Generating new RSA key pair...');
    const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    const privatePem = await exportPKCS8(privateKey);
    const publicPem = await exportSPKI(publicKey);
    fs.writeFileSync(privateKeyPath, privatePem, { mode: 0o600 });
    fs.writeFileSync(publicKeyPath, publicPem);
    logger.info('RSA key pair generated and saved.');
    privateKeyCache = privateKey;
    publicKeyCache = publicKey;
  } else {
    const privatePem = fs.readFileSync(privateKeyPath, 'utf8');
    const publicPem = fs.readFileSync(publicKeyPath, 'utf8');
    privateKeyCache = await importPKCS8(privatePem, 'RS256');
    publicKeyCache = await importSPKI(publicPem, 'RS256');
    logger.info('RSA key pair loaded from disk.');
  }

  const jwk = await exportJWK(publicKeyCache!);
  jwksCache = {
    keys: [{
      ...jwk,
      use: 'sig',
      alg: 'RS256',
      kid: 'bridge-key-1',
    }],
  };
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
