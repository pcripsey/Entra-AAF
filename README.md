# Entra-AAF Bridge

An OIDC bridge application that connects Microsoft Entra ID (Azure AD) as an upstream identity provider with OpenText Advanced Authentication Framework (AAF) as a downstream OIDC consumer.

## Architecture

The bridge acts as:
- **OIDC Provider** (to OpenText AAF): Exposes standard OIDC endpoints
- **OIDC Client** (to Microsoft Entra ID): Authenticates users via Entra ID

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
| `ENTRA_REDIRECT_URI` | Entra redirect URI | - |

### Entra ID App Registration

1. Register an app in Azure Portal
2. Set redirect URI to `{BASE_URL}/callback`
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
| `/authorize` | GET | Authorization endpoint |
| `/callback` | GET | Entra ID callback |
| `/token` | POST | Token endpoint |
| `/userinfo` | GET | UserInfo endpoint |
| `/health` | GET | Health check |

## Admin UI

| Page | Description |
|------|-------------|
| Dashboard | System status and recent activity |
| Entra ID Config | Configure Entra ID connection |
| AAF Config | Configure AAF client credentials |
| Sessions | View active bridge sessions |
| Attribute Mapping | Map Entra claims to AAF claims |
| Audit Logs | View authentication audit trail |

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
