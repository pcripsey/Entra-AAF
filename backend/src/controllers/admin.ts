import { Request, Response } from 'express';
import { config } from '../config';
import { getEntraConfig, setEntraConfig, getAafConfig, setAafConfig, getAttributeMappings, setAttributeMappings } from '../models/config';
import { getAuditLogs, getAuditLogsCount, createAuditLog } from '../models/auditLog';
import { getActiveSessions } from '../services/sessionService';
import { invalidateClientCache, decodeIdTokenHint } from '../services/oidcClientService';

const startTime = Date.now();

type AdminSession = { authenticated?: boolean; username?: string };

export function login(req: Request, res: Response): void {
  const { username, password } = req.body as { username: string; password: string };

  if (username === config.adminUsername && password === config.adminPassword) {
    const sess = (req.session as unknown) as AdminSession;
    sess.authenticated = true;
    sess.username = username;
    createAuditLog('admin_login', username, 'Successful login', req.ip || null);
    res.json({ success: true, username });
  } else {
    createAuditLog('admin_login_failed', username, 'Failed login attempt', req.ip || null);
    res.status(401).json({ error: 'Invalid credentials' });
  }
}

export function logout(req: Request, res: Response): void {
  const sess = (req.session as unknown) as AdminSession;
  const username = sess.username;
  req.session.destroy(() => {
    createAuditLog('admin_logout', username || 'unknown', 'Logged out', req.ip || null);
    res.json({ success: true });
  });
}

export function getStatus(req: Request, res: Response): void {
  const entraConfig = getEntraConfig();
  const aafConfig = getAafConfig();
  res.json({
    status: 'healthy',
    version: '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    entraConfigured: !!(entraConfig.clientId && entraConfig.tenantId),
    aafConfigured: !!(aafConfig.clientId && aafConfig.redirectUris.length),
  });
}

export function getEntraConfigController(req: Request, res: Response): void {
  const cfg = getEntraConfig();
  res.json({
    tenantId: cfg.tenantId,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret ? '***' : '',
    redirectUri: cfg.redirectUri,
  });
}

export function updateEntraConfigController(req: Request, res: Response): void {
  const { tenantId, clientId, clientSecret, redirectUri } = req.body as {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  setEntraConfig(clientId, clientSecret, tenantId, redirectUri);
  invalidateClientCache();
  const sess = (req.session as unknown) as AdminSession;
  createAuditLog('entra_config_updated', sess.username || 'admin', null, req.ip || null);
  res.json({ success: true });
}

export function getAafConfigController(req: Request, res: Response): void {
  const cfg = getAafConfig();
  res.json({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret ? '***' : '',
    redirectUris: cfg.redirectUris,
  });
}

export function updateAafConfigController(req: Request, res: Response): void {
  const { clientId, clientSecret, redirectUris } = req.body as {
    clientId: string;
    clientSecret: string;
    redirectUris: string[];
  };
  setAafConfig(clientId, clientSecret, redirectUris);
  const sess = (req.session as unknown) as AdminSession;
  createAuditLog('aaf_config_updated', sess.username || 'admin', null, req.ip || null);
  res.json({ success: true });
}

export function getSessions(req: Request, res: Response): void {
  const sessions = getActiveSessions();
  const sanitized = sessions.map((s) => {
    let user = 'pending';
    let email: string | null = null;
    let sub: string | null = null;

    if (s.user_claims) {
      const claims = JSON.parse(s.user_claims) as Record<string, unknown>;
      user = (claims['preferred_username'] as string) || (claims['email'] as string) || 'unknown';
      email = (claims['email'] as string) || (claims['upn'] as string) || null;
      sub = (claims['sub'] as string) || (claims['oid'] as string) || null;
    }

    const id_token_hint_decoded = s.id_token_hint ? decodeIdTokenHint(s.id_token_hint) : null;

    // Fall back to id_token_hint for email/sub if not in user_claims
    if (id_token_hint_decoded) {
      if (!email) {
        email = (id_token_hint_decoded['email'] as string) || (id_token_hint_decoded['upn'] as string) || null;
      }
      if (!sub) {
        sub = (id_token_hint_decoded['sub'] as string) || (id_token_hint_decoded['oid'] as string) || null;
      }
    }

    return {
      id: s.id,
      state: s.state,
      user,
      email,
      sub,
      id_token_hint_decoded,
      created_at: s.created_at,
      expires_at: s.expires_at,
      status: s.user_claims ? 'authenticated' : 'pending',
    };
  });
  res.json(sanitized);
}

export function getAuditLogsController(req: Request, res: Response): void {
  const page = parseInt((req.query['page'] as string) || '1', 10);
  const limit = parseInt((req.query['limit'] as string) || '20', 10);
  const offset = (page - 1) * limit;
  const logs = getAuditLogs(limit, offset);
  const total = getAuditLogsCount();
  res.json({ logs, total, page, limit });
}

export function getAttributeMappingsController(req: Request, res: Response): void {
  res.json(getAttributeMappings());
}

export function updateAttributeMappingsController(req: Request, res: Response): void {
  const mappings = req.body as Array<{ source: string; target: string }>;
  setAttributeMappings(mappings);
  const sess = (req.session as unknown) as AdminSession;
  createAuditLog('attribute_mappings_updated', sess.username || 'admin', null, req.ip || null);
  res.json({ success: true });
}

export function getSystemInfo(req: Request, res: Response): void {
  res.json({
    version: '1.0.0',
    nodeVersion: process.version,
    platform: process.platform,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memoryUsage: process.memoryUsage(),
  });
}
