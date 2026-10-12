# Separate ZenoERP platform administration panel

## Architecture and compatibility

Build a new application at `/superadmin`; use the old `/api/superadmin` panel as a workflow reference. Both remain operational independently. Keep Node.js, Express, CommonJS JavaScript, express-handlebars, MySQL and the existing mysql2/promise pool. Keep server-rendered pages and progressively enhance them with browser JavaScript. No Svelte, React, TypeScript, or Prisma in this application.

Separate routes, controllers, services, repositories, middleware, validators, and templates. New files live in `backend/admin`, `backend/views/admin`, and `backend/public/admin`. Never put database access or authentication decisions in templates. Repositories select explicit columns, parameterize values and allowlist identifiers; controllers construct minimal view models. Use escaped template values and safe DOM APIs. Triple braces are reserved for the engine-rendered layout body.

Mount the admin sub-application before ERP session middleware and body parsers. It has its own view engine and error responses. Keep legacy ERP routes, frontend assets, bearer authentication, and API response contracts unchanged. Reuse MDB Free 9.3.0, icons and Vazirmatn. Admin CSS uses primary #1e6ca5, background #f5f6f9 and logical properties for RTL. Provide English, Dari and Pashto dictionaries, direction-aware MDB styles, and accessible browser interactions.

## Step 1: foundation (implemented)

- Isolated `/superadmin` Express app and server-side Handlebars engine.
- Shared main/auth layouts, sidebar, topbar, restricted-access page and protected overview.
- Separate `zeno_platform_admin` cookie, `/superadmin` path, separate signing secret, and `platform-admin:` session IDs.
- Dedicated session identity `platformAdmin`; never authorize `session.user`, ERP usernames, bearer tokens or the `erp_session` cookie.
- Reuse the existing `sessions` table through the existing mysql2 pool. Disable runtime table creation; no schema changes in this step.
- Centralized explicit permission checks, synchronizer CSRF tokens, Zod validation, scoped security headers, escaped HTML, and external browser scripts.
- Language selection on the restricted page is a validated GET query; authenticated preference changes require POST and CSRF protection.
- Step 1 shipped without a login endpoint or provisioning. Step 2 below now provides dedicated authentication; no seeded account, development shortcut or impersonation bridge exists.

`/superadmin` returns a rendered 401 access-required page for anonymous users, or 503 when configuration is missing/invalid. `/superadmin/login` provides dedicated sign-in after configuration and schema setup. Public CSS/JS contains no sensitive data. Missing database/session-store availability must never grant access.

## Configuration

Set `ADMIN_SESSION_SECRET` to an independently generated high-entropy secret, at least 32 characters, different from `SESSION_SECRET`. Generate with a secure secrets tool; never commit it. This step does not edit `.env`. Missing configuration keeps the new panel locked without preventing the legacy application from starting.

Cookies use HttpOnly, SameSite=Strict and a four-hour lifetime. Secure is enabled in production. Configure and test narrowly scoped trusted proxy behavior before enabling production login behind TLS termination; do not change ERP proxy/session behavior as a shortcut.

The installed express-handlebars 9.0.2 requires Node >=22.23.3; verified locally on Node 24.18.0. Confirm the deployment runtime before rollout. Handlebars has been added only to backend dependencies.

## Step 2: dedicated administrator authentication (implemented)

Seven additive authentication tables use matching INT UNSIGNED account/role/permission IDs. Operator CLI provisions salted bcrypt cost-12 passwords through hidden terminal input. The minimal role grants only overview.read. Server-rendered login/logout uses CSRF, persistent account/IP throttling, session regeneration and explicit saves. Protected requests reload active status and current permissions; audited operator changes invalidate old sessions. No ERP user hashes or login protocols change. See README.md for migration/provisioning commands, environment names, access policy and failure handling. Migration execution and first-account provisioning remain operator setup actions; tests use isolated storage.

## Step 3: read-only platform modules

Reimplement organization lists/selection and summaries, approved record inspection, sync/error/activity logs, and pagination/filtering. Use explicit tenant access and permissions per module. Allowlist all tables and sort columns; bound page sizes. Correct legacy duplicate-WHERE filters, missing feature columns, unbounded organization results and missing async propagation. Exclude password hashes, tokens and session data from lists. Add indexes only after query-plan checks and data audits.

## Step 4: configuration and subscriptions

Implement organization types, multilingual feature definitions, plan pricing/cycles/trials/grace periods, plan feature assignments, subscription lifecycle and feature overrides. Validate statuses, relationships, IDs and quantities. Replace multi-statement saves with transactions. Use authoritative existing tables. Do not imply that auto-renew fields implement scheduled renewal jobs.

## Step 5: billing

Implement invoice list/create/edit/view/print and payment recording. Maintain decimal precision and explicit Asia/Kabul input/UTC storage handling. Validate invoice ownership and currency, reject invalid/negative payments, and serialize payment/invoice total updates inside transactions. Add idempotency, audit and reconciliation checks. Audit duplicates/orphans before adding constraints or relationship indexes; existing related IDs have mixed INT/BIGINT widths.

## Step 6: support operations and integration dependencies

Old `DashLayout.js` logs in as ERP users through `/api/auth/login`, writes tokens/preferences into localStorage, may clear ERPDatabase IndexedDB, and opens `/#/dashboard`. Do not reuse its browser secret or change the protocol silently. A secure replacement requires a separately documented server/client impersonation contract, explicit permission, audit trail, revocation and coordinated ERP testing.

Old commands use `/execute-command/`, `/api/superadmin/command-wait/:id`, `/logs`, and `/command-executed`; backups use `/backupme2020` and `/backup/upload`. These routes remain unchanged in this step. Reimplement support screens only after secure caller identity, ownership, limits, audit and delivery protocols are specified. Do not wire the new interface to unsafe legacy endpoints. Monaco's external CDN and CSP requirements must be reviewed separately.

## Release and verification

Keep the old panel operational; this is a new product surface, not an old-renderer replacement. Release modules independently. Test anonymous/ERP/platform sessions, authorization, cross-tenant access, CSRF, escaping, malformed input, database failures, multilingual RTL/LTR and keyboard/mobile navigation. Test transactions and money/date edge cases before financial writes. Smoke-test the legacy panel, ERP root/assets, health and protected APIs after each server integration change.

Rollback removes only the `/superadmin` mount/new application deployment. Additive schema changes must remain compatible with the old panel. No legacy authentication or integration cleanup is included without separate scope and dependency documentation.

## Remaining verification

Production runtime/proxy/TLS settings, deployment secrets, production migration/provisioning, translation review by native speakers, browser visual testing, and legacy command/backup/client execution remain to be verified. Authentication has been verified with fixtures and a temporary MariaDB schema; business modules remain unimplemented.
