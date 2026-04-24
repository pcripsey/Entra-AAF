"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAuthCode = generateAuthCode;
exports.validateAuthCode = validateAuthCode;
exports.generateIdToken = generateIdToken;
exports.generateAccessToken = generateAccessToken;
exports.validateAccessToken = validateAccessToken;
const jose_1 = require("jose");
const uuid_1 = require("uuid");
const config_1 = require("../config");
const jwks_1 = require("../utils/jwks");
const authCodes = new Map();
function generateAuthCode(sessionState) {
    const code = (0, uuid_1.v4)();
    authCodes.set(code, {
        sessionState,
        expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return code;
}
function validateAuthCode(code) {
    const entry = authCodes.get(code);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        authCodes.delete(code);
        return null;
    }
    authCodes.delete(code);
    return entry.sessionState;
}
async function generateIdToken(claims, clientId, nonce) {
    const privateKey = (0, jwks_1.getPrivateKey)();
    const now = Math.floor(Date.now() / 1000);
    const sub = claims['sub'] || claims['oid'] || 'unknown';
    const payload = { ...claims };
    if (nonce) {
        payload['nonce'] = nonce;
    }
    return new jose_1.SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'bridge-key-1' })
        .setIssuer(config_1.config.baseUrl)
        .setAudience(clientId)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .setSubject(sub)
        .sign(privateKey);
}
async function generateAccessToken(sub, clientId) {
    const privateKey = (0, jwks_1.getPrivateKey)();
    const now = Math.floor(Date.now() / 1000);
    return new jose_1.SignJWT({ sub, client_id: clientId })
        .setProtectedHeader({ alg: 'RS256', kid: 'bridge-key-1' })
        .setIssuer(config_1.config.baseUrl)
        .setAudience(clientId)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(privateKey);
}
async function validateAccessToken(token) {
    try {
        const publicKey = (0, jwks_1.getPublicKey)();
        const { payload } = await (0, jose_1.jwtVerify)(token, publicKey, {
            issuer: config_1.config.baseUrl,
        });
        return payload;
    }
    catch {
        return null;
    }
}
