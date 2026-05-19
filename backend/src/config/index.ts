import dotenv from 'dotenv';
dotenv.config();

const parseIntegerEnv = (value: string | undefined, fallback: number): number => {
  const normalized = value?.trim();
  if (!normalized || !/^-?\d+$/.test(normalized)) {
    return fallback;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clusterEnabled: process.env.CLUSTER_ENABLED === 'true',
  cleanupIntervalMs: parseIntegerEnv(process.env.CLEANUP_INTERVAL_MS, 300000),
  rateLimitWindowMs: parseIntegerEnv(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
  rateLimitMax: parseIntegerEnv(process.env.RATE_LIMIT_MAX, 200),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : null,
  dbPath: process.env.DB_PATH || './data/bridge.db',
  jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem',
  jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem',
  jwtCertPath: process.env.JWT_CERT_PATH || './keys/cert.pem',
  entra: {
    clientId: process.env.ENTRA_CLIENT_ID || '',
    clientSecret: process.env.ENTRA_CLIENT_SECRET || '',
    tenantId: process.env.ENTRA_TENANT_ID || '',
    redirectUri: process.env.ENTRA_REDIRECT_URI || '',
    discoveryUrl: process.env.ENTRA_DISCOVERY_URL || '',
  },
  aaf: {
    clientId: process.env.AAF_CLIENT_ID || '',
    clientSecret: process.env.AAF_CLIENT_SECRET || '',
    redirectUris: process.env.AAF_REDIRECT_URIS ? process.env.AAF_REDIRECT_URIS.split(',') : [],
  },
  aafMfa: {
    // AAF MFA endpoints (bridge acts as OIDC client to AAF's own authorization server)
    authorizeEndpoint: process.env.AAF_AUTHORIZE_ENDPOINT || '',
    tokenEndpoint: process.env.AAF_TOKEN_ENDPOINT || '',
    userInfoEndpoint: process.env.AAF_USERINFO_ENDPOINT || '',
    // Bridge credentials registered with AAF's authorization server
    clientId: process.env.AAF_MFA_CLIENT_ID || '',
    clientSecret: process.env.AAF_MFA_CLIENT_SECRET || '',
  },
  entraEam: {
    // Allowed Entra redirect URIs for the EAM (External Authentication Method) flow.
    // Comma-separated list of URIs that Entra may supply as redirect_uri.
    // Defaults to allowing any login.microsoftonline.com or login.microsoft.com origin.
    allowedRedirectUris: process.env.ENTRA_EAM_ALLOWED_REDIRECT_URIS
      ? process.env.ENTRA_EAM_ALLOWED_REDIRECT_URIS.split(',').map((s) => s.trim())
      : [],
  },
};
