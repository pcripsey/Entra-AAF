"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discovery = discovery;
exports.jwks = jwks;
exports.authorize = authorize;
exports.callback = callback;
exports.token = token;
exports.userinfo = userinfo;
const uuid_1 = require("uuid");
const config_1 = require("../config");
const jwks_1 = require("../utils/jwks");
const sessionService_1 = require("../services/sessionService");
const oidcClientService_1 = require("../services/oidcClientService");
const session_1 = require("../models/session");
const config_2 = require("../models/config");
const tokenService_1 = require("../services/tokenService");
const auditLog_1 = require("../models/auditLog");
const logger_1 = require("../utils/logger");
function discovery(req, res) {
    const baseUrl = config_1.config.baseUrl;
    res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        userinfo_endpoint: `${baseUrl}/userinfo`,
        jwks_uri: `${baseUrl}/.well-known/jwks.json`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'profile', 'email'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
        claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'name', 'email', 'upn'],
    });
}
function jwks(req, res) {
    res.json((0, jwks_1.getJwks)());
}
async function authorize(req, res, next) {
    try {
        const { client_id, redirect_uri, response_type, state, nonce } = req.query;
        const aafConfig = (0, config_2.getAafConfig)();
        const aafClientId = aafConfig.clientId || config_1.config.aaf.clientId;
        const aafRedirectUris = aafConfig.redirectUris.length ? aafConfig.redirectUris : config_1.config.aaf.redirectUris;
        if (client_id !== aafClientId) {
            res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
            return;
        }
        if (!aafRedirectUris.includes(redirect_uri)) {
            res.status(400).json({ error: 'invalid_request', error_description: 'Invalid redirect_uri' });
            return;
        }
        if (response_type !== 'code') {
            res.status(400).json({ error: 'unsupported_response_type' });
            return;
        }
        const bridgeState = (0, uuid_1.v4)();
        const bridgeNonce = nonce || (0, uuid_1.v4)();
        (0, sessionService_1.createBridgeSession)(bridgeState, bridgeNonce, redirect_uri, client_id);
        const sess = req.session;
        sess.aafState = state;
        sess.bridgeState = bridgeState;
        const authUrl = await (0, oidcClientService_1.generateAuthorizationUrl)(bridgeState, bridgeNonce);
        (0, auditLog_1.createAuditLog)('authorize_request', client_id, `redirect_uri: ${redirect_uri}`, req.ip || null);
        res.redirect(authUrl);
    }
    catch (err) {
        next(err);
    }
}
async function callback(req, res, next) {
    try {
        const { code, state, error, error_description } = req.query;
        if (error) {
            logger_1.logger.error(`Entra callback error: ${error} - ${error_description}`);
            res.status(400).send(`Authentication error: ${error_description || error}`);
            return;
        }
        if (!code || !state) {
            res.status(400).send('Missing code or state');
            return;
        }
        const bridgeSession = (0, sessionService_1.getBridgeSession)(state);
        if (!bridgeSession) {
            res.status(400).send('Invalid or expired session state');
            return;
        }
        const tokenSet = await (0, oidcClientService_1.exchangeCode)(code, state);
        const userClaims = await (0, oidcClientService_1.getUserInfo)(tokenSet);
        const mappings = (0, config_2.getAttributeMappings)();
        const mappedClaims = { ...userClaims };
        for (const mapping of mappings) {
            if (userClaims[mapping.source] !== undefined) {
                mappedClaims[mapping.target] = userClaims[mapping.source];
            }
        }
        (0, session_1.updateSessionTokens)(state, { access_token: tokenSet.access_token, id_token: tokenSet.id_token }, mappedClaims);
        const authCode = (0, tokenService_1.generateAuthCode)(state);
        const sess = req.session;
        const aafState = sess.aafState || state;
        const redirectUri = bridgeSession.aaf_redirect_uri || config_1.config.aaf.redirectUris[0];
        const redirectUrl = new URL(redirectUri);
        redirectUrl.searchParams.set('code', authCode);
        redirectUrl.searchParams.set('state', aafState);
        (0, auditLog_1.createAuditLog)('authentication_success', userClaims['preferred_username'] || userClaims['upn'] || 'unknown', `sub: ${String(userClaims['sub'] || userClaims['oid'])}`, req.ip || null);
        res.redirect(redirectUrl.toString());
    }
    catch (err) {
        next(err);
    }
}
async function token(req, res, next) {
    try {
        const { grant_type, code, client_id, client_secret } = req.body;
        if (grant_type !== 'authorization_code') {
            res.status(400).json({ error: 'unsupported_grant_type' });
            return;
        }
        const aafConfig = (0, config_2.getAafConfig)();
        const expectedClientId = aafConfig.clientId || config_1.config.aaf.clientId;
        const expectedClientSecret = aafConfig.clientSecret || config_1.config.aaf.clientSecret;
        if (client_id !== expectedClientId || client_secret !== expectedClientSecret) {
            res.status(401).json({ error: 'invalid_client' });
            return;
        }
        const sessionState = (0, tokenService_1.validateAuthCode)(code);
        if (!sessionState) {
            res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
            return;
        }
        const bridgeSession = (0, sessionService_1.getBridgeSession)(sessionState);
        if (!bridgeSession || !bridgeSession.user_claims) {
            res.status(400).json({ error: 'invalid_grant', error_description: 'Session not found or missing claims' });
            return;
        }
        const userClaims = JSON.parse(bridgeSession.user_claims);
        const sub = userClaims['sub'] || userClaims['oid'] || 'unknown';
        const idToken = await (0, tokenService_1.generateIdToken)(userClaims, client_id, bridgeSession.nonce);
        const accessToken = await (0, tokenService_1.generateAccessToken)(sub, client_id);
        (0, auditLog_1.createAuditLog)('token_issued', client_id, `sub: ${sub}`, req.ip || null);
        res.json({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            id_token: idToken,
            scope: 'openid profile email',
        });
    }
    catch (err) {
        next(err);
    }
}
async function userinfo(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'invalid_token' });
            return;
        }
        const tokenStr = authHeader.substring(7);
        const payload = await (0, tokenService_1.validateAccessToken)(tokenStr);
        if (!payload) {
            res.status(401).json({ error: 'invalid_token' });
            return;
        }
        res.json({ sub: payload['sub'], ...payload });
    }
    catch (err) {
        next(err);
    }
}
