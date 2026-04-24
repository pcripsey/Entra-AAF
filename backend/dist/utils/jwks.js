"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeKeys = initializeKeys;
exports.getPrivateKey = getPrivateKey;
exports.getPublicKey = getPublicKey;
exports.getJwks = getJwks;
const jose_1 = require("jose");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const logger_1 = require("./logger");
let privateKeyCache = null;
let publicKeyCache = null;
let jwksCache = null;
async function initializeKeys() {
    const privateKeyPath = path_1.default.resolve(config_1.config.jwtPrivateKeyPath);
    const publicKeyPath = path_1.default.resolve(config_1.config.jwtPublicKeyPath);
    const keysDir = path_1.default.dirname(privateKeyPath);
    if (!fs_1.default.existsSync(keysDir)) {
        fs_1.default.mkdirSync(keysDir, { recursive: true });
    }
    if (!fs_1.default.existsSync(privateKeyPath) || !fs_1.default.existsSync(publicKeyPath)) {
        logger_1.logger.info('Generating new RSA key pair...');
        const { privateKey, publicKey } = await (0, jose_1.generateKeyPair)('RS256', { modulusLength: 2048 });
        const privatePem = await (0, jose_1.exportPKCS8)(privateKey);
        const publicPem = await (0, jose_1.exportSPKI)(publicKey);
        fs_1.default.writeFileSync(privateKeyPath, privatePem, { mode: 0o600 });
        fs_1.default.writeFileSync(publicKeyPath, publicPem);
        logger_1.logger.info('RSA key pair generated and saved.');
        privateKeyCache = privateKey;
        publicKeyCache = publicKey;
    }
    else {
        const privatePem = fs_1.default.readFileSync(privateKeyPath, 'utf8');
        const publicPem = fs_1.default.readFileSync(publicKeyPath, 'utf8');
        privateKeyCache = await (0, jose_1.importPKCS8)(privatePem, 'RS256');
        publicKeyCache = await (0, jose_1.importSPKI)(publicPem, 'RS256');
        logger_1.logger.info('RSA key pair loaded from disk.');
    }
    const jwk = await (0, jose_1.exportJWK)(publicKeyCache);
    jwksCache = {
        keys: [{
                ...jwk,
                use: 'sig',
                alg: 'RS256',
                kid: 'bridge-key-1',
            }],
    };
}
function getPrivateKey() {
    if (!privateKeyCache)
        throw new Error('Keys not initialized');
    return privateKeyCache;
}
function getPublicKey() {
    if (!publicKeyCache)
        throw new Error('Keys not initialized');
    return publicKeyCache;
}
function getJwks() {
    if (!jwksCache)
        throw new Error('Keys not initialized');
    return jwksCache;
}
