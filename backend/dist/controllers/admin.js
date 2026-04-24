"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.logout = logout;
exports.getStatus = getStatus;
exports.getEntraConfigController = getEntraConfigController;
exports.updateEntraConfigController = updateEntraConfigController;
exports.getAafConfigController = getAafConfigController;
exports.updateAafConfigController = updateAafConfigController;
exports.getSessions = getSessions;
exports.getAuditLogsController = getAuditLogsController;
exports.getAttributeMappingsController = getAttributeMappingsController;
exports.updateAttributeMappingsController = updateAttributeMappingsController;
exports.getSystemInfo = getSystemInfo;
const config_1 = require("../config");
const config_2 = require("../models/config");
const auditLog_1 = require("../models/auditLog");
const sessionService_1 = require("../services/sessionService");
const oidcClientService_1 = require("../services/oidcClientService");
const startTime = Date.now();
function login(req, res) {
    const { username, password } = req.body;
    if (username === config_1.config.adminUsername && password === config_1.config.adminPassword) {
        const sess = req.session;
        sess.authenticated = true;
        sess.username = username;
        (0, auditLog_1.createAuditLog)('admin_login', username, 'Successful login', req.ip || null);
        res.json({ success: true, username });
    }
    else {
        (0, auditLog_1.createAuditLog)('admin_login_failed', username, 'Failed login attempt', req.ip || null);
        res.status(401).json({ error: 'Invalid credentials' });
    }
}
function logout(req, res) {
    const sess = req.session;
    const username = sess.username;
    req.session.destroy(() => {
        (0, auditLog_1.createAuditLog)('admin_logout', username || 'unknown', 'Logged out', req.ip || null);
        res.json({ success: true });
    });
}
function getStatus(req, res) {
    const entraConfig = (0, config_2.getEntraConfig)();
    const aafConfig = (0, config_2.getAafConfig)();
    res.json({
        status: 'healthy',
        version: '1.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        entraConfigured: !!(entraConfig.clientId && entraConfig.tenantId),
        aafConfigured: !!(aafConfig.clientId && aafConfig.redirectUris.length),
    });
}
function getEntraConfigController(req, res) {
    const cfg = (0, config_2.getEntraConfig)();
    res.json({
        tenantId: cfg.tenantId,
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret ? '***' : '',
        redirectUri: cfg.redirectUri,
    });
}
function updateEntraConfigController(req, res) {
    const { tenantId, clientId, clientSecret, redirectUri } = req.body;
    (0, config_2.setEntraConfig)(clientId, clientSecret, tenantId, redirectUri);
    (0, oidcClientService_1.invalidateClientCache)();
    const sess = req.session;
    (0, auditLog_1.createAuditLog)('entra_config_updated', sess.username || 'admin', null, req.ip || null);
    res.json({ success: true });
}
function getAafConfigController(req, res) {
    const cfg = (0, config_2.getAafConfig)();
    res.json({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret ? '***' : '',
        redirectUris: cfg.redirectUris,
    });
}
function updateAafConfigController(req, res) {
    const { clientId, clientSecret, redirectUris } = req.body;
    (0, config_2.setAafConfig)(clientId, clientSecret, redirectUris);
    const sess = req.session;
    (0, auditLog_1.createAuditLog)('aaf_config_updated', sess.username || 'admin', null, req.ip || null);
    res.json({ success: true });
}
function getSessions(req, res) {
    const sessions = (0, sessionService_1.getActiveSessions)();
    const sanitized = sessions.map((s) => {
        let user = 'pending';
        if (s.user_claims) {
            const claims = JSON.parse(s.user_claims);
            user = claims['preferred_username'] || claims['email'] || 'unknown';
        }
        return {
            id: s.id,
            state: s.state,
            user,
            created_at: s.created_at,
            expires_at: s.expires_at,
            status: s.user_claims ? 'authenticated' : 'pending',
        };
    });
    res.json(sanitized);
}
function getAuditLogsController(req, res) {
    const page = parseInt(req.query['page'] || '1', 10);
    const limit = parseInt(req.query['limit'] || '20', 10);
    const offset = (page - 1) * limit;
    const logs = (0, auditLog_1.getAuditLogs)(limit, offset);
    const total = (0, auditLog_1.getAuditLogsCount)();
    res.json({ logs, total, page, limit });
}
function getAttributeMappingsController(req, res) {
    res.json((0, config_2.getAttributeMappings)());
}
function updateAttributeMappingsController(req, res) {
    const mappings = req.body;
    (0, config_2.setAttributeMappings)(mappings);
    const sess = req.session;
    (0, auditLog_1.createAuditLog)('attribute_mappings_updated', sess.username || 'admin', null, req.ip || null);
    res.json({ success: true });
}
function getSystemInfo(req, res) {
    res.json({
        version: '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        memoryUsage: process.memoryUsage(),
    });
}
