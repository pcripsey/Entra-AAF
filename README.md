# Entra-AAF Bridge

An OIDC bridge application that connects Microsoft Entra ID (Azure AD) as an identity provider with OpenText Advanced Authentication Framework (AAF) as an MFA provider.  The bridge supports **two complementary authentication flows**:

1. **AAF-as-initiator (standard step-up)** — AAF calls the bridge as an OIDC provider; the bridge orchestrates Entra first-factor and AAF MFA second-factor before issuing a federated token.
2. **Entra-as-initiator (EAM / External Authentication Method)** — Entra calls the bridge after completing its own first-factor authentication so the bridge can enforce AAF MFA as the second factor and return a signed result to Entra.

## Architecture

The bridge acts as:
- **OIDC Provider** (to OpenText AAF): Exposes standard OIDC endpoints
- **OIDC Client** (to Microsoft Entra ID): Authenticates users via Entra ID (first factor)
- **OIDC Client** (to AAF MFA): Routes authenticated Entra users to AAF for MFA (second factor)
- **External Authentication Method provider** (to Entra EAM): Receives Entra-initiated requests after first-factor auth, performs AAF MFA, and returns a signed id_token to Entra

## Flow 1 — AAF-as-initiator (standard step-up)

When `AAF_AUTHORIZE_ENDPOINT` is configured the bridge orchestrates a two-hop step-up:

```
AAF → GET /authorize
         ↓
   GET /login/entra  (bridge redirects to Entra ID for 1FA)
         ↓
   Entra ID login
         ↓
   GET /callback/entra (bridge validates Entra auth, marks entra_verified)
         ↓
   GET /login/aaf   (bridge redirects to AAF for MFA)
         ↓
   AAF MFA           (second factor)
         ↓
   GET /callback/aaf  (bridge validates MFA, marks aaf_mfa_verified)
         ↓
AAF ← auth code  (bridge issues code → AAF exchanges at /token)
         ↓
   POST /token       (bridge issues JWT with aal=MFA, amr=[mfa,aaf])
```

If `AAF_AUTHORIZE_ENDPOINT` is not set, step-up is disabled and the bridge falls back to the original Entra-only flow.

### AAF-as-initiator with `id_token_hint` shortcut

When AAF (or any OIDC relying party) passes a cryptographically valid `id_token_hint` in the `/authorize` request, the bridge treats it as proof that Entra first-factor authentication has already been completed and skips the Entra redirect, proceeding directly to AAF MFA.  This is useful when the calling application already holds a valid Entra ID token.

## Flow 2 — Entra-as-initiator (External Authentication Method)

When Microsoft Entra Conditional Access is configured to use this bridge as an **External Authentication Method**, Entra redirects the user here after its own first-factor authentication:

```
User → Entra ID (1FA: password / passkey)
                  ↓
   Entra Conditional Access requires External MFA
                  ↓
   GET /entra-eam  (Entra redirects user to bridge)
                  ↓
   GET /login/aaf  (bridge redirects to AAF for MFA)
                  ↓
   AAF MFA         (second factor)
                  ↓
   GET /callback/aaf (bridge validates MFA, marks aaf_mfa_verified)
                  ↓
   Entra ← id_token  (bridge issues signed id_token with amr=[mfa,aaf])
                  ↓
   Entra issues its token with step-up claims
```

### Azure configuration steps for EAM

1. Register the bridge as an **External Authentication Method** in your Entra tenant under **Security → Authentication methods → External Authentication Methods**.
2. Set the **Authentication provider URL** to `{BASE_URL}/entra-eam`.
3. Set the **Client ID** to the bridge's Entra App Registration `ENTRA_CLIENT_ID`.
4. In the Entra App Registration for the bridge, add `{BASE_URL}/entra-eam` as a redirect URI.
5. Create a **Conditional Access policy** that requires the external MFA for the target applications.
6. Optionally set `ENTRA_EAM_ALLOWED_REDIRECT_URIS` if your tenant uses a non-standard Entra redirect domain.

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
| `CLUSTER_ENABLED` | Enable Node.js clustering (`true` forks one worker per CPU core) | `false` |
| `CLEANUP_INTERVAL_MS` | Interval for expired session/auth-code cleanup job | `300000` |
| `RATE_LIMIT_WINDOW_MS` | OIDC rate-limit window in milliseconds | `60000` |
| `RATE_LIMIT_MAX` | OIDC rate-limit max requests per IP per window | `200` |
| `SESSION_SECRET` | Session encryption secret | required |
| `ADMIN_USERNAME` | Admin UI username | `admin` |
| `ADMIN_PASSWORD` | Admin UI password | required |
| `ENTRA_TENANT_ID` | Azure AD Tenant ID | - |
| `ENTRA_CLIENT_ID` | Entra App Client ID | - |
| `ENTRA_CLIENT_SECRET` | Entra App Client Secret | - |
| `ENTRA_REDIRECT_URI` | Entra redirect URI (use `/callback/entra`) | - |
| `ENTRA_DISCOVERY_URL` | Override the OIDC discovery URL (sovereign clouds) | - |
| `AAF_CLIENT_ID` | AAF's OIDC client ID for calling this bridge | - |
| `AAF_CLIENT_SECRET` | AAF's OIDC client secret | - |
| `AAF_REDIRECT_URIS` | Comma-separated list of AAF redirect URIs | - |
| `AAF_AUTHORIZE_ENDPOINT` | **Step-up**: AAF authorization endpoint URL (enables step-up) | - |
| `AAF_TOKEN_ENDPOINT` | **Step-up**: AAF token endpoint for MFA code exchange | - |
| `AAF_USERINFO_ENDPOINT` | **Step-up**: AAF UserInfo endpoint | - |
| `AAF_MFA_CLIENT_ID` | **Step-up**: Bridge's client ID registered at AAF's auth server | - |
| `AAF_MFA_CLIENT_SECRET` | **Step-up**: Bridge's client secret at AAF's auth server | - |
| `ENTRA_EAM_ALLOWED_REDIRECT_URIS` | **EAM**: Extra allowed Entra redirect URIs (comma-separated) | - |

### Entra ID App Registration

1. Register an app in Azure Portal
2. Set redirect URI to `{BASE_URL}/callback/entra` (or `/callback` for backward compatibility)
3. For the EAM flow, also add `{BASE_URL}/entra-eam` as a redirect URI
4. Grant `openid`, `profile`, `email` permissions
5. Copy Tenant ID, Client ID, Client Secret

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
| `/authorize` | GET | Authorization endpoint (AAF entry point, initiates step-up; also accepts `id_token_hint` to skip Entra 1FA) |
| `/login/entra` | GET | Redirects user to Entra ID for first-factor authentication |
| `/callback/entra` | GET | Entra ID callback; validates token and proceeds to AAF MFA |
| `/login/aaf` | GET | Redirects user to AAF for second-factor MFA |
| `/callback/aaf` | GET | AAF MFA callback; validates MFA completion and issues auth code or id_token |
| `/callback` | GET | Backward-compatible alias for `/callback/entra` |
| `/entra-eam` | GET, POST | **EAM entry point**: Entra redirects users here after 1FA; bridge performs AAF MFA and returns id_token to Entra |
| `/token` | POST | Token endpoint (requires both Entra + AAF MFA when step-up is enabled; validates PKCE `code_verifier` when `code_challenge` was used) |
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

## Scalability Notes

- Set `CLUSTER_ENABLED=true` to run one Node.js worker per CPU core. The primary process initializes the database once and workers serve traffic.
- OIDC routes (`/`) are protected by configurable rate limits using `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`. Admin APIs (`/api/admin`) are limited to 60 requests/minute/IP.
- Expired bridge sessions and authorization codes are cleaned automatically every `CLEANUP_INTERVAL_MS` milliseconds (default 5 minutes).
- For production (500+ concurrent users), run behind a reverse proxy (nginx/Caddy) for TLS termination and connection handling.
- SQLite with WAL mode is suitable for ~500 concurrent users on a single node. For higher scale or multi-node deployments, migrate to PostgreSQL.

## Security Notes

- RSA key pair is auto-generated on first start
- All secrets should be rotated regularly
- Admin password must be set via environment variable
- Sessions expire after 10 minutes
- Authorization codes are stored in SQLite (survive restarts) and expire after 5 minutes
- PKCE (RFC 7636) is supported: include `code_challenge` / `code_challenge_method=S256` in `/authorize` and `code_verifier` in `/token`
- State tokens are correlated by UUID — single-use authorization codes expire after 5 minutes
- Admin console uses local session authentication, completely isolated from Entra/AAF flows
- EAM endpoint validates `client_id` and `redirect_uri`; optionally validates an Entra-signed `request` JWT for cryptographic proof of origin
