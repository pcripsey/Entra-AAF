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

export function getAuditLogs(limit = 50, offset = 0, actions?: string[]): AuditLogEntry[] {
  const db = getDb();
  if (actions && actions.length > 0) {
    // placeholders is built only from '?' literals — no user input is interpolated into the SQL text
    const placeholders = actions.map(() => '?').join(',');
    return db.prepare(
      `SELECT * FROM audit_logs WHERE action IN (${placeholders}) ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).all(...actions, limit, offset) as AuditLogEntry[];
  }
  return db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset) as AuditLogEntry[];
}

export function getAuditLogsCount(actions?: string[]): number {
  const db = getDb();
  if (actions && actions.length > 0) {
    // placeholders is built only from '?' literals — no user input is interpolated into the SQL text
    const placeholders = actions.map(() => '?').join(',');
    const row = db.prepare(
      `SELECT COUNT(*) as count FROM audit_logs WHERE action IN (${placeholders})`
    ).get(...actions) as { count: number };
    return row.count;
  }
  const row = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as { count: number };
  return row.count;
}
