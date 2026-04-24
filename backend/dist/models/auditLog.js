"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = createAuditLog;
exports.getAuditLogs = getAuditLogs;
exports.getAuditLogsCount = getAuditLogsCount;
const database_1 = require("./database");
function createAuditLog(action, user, details, ipAddress) {
    const db = (0, database_1.getDb)();
    db.prepare(`
    INSERT INTO audit_logs (timestamp, action, user, details, ip_address)
    VALUES (?, ?, ?, ?, ?)
  `).run(new Date().toISOString(), action, user, details, ipAddress);
}
function getAuditLogs(limit = 50, offset = 0) {
    const db = (0, database_1.getDb)();
    return db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset);
}
function getAuditLogsCount() {
    const db = (0, database_1.getDb)();
    const row = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get();
    return row.count;
}
