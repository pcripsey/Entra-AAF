import { getDb } from './database';

export function getConfig(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setConfig(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
}

export function getAllConfig(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setEntraConfig(clientId: string, clientSecret: string, tenantId: string, redirectUri: string): void {
  setConfig('entra.clientId', clientId);
  setConfig('entra.clientSecret', clientSecret);
  setConfig('entra.tenantId', tenantId);
  setConfig('entra.redirectUri', redirectUri);
}

export function getEntraConfig(): { clientId: string; clientSecret: string; tenantId: string; redirectUri: string } {
  return {
    clientId: getConfig('entra.clientId') || '',
    clientSecret: getConfig('entra.clientSecret') || '',
    tenantId: getConfig('entra.tenantId') || '',
    redirectUri: getConfig('entra.redirectUri') || '',
  };
}

export function setAafConfig(clientId: string, clientSecret: string, redirectUris: string[]): void {
  setConfig('aaf.clientId', clientId);
  setConfig('aaf.clientSecret', clientSecret);
  setConfig('aaf.redirectUris', JSON.stringify(redirectUris));
}

export function getAafConfig(): { clientId: string; clientSecret: string; redirectUris: string[] } {
  const redirectUrisRaw = getConfig('aaf.redirectUris');
  return {
    clientId: getConfig('aaf.clientId') || '',
    clientSecret: getConfig('aaf.clientSecret') || '',
    redirectUris: redirectUrisRaw ? JSON.parse(redirectUrisRaw) as string[] : [],
  };
}

export function getAttributeMappings(): Array<{ source: string; target: string }> {
  const raw = getConfig('attribute.mappings');
  if (raw) {
    try {
      return JSON.parse(raw) as Array<{ source: string; target: string }>;
    } catch {
      return [];
    }
  }
  return [
    { source: 'upn', target: 'email' },
    { source: 'displayName', target: 'name' },
    { source: 'objectId', target: 'sub' },
  ];
}

export function setAttributeMappings(mappings: Array<{ source: string; target: string }>): void {
  setConfig('attribute.mappings', JSON.stringify(mappings));
}
