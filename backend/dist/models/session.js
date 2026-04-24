"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSession = createSession;
exports.getSession = getSession;
exports.updateSessionTokens = updateSessionTokens;
exports.setAafAuthCode = setAafAuthCode;
exports.deleteSession = deleteSession;
exports.cleanupExpiredSessions = cleanupExpiredSessions;
exports.getAllActiveSessions = getAllActiveSessions;
const uuid_1 = require("uuid");
const database_1 = require("./database");
function createSession(state, nonce, expiresAt, aafRedirectUri, aafClientId) {
    const db = (0, database_1.getDb)();
    const session = {
        id: (0, uuid_1.v4)(),
        state,
        nonce,
        entra_tokens: null,
        aaf_auth_code: null,
        user_claims: null,
        aaf_redirect_uri: aafRedirectUri || null,
        aaf_client_id: aafClientId || null,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
    };
    db.prepare(`
    INSERT INTO sessions (id, state, nonce, entra_tokens, aaf_auth_code, user_claims, aaf_redirect_uri, aaf_client_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(session.id, session.state, session.nonce, null, null, null, session.aaf_redirect_uri, session.aaf_client_id, session.created_at, session.expires_at);
    return session;
}
function getSession(state) {
    const db = (0, database_1.getDb)();
    const row = db.prepare('SELECT * FROM sessions WHERE state = ?').get(state);
    return row || null;
}
function updateSessionTokens(state, entraTokens, userClaims) {
    const db = (0, database_1.getDb)();
    db.prepare('UPDATE sessions SET entra_tokens = ?, user_claims = ? WHERE state = ?')
        .run(JSON.stringify(entraTokens), JSON.stringify(userClaims), state);
}
function setAafAuthCode(state, code) {
    const db = (0, database_1.getDb)();
    db.prepare('UPDATE sessions SET aaf_auth_code = ? WHERE state = ?').run(code, state);
}
function deleteSession(state) {
    const db = (0, database_1.getDb)();
    db.prepare('DELETE FROM sessions WHERE state = ?').run(state);
}
function cleanupExpiredSessions() {
    const db = (0, database_1.getDb)();
    const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    return result.changes;
}
function getAllActiveSessions() {
    const db = (0, database_1.getDb)();
    return db.prepare('SELECT * FROM sessions WHERE expires_at > ?').all(new Date().toISOString());
}
