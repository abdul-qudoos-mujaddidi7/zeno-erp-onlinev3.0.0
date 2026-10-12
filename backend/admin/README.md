# Dedicated ZenoERP platform administrator authentication

The new `/superadmin` panel has separate accounts and sessions. `/api/superadmin`, ERP `users`, password hashes, bearer login, frontend protocols and business tables are unchanged. There is no default account, password, recovery bypass, or public provisioning endpoint.

## Setup

Run from the project directory in an operator terminal:

```powershell
cd backend
npm.cmd ci --ignore-scripts
node scripts/run-migration.js 20261012_platform_administrator_auth.sql --dry-run
node scripts/run-migration.js 20261012_platform_administrator_auth.sql
node admin/cli.js create
npm.cmd start
```

On other shells use `npm` instead of `npm.cmd`. The migration is additive and rerunnable through the existing runner. It creates seven platform-authentication tables only; it seeds no accounts. The first provisioning command creates the minimal role/permission policy in the same transaction as the new account and audit records. No SQL migrations are run at application startup.

Login URL: `http://localhost:3001/superadmin/login` (substitute the configured port/HTTPS deployment URL). Anonymous overview requests receive a rendered 401 page linking to sign-in. Missing/invalid configuration or unavailable database/schema/audit storage returns a safe 503 page.

`create` prompts for username, display name, password and confirmation. Password input is hidden, including pasted characters. Piped input, password arguments and default passwords are refused. Account usernames use 3–64 ASCII letters/digits/dot/underscore/hyphen and are normalized to lowercase. Passwords require at least 12 characters and at most 72 UTF-8 bytes. Passwords use bcryptjs 3.0.3 with individual salts and cost 12; overlength input is rejected rather than silently truncated. Credentials, hashes, secrets and session tokens are never printed by the CLI or included in audit records.

## Environment names

Existing backend/database variables:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (required).
- `SESSION_SECRET` (existing ERP session secret; keep it unchanged).
- `PORT` (optional; defaults to 3001).
- `NODE_ENV` (set to `production` for the deployed backend).

New panel:

- `ADMIN_SESSION_SECRET` (required for web access): independently generated high-entropy secret, 32–512 characters, different from `SESSION_SECRET`. No fallback to the ERP secret. Do not commit `.env` or secrets.
- `ADMIN_TRUST_PROXY` (optional): an explicitly trusted proxy range, for example `loopback` when the TLS terminator connects locally, or the actual trusted CIDR range. Configure according to deployment topology, never broad trust-all behavior. Invalid ranges disable the new panel only.

The existing shared pool uses `DB_CONNECTION_LIMIT` optionally. Provisioning requires database configuration and an interactive terminal; the session signing secret is only needed to run the web panel. No password environment variable is supported.

In production, use HTTPS. The dedicated cookie is `zeno_platform_admin`, with Path `/superadmin`, HttpOnly, SameSite=Strict, Secure in production, and four-hour expiry. When TLS terminates at a proxy, configure its trusted range so Secure cookies can be issued. Forwarded IP/protocol headers are ignored from untrusted peers. This configuration applies to the new sub-application, not ERP middleware.

## Minimal initial role policy

One role: `platform_administrator`. One permission: `overview.read`. Role assignments, role-active flags and permission definitions are separate from ERP users/roles. There is no role-management interface or implicit wildcard permission. The role enables only the implemented overview and language preferences; business modules remain absent.

Protected requests fetch current account status and role-derived permissions from the database. Session `platformAdmin` stores only account ID and authentication version. Session display names/permissions are not trusted. Disabling an account or changing its authentication version destroys its session on the next protected request. Permission removal denies protected features immediately; logout remains available to active administrators even without overview permission.

Audited operator changes:

```powershell
node admin/cli.js set-active <username> disabled
node admin/cli.js set-active <username> enabled
node admin/cli.js set-access <username> revoked
node admin/cli.js set-access <username> granted
```

Replace `<username>` with the account name; it is not a password. These commands change only dedicated platform accounts/assignments, increment `auth_version`, and write audit records inside the same transaction. Re-enabling/restoring access does not revive old sessions. Commands require an interactive terminal and the operator's database access. They can disable the last administrator; restoration is through the same operator command, never a web bypass.

Do not manipulate assignments through ad hoc SQL for normal operations. Direct database changes are reflected on requests and observed permission changes are audited, but changes between requests cannot be reconstructed reliably. Operator commands provide the authoritative change audit. There is no password reset interface in this step.

## Authentication, CSRF and failures

GET/POST `/superadmin/login` are server-rendered in English, Dari and Pashto. Login POST, POST `/superadmin/logout`, and authenticated preference changes require the existing session-bound CSRF token. Successful login regenerates the session ID and CSRF token, writes only the dedicated identity, saves the session and persists its success audit before redirecting. A failed save/audit never returns successful login. POST logout destroys the session and clears the cookie with matching path/security options; GET logout cannot change state.

Login failures use the same generic text for invalid, absent, inactive and permissionless accounts. Persistent database throttling allows 10 attempts per normalized username and 30 per client IP per fixed 15-minute window, including successful attempts. Invalid form bodies use one invalid-account bucket. Keys are HMAC digests; raw usernames/IPs are not stored in the throttle table. Counts survive restarts and are shared across instances. A throttled response is 429 with a conservative Retry-After of 900 seconds.

Audit records cover successful/failed login, CSRF rejection, logout, provisioning, and access changes. Records contain event/outcome, numeric actor/target IDs where known, operator/HTTP origin, a pseudonymous subject digest and fixed detail codes. No request bodies, passwords, hashes, cookie values, signing secrets or session IDs are recorded. Operator events identify the operator channel rather than a named human; control and log host/database operator access separately.

If the audit database is unavailable, persistence is impossible: the request fails closed and the application logs only a safe failure code. A failed logout clears the browser cookie and shows 503; it does not claim that unreachable server-side session storage was successfully updated. Audit and throttle retention/cleanup require an operator policy; this step does not auto-delete audit history.

## Runtime compatibility

`backend/package.json` declares Node `>=22.23.3`, matching express-handlebars 9.0.2's requirement. Local implementation/tests ran on Node 24.18.0 and the configured MariaDB 10.4.32 server. No deployment runtime specification was found. Compatibility with the intended production runtime remains **unverified**; check its actual Node version before deployment.

## Verification commands

```powershell
node --test tests/admin-foundation.test.js tests/admin-authentication.test.js
$env:ADMIN_TEST_MYSQL='1'
node --test tests/admin-auth-mysql.test.js
Remove-Item Env:ADMIN_TEST_MYSQL
node --test
```

The optional MySQL integration test creates a randomly named `zeno_admin_test_*` schema on the configured database host, verifies migration/provisioning/session/login/revocation/logout/throttling, then removes only that generated schema. It needs CREATE/DROP DATABASE privileges. It does not migrate the ERP schema or create an ERP/production administrator. Run it on a test database host. Default test runs skip this opt-in test.

Native-language review, browser visual/keyboard testing, production TLS/proxy testing, deployment runtime verification, and production operator provisioning remain outstanding. Business modules and legacy support/impersonation/command protocols remain out of scope.

### Verification results — 12 October 2026

- 25 focused foundation/authentication tests passed.
- One opt-in real MariaDB integration workflow passed, including matching FK types, provisioning rollback, durable session storage and concurrent rate limiting. Its generated database was removed; no test database remains.
- Full backend suite: 467 tests, 465 passed, one skipped opt-in integration test and one pre-existing fiscal-year route-regex failure. The mismatch also exists in Git HEAD; that API route file was not modified.
- Fresh-backend smoke checks passed for the legacy login page, legacy protected-dashboard redirect, ERP root/MDB assets, database health, and protected API 401 responses. New panel/login returned 503 with the existing missing administrator secret, as intended.
- The ERP database still contains zero platform_admin tables. The migration was dry-run and verified in isolated test storage, not applied to the ERP database. No production administrator or password was created, and no .env values were changed.
