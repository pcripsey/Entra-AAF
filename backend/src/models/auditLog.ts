import { getDb } from './database';

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  action: string;
  user: string | null;
  details: string | null;
  ip_address: string | null;
}

export function createAuditLog(
  action: string,
  user: string | null,
  details: string | null,
  ipAddress: string | null
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_logs (timestamp, action, user, details, ip_address)
    VALUES (?, ?, ?, ?, ?)
  `).run(new Date().toISOString(), action, user, details, ipAddress);
}

export function getAuditLogs(limit = 50, offset = 0): AuditLogEntry[] {
  const db = getDb();
  return db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset) as AuditLogEntry[];
}

export function getAuditLogsCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as { count: number };
  return row.count;
}
