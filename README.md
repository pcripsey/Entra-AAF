# Entra-AAF Bridge

An OIDC bridge application that connects Microsoft Entra ID (Azure AD) as an upstream identity provider with OpenText Advanced Authentication Framework (AAF) as a downstream OIDC consumer, supporting a **step-up authentication flow** where users authenticate with Entra first, then proceed to AAF for second-factor MFA, before the bridge issues federated tokens.

## Architecture

The bridge acts as:
- **OIDC Provider** (to OpenText AAF): Exposes standard OIDC endpoints
- **OIDC Client** (to Microsoft Entra ID): Authenticates users via Entra ID (first factor)
- **OIDC Client** (to AAF MFA): Routes authenticated Entra users to AAF for MFA (second factor, optional)

## Step-Up Authentication Flow

When `AAF_AUTHORIZE_ENDPOINT` is configured the bridge orchestrates a two-hop step-up:

```
AAF → /authorize
         ↓
    /login/entra  (bridge redirects to Entra ID)
         ↓
  Entra ID login
         ↓
  /callback/entra (bridge validates Entra auth, marks entra_verified)
         ↓
    /login/aaf   (bridge redirects to AAF for MFA)
         ↓
  AAF MFA         (second factor)
         ↓
  /callback/aaf  (bridge validates MFA, marks aaf_mfa_verified)
         ↓
AAF ← auth code  (bridge issues code → AAF exchanges at /token)
         ↓
  /token          (bridge issues JWT with aal=MFA, amr=[mfa,aaf])
```

If `AAF_AUTHORIZE_ENDPOINT` is not set, step-up is disabled and the bridge falls back to the original Entra-only flow.

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Microsoft Entra ID app registration

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env with your actual values
```

### 2. Start with Docker Compose

```bash
docker-compose up -d
```

### 3. Access Admin UI

Open http://localhost (frontend) and login with your configured admin credentials.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_URL` | Public URL of the bridge | required |
| `SESSION_SECRET` | Session encryption secret | required |
| `ADMIN_USERNAME` | Admin UI username | `admin` |
| `ADMIN_PASSWORD` | Admin UI password | required |
| `ENTRA_TENANT_ID` | Azure AD Tenant ID | - |
| `ENTRA_CLIENT_ID` | Entra App Client ID | - |
| `ENTRA_CLIENT_SECRET` | Entra App Client Secret | - |
| `ENTRA_REDIRECT_URI` | Entra redirect URI (use `/callback/entra`) | - |
| `AAF_CLIENT_ID` | AAF's OIDC client ID for calling this bridge | - |
| `AAF_CLIENT_SECRET` | AAF's OIDC client secret | - |
| `AAF_REDIRECT_URIS` | Comma-separated list of AAF redirect URIs | - |
| `AAF_AUTHORIZE_ENDPOINT` | **Step-up**: AAF authorization endpoint URL (enables step-up) | - |
| `AAF_TOKEN_ENDPOINT` | **Step-up**: AAF token endpoint for MFA code exchange | - |
| `AAF_USERINFO_ENDPOINT` | **Step-up**: AAF UserInfo endpoint | - |
| `AAF_MFA_CLIENT_ID` | **Step-up**: Bridge's client ID registered at AAF's auth server | - |
| `AAF_MFA_CLIENT_SECRET` | **Step-up**: Bridge's client secret at AAF's auth server | - |

### Entra ID App Registration

1. Register an app in Azure Portal
2. Set redirect URI to `{BASE_URL}/callback/entra` (or `/callback` for backward compatibility)
3. Grant `openid`, `profile`, `email` permissions
4. Copy Tenant ID, Client ID, Client Secret

### OpenText AAF Configuration

Configure AAF to use this bridge as an OIDC provider:
- **Authorization Endpoint**: `{BASE_URL}/authorize`
- **Token Endpoint**: `{BASE_URL}/token`
- **JWKS URI**: `{BASE_URL}/.well-known/jwks.json`
- **Discovery**: `{BASE_URL}/.well-known/openid-configuration`

## OIDC Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/openid-configuration` | GET | OIDC discovery document |
| `/.well-known/jwks.json` | GET | JSON Web Key Set |
| `/authorize` | GET | Authorization endpoint (AAF entry point, initiates step-up) |
| `/login/entra` | GET | Redirects user to Entra ID for first-factor authentication |
| `/callback/entra` | GET | Entra ID callback; validates token and proceeds to AAF MFA |
| `/login/aaf` | GET | Redirects user to AAF for second-factor MFA |
| `/callback/aaf` | GET | AAF MFA callback; validates MFA completion and issues auth code |
| `/callback` | GET | Backward-compatible alias for `/callback/entra` |
| `/token` | POST | Token endpoint (requires both Entra + AAF MFA when step-up is enabled) |
| `/userinfo` | GET | UserInfo endpoint |
| `/health` | GET | Health check |

## Issued Token Claims

When step-up is enabled, the final JWT contains:
- Entra user claims (`sub`, `email`, `name`, `groups`, etc.)
- `aal: "MFA"` — authentication assurance level
- `amr: [..., "mfa", "aaf"]` — authentication methods including AAF MFA

## Admin UI

| Page | Description |
|------|-------------|
| Dashboard | System status, step-up MFA indicator, and recent activity |
| Entra ID Config | Configure Entra ID connection |
| AAF Config | Configure AAF OIDC client credentials |
| AAF MFA Config | Configure step-up MFA (AAF as second factor) |
| Sessions | View active sessions with step-up status (Awaiting Entra / Awaiting MFA / Completed) |
| Attribute Mapping | Map Entra claims to AAF claims |
| User Access Log | View authentication audit trail |
| Backend Logs | View server logs |

## Development

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm start
```

## Security Notes

- RSA key pair is auto-generated on first start
- All secrets should be rotated regularly
- Admin password must be set via environment variable
- Sessions expire after 10 minutes
- State tokens are correlated by UUID — single-use authorization codes expire after 5 minutes
- Admin console uses local session authentication, completely isolated from Entra/AAF flows
