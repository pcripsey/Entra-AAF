"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    baseUrl: process.env.BASE_URL || 'http://localhost:3001',
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin',
    dbPath: process.env.DB_PATH || './data/bridge.db',
    jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem',
    jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem',
    entra: {
        clientId: process.env.ENTRA_CLIENT_ID || '',
        clientSecret: process.env.ENTRA_CLIENT_SECRET || '',
        tenantId: process.env.ENTRA_TENANT_ID || '',
        redirectUri: process.env.ENTRA_REDIRECT_URI || '',
    },
    aaf: {
        clientId: process.env.AAF_CLIENT_ID || '',
        clientSecret: process.env.AAF_CLIENT_SECRET || '',
        redirectUris: process.env.AAF_REDIRECT_URIS ? process.env.AAF_REDIRECT_URIS.split(',') : [],
    },
};
