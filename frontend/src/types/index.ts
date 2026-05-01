export interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface AafConfig {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
}

export interface Session {
  id: string;
  state: string;
  user: string;
  email: string | null;
  sub: string | null;
  id_token_hint_decoded: Record<string, unknown> | null;
  created_at: string;
  expires_at: string;
  status: string;
  entra_verified: boolean;
  aaf_mfa_verified: boolean;
  step_up_status: 'pending_entra' | 'pending_mfa' | 'completed';
  amr_claims: string | null;
  acr_claims: string | null;
  id_token_hint: string | null;
  requested_claims: string | null;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  action: string;
  user: string | null;
  details: string | null;
  ip_address: string | null;
  source_dns: string | null;
  destination_dns: string | null;
}

export interface AttributeMapping {
  source: string;
  target: string;
}

export interface BackendLogEntry {
  id: number;
  timestamp: string;
  level: string;
  message: string;
}

export interface SystemStatus {
  status: string;
  version: string;
  uptime: number;
  entraConfigured: boolean;
  aafConfigured: boolean;
  stepUpConfigured: boolean;
}
