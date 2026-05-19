# v1.0 Release

## Highlights

v1.0 is the first full production release of the Entra-AAF Bridge. It delivers a complete, battle-tested implementation of both supported authentication flows — **AAF-as-initiator step-up MFA** and **Entra External Authentication Method (EAM)** — together with a full-featured admin console, hardened security, and extensive observability improvements.

---

## New Features

### Entra External Authentication Method (EAM) Flow
- Full EAM provider implementation: Entra redirects users to `/entra-eam` after first-factor authentication; the bridge performs AAF MFA and returns a signed `id_token` back to Entra.
- Support for both `GET` and `POST` (`form_post` response mode) on `/entra-eam`.
- EAM callback now uses an HTML form-POST redirect to Entra to avoid `AADSTS900561` errors that occur with plain HTTP redirects.
- CSP-compliant inline script: EAM redirect page uses a per-request cryptographic nonce so Helmet's strict `script-src` policy does not block auto-submission.

### PKCE Support (RFC 7636)
- `/authorize` accepts `code_challenge` / `code_challenge_method=S256`.
- `/token` validates `code_verifier` against the stored challenge.
- Fully compatible with public (SPA / mobile) clients.

### JWKS Enhancements
- JWKS endpoint now includes `x5c`, `x5t` (SHA-1), and `x5t#S256` (SHA-256) fields as required by RFC 7517.
- A self-signed X.509 certificate is auto-generated alongside the RSA key pair and persisted to disk on first start.

### OIDC Discovery Document Improvements
- `response_types_supported` now advertises `id_token` in addition to `code`.
- `response_modes_supported` field added (`query`, `fragment`, `form_post`).
- Bridge always advertises its own endpoints (never leaks upstream AAF/Entra URLs).

### Login Hint Pass-Through
- `/login/aaf` now forwards `login_hint` (derived from the authenticated Entra user's `preferred_username` / `email`) to AAF's authorization URL so users are not prompted to re-enter their username at the MFA step.
- The `@domain` suffix is automatically stripped before passing the hint to AAF.

### Rolling Sessions
- Express sessions now use `rolling: true` so the 10-minute inactivity timeout resets on each authenticated request.

### Sessions Admin Page — AAF Method Column
- The Sessions page in the admin console now displays the **AAF Method** column showing the `amr_claims` / `acr_claims` returned by AAF's UserInfo endpoint.
- `amr_claims` is populated from the AAF UserInfo response in `callbackAaf` and stored in the session.

---

## Bug Fixes

### AMR / ACR Claim Correctness (AADSTS5001256)
- `amr` is now always returned as a JSON array (never a plain string) in `id_token`, resolving `AADSTS5001256` rejections from Entra.
- `acr` claim is now correctly included in the EAM `id_token`.
- Only RFC 8176-compliant values (`swk`, `otp`, `fido`, etc.) are forwarded to Entra; Entra's internal `mfa` / `pwd` strings are stripped from outbound tokens.
- Entra's `amr` array is correctly isolated from the AAF-bound token payload.

### OIDC Discovery `authorization_endpoint`
- Fixed: discovery document was incorrectly advertising AAF's upstream endpoint instead of the bridge's own `/authorize`.

### Audit Log Improvements
- User identifier (`sub` / `email`) now appears in `aaf_mfa_success` and `auth_success` audit log entries.
- AAF AMR method is recorded in the `aaf_mfa_success` audit log.
- Unknown `client_id` rejections now include the offending value in the audit log detail.

---

## Observability & Debugging

- Detailed debug-level logging for all outbound Entra HTTP requests and responses (headers, status, body).
- Request logger now records sanitised query parameters (secrets redacted) on every incoming request.
- Admin console: debug log-level toggle allows live switching between `info` and `debug` without restart.
- Admin console: OIDC Discovery Config page for configuring `scopes_supported` and `claims_supported`.
- Admin console: live session polling with elapsed-time display and `requested_claims` column.

---

## Security Hardening

- Helmet CSP updated: inline scripts in EAM redirect pages use a per-request nonce (`escapeHtml()` applied for defence-in-depth).
- Authorization codes are persisted in SQLite (`auth_codes` table) rather than in-memory; they survive restarts and expire after 5 minutes (single-use).
- State tokens are UUID-correlated single-use codes.

---

## Breaking / Migration Notes

- No breaking API changes relative to V0.9.
- The `auth_codes` SQLite table is created automatically on first start (migration-safe).
- New session columns (`amr_claims`, `acr_claims`, `id_token_hint`, `code_challenge`, `code_challenge_method`, `is_entra_initiated`, `entra_transaction_id`) are added automatically via `ALTER TABLE` migrations for existing databases.

---

# v0.9 Release

Major milestone release adding the Entra External Authentication Method (EAM) flow, PKCE, SQLite-backed authorization codes, and significant admin console improvements.

---

# v0.1 Release

This is the initial release of the repository.