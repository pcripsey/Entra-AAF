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
  created_at: string;
  expires_at: string;
  status: string;
  amr_claims: string | null;
  acr_claims: string | null;
  id_token_hint: string | null;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  action: string;
  user: string | null;
  details: string | null;
  ip_address: string | null;
}

export interface AttributeMapping {
  source: string;
  target: string;
}

export interface SystemStatus {
  status: string;
  version: string;
  uptime: number;
  entraConfigured: boolean;
  aafConfigured: boolean;
}
