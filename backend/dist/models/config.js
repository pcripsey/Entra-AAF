"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
exports.setConfig = setConfig;
exports.getAllConfig = getAllConfig;
exports.setEntraConfig = setEntraConfig;
exports.getEntraConfig = getEntraConfig;
exports.setAafConfig = setAafConfig;
exports.getAafConfig = getAafConfig;
exports.getAttributeMappings = getAttributeMappings;
exports.setAttributeMappings = setAttributeMappings;
const database_1 = require("./database");
function getConfig(key) {
    const db = (0, database_1.getDb)();
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : null;
}
function setConfig(key, value) {
    const db = (0, database_1.getDb)();
    db.prepare(`
    INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
}
function getAllConfig() {
    const db = (0, database_1.getDb)();
    const rows = db.prepare('SELECT key, value FROM config').all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
function setEntraConfig(clientId, clientSecret, tenantId, redirectUri) {
    setConfig('entra.clientId', clientId);
    setConfig('entra.clientSecret', clientSecret);
    setConfig('entra.tenantId', tenantId);
    setConfig('entra.redirectUri', redirectUri);
}
function getEntraConfig() {
    return {
        clientId: getConfig('entra.clientId') || '',
        clientSecret: getConfig('entra.clientSecret') || '',
        tenantId: getConfig('entra.tenantId') || '',
        redirectUri: getConfig('entra.redirectUri') || '',
    };
}
function setAafConfig(clientId, clientSecret, redirectUris) {
    setConfig('aaf.clientId', clientId);
    setConfig('aaf.clientSecret', clientSecret);
    setConfig('aaf.redirectUris', JSON.stringify(redirectUris));
}
function getAafConfig() {
    const redirectUrisRaw = getConfig('aaf.redirectUris');
    return {
        clientId: getConfig('aaf.clientId') || '',
        clientSecret: getConfig('aaf.clientSecret') || '',
        redirectUris: redirectUrisRaw ? JSON.parse(redirectUrisRaw) : [],
    };
}
function getAttributeMappings() {
    const raw = getConfig('attribute.mappings');
    if (raw) {
        try {
            return JSON.parse(raw);
        }
        catch {
            return [];
        }
    }
    return [
        { source: 'upn', target: 'email' },
        { source: 'displayName', target: 'name' },
        { source: 'objectId', target: 'sub' },
    ];
}
function setAttributeMappings(mappings) {
    setConfig('attribute.mappings', JSON.stringify(mappings));
}
