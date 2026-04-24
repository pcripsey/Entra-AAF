"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEntraClient = getEntraClient;
exports.generateAuthorizationUrl = generateAuthorizationUrl;
exports.exchangeCode = exchangeCode;
exports.getUserInfo = getUserInfo;
exports.invalidateClientCache = invalidateClientCache;
const openid_client_1 = require("openid-client");
const config_1 = require("../models/config");
const config_2 = require("../config");
const logger_1 = require("../utils/logger");
let cachedClient = null;
let cachedTenantId = '';
async function getEntraClient() {
    const entraConfig = (0, config_1.getEntraConfig)();
    const tenantId = entraConfig.tenantId || config_2.config.entra.tenantId;
    const clientId = entraConfig.clientId || config_2.config.entra.clientId;
    const clientSecret = entraConfig.clientSecret || config_2.config.entra.clientSecret;
    const redirectUri = entraConfig.redirectUri || config_2.config.entra.redirectUri;
    if (cachedClient && cachedTenantId === tenantId) {
        return cachedClient;
    }
    if (!tenantId || !clientId) {
        throw new Error('Entra ID not configured');
    }
    logger_1.logger.info(`Discovering Entra ID OIDC configuration for tenant: ${tenantId}`);
    const issuer = await openid_client_1.Issuer.discover(`https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`);
    cachedClient = new issuer.Client({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: [redirectUri],
        response_types: ['code'],
    });
    cachedTenantId = tenantId;
    return cachedClient;
}
async function generateAuthorizationUrl(state, nonce) {
    const client = await getEntraClient();
    const entraConfig = (0, config_1.getEntraConfig)();
    return client.authorizationUrl({
        scope: 'openid profile email',
        state,
        nonce,
        redirect_uri: entraConfig.redirectUri || config_2.config.entra.redirectUri,
    });
}
async function exchangeCode(code, state) {
    const client = await getEntraClient();
    const entraConfig = (0, config_1.getEntraConfig)();
    const tokenSet = await client.callback(entraConfig.redirectUri || config_2.config.entra.redirectUri, { code, state }, { state });
    return tokenSet;
}
async function getUserInfo(tokenSet) {
    const claims = tokenSet.claims();
    return claims;
}
function invalidateClientCache() {
    cachedClient = null;
    cachedTenantId = '';
}
