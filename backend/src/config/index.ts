import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : null,
  dbPath: process.env.DB_PATH || './data/bridge.db',
  jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem',
  jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem',
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
