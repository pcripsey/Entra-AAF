import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

let db: Database.Database;

export function initializeDatabase(): void {
  const dbPath = path.resolve(config.dbPath);
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      state TEXT UNIQUE NOT NULL,
      nonce TEXT,
      entra_tokens TEXT,
      aaf_auth_code TEXT,
      user_claims TEXT,
      aaf_redirect_uri TEXT,
      aaf_client_id TEXT,
      amr_claims TEXT,
      acr_claims TEXT,
      id_token_hint TEXT,
      entra_verified INTEGER NOT NULL DEFAULT 0,
      aaf_mfa_verified INTEGER NOT NULL DEFAULT 0,
      aaf_original_state TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      user TEXT,
      details TEXT,
      ip_address TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migrate existing databases by adding new columns if they don't exist
  const sessionColumns = (db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).map(c => c.name);
  if (!sessionColumns.includes('amr_claims')) {
    db.exec('ALTER TABLE sessions ADD COLUMN amr_claims TEXT');
  }
  if (!sessionColumns.includes('acr_claims')) {
    db.exec('ALTER TABLE sessions ADD COLUMN acr_claims TEXT');
  }
  if (!sessionColumns.includes('id_token_hint')) {
    db.exec('ALTER TABLE sessions ADD COLUMN id_token_hint TEXT');
  }
  if (!sessionColumns.includes('entra_verified')) {
    db.exec('ALTER TABLE sessions ADD COLUMN entra_verified INTEGER NOT NULL DEFAULT 0');
  }
  if (!sessionColumns.includes('aaf_mfa_verified')) {
    db.exec('ALTER TABLE sessions ADD COLUMN aaf_mfa_verified INTEGER NOT NULL DEFAULT 0');
  }
  if (!sessionColumns.includes('aaf_original_state')) {
    db.exec('ALTER TABLE sessions ADD COLUMN aaf_original_state TEXT');
  }
  if (!sessionColumns.includes('requested_claims')) {
    db.exec('ALTER TABLE sessions ADD COLUMN requested_claims TEXT');
  }

  // Migrate audit_logs table to add DNS columns if they don't exist
  const auditColumns = (db.prepare('PRAGMA table_info(audit_logs)').all() as { name: string }[]).map(c => c.name);
  if (!auditColumns.includes('source_dns')) {
    db.exec('ALTER TABLE audit_logs ADD COLUMN source_dns TEXT');
  }
  if (!auditColumns.includes('destination_dns')) {
    db.exec('ALTER TABLE audit_logs ADD COLUMN destination_dns TEXT');
  }

  logger.info('Database initialized.');
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}
