"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBridgeSession = createBridgeSession;
exports.getBridgeSession = getBridgeSession;
exports.removeBridgeSession = removeBridgeSession;
exports.getActiveSessions = getActiveSessions;
const session_1 = require("../models/session");
function createBridgeSession(state, nonce, aafRedirectUri, aafClientId) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    return (0, session_1.createSession)(state, nonce, expiresAt, aafRedirectUri, aafClientId);
}
function getBridgeSession(state) {
    return (0, session_1.getSession)(state);
}
function removeBridgeSession(state) {
    (0, session_1.deleteSession)(state);
}
function getActiveSessions() {
    return (0, session_1.getAllActiveSessions)();
}
