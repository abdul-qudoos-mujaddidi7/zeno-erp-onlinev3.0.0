# Step 3 — Read-only organization management

## Setup and initial role policy

No schema migration or dependency installation is required for this step. The existing platform authentication migration must already be applied. From `backend`:

```powershell
node admin/cli.js grant-organization-permissions
npm.cmd start
```

Restart a running backend with Ctrl+C before starting it again. Open `/superadmin/organizations` after signing in. The permission command is rerunnable, accepts no secrets and can run without an interactive terminal. It updates only `platform_administrator` role permissions and writes an `access.policy_changed` audit record in the same transaction. Audit failures roll back the grants. It does not re-enable inactive roles or restore revoked account assignments. Running it again intentionally restores the two organization permissions on this role.

The role now grants `overview.read`, `organizations.read`, and `organizations.select`. First-time role creation includes all three; existing roles require the explicit audited upgrade. Permissions reload from the database on every protected request, so existing valid sessions receive grants without a separate login. Account disablement and access revocation still take effect immediately. No ERP permissions or authentication protocols change.

## Routes

| Method | Path | Permissions |
| --- | --- | --- |
| GET | `/superadmin/organizations` | `organizations.read` |
| GET | `/superadmin/organizations/:id` | `organizations.read` |
| POST | `/superadmin/organizations/select` | `organizations.read` and `organizations.select`, plus CSRF |

Organization routes do not implicitly require overview permission. Login/session validation remains mandatory. GET requests cannot change selection. Selection affects only the dedicated admin session, never ERP state or authorization.

## Directory and context semantics

- Directory covers **all organizations**, regardless of selected context; this is explicitly labeled on the page.
- Session context defaults to **All organizations**. Selection uses a validated positive INT organization ID, or the literal `all` to clear it. Numeric zero is not a valid organization selection.
- Each protected request revalidates the selected organization. Missing organizations clear the context and show a notice; database failures return 503 rather than trusting stale names.
- Platform read permission is global organization-directory access. Selected context is a navigation preference, not a tenant-access boundary. There are no per-organization role assignments in this initial policy.
- POST selection writes only the admin session and a security audit entry. Business records remain read-only. No organization creation/editing/deletion, subscriptions, billing, support commands, or ERP impersonation is implemented.

## Query validation

Search `q` is trimmed and limited to 120 characters; it matches organization name or code. `%`, `_`, and `!` are escaped for literal SQL LIKE matching. Values use prepared mysql2 parameters.

Filters: exact `type` (bounded to 255 characters, `__none__` selects NULL), `status` (`all`, `1`, `0`), and inventory method (`all`, `CLASSIC`, `FIFO`, `LIFO`). Known type options are loaded from existing organizations, capped at 200; an explicitly selected other type remains visible. Stored type names and inventory codes are shown as database values, not translated taxonomy definitions.

Sorting allows only `id`, `name`, `type`, `status`, and `created_at`, with `asc`/`desc`. A secondary ID sort makes pages deterministic for duplicate values. Page sizes are 10, 25, 50, or 100 (default 25). Page numbers must be positive decimal integers up to six digits; excessive page numbers clamp to the last actual page before applying SQL OFFSET. Duplicate/unknown parameters, invalid IDs, unsupported sorts and oversized inputs return 400. Nonexistent detail/selection IDs return 404. Organization IDs are limited to signed INT's positive range, matching the actual schema.

## Verified record-count definition

Verified organization columns: `id`, `name`, `code`, `type`, `inventory_method`, `status`, `created_at`, `updated_at`.

Detail counts use `org_id = selected detail ID AND status <> 0` for products, sales, purchases, journals, accounts, ERP users, warehouses, and activity logs. Their `org_id` and `status` columns were verified against the configured database before implementation. Counts include draft/other nonzero statuses, exclude zero and NULL statuses, and are **record totals, not financial totals or confirmed sales totals**. This matches the old panel's basic count convention; the definition is displayed in English, Dari and Pashto.

The aggregate query uses only a fixed table allowlist, one prepared ID parameter per table, and one UNION ALL statement. It returns counts only. Passwords, hashes, authentication tokens, session records, usernames and individual business records are not selected or exposed.

## Verification

```powershell
node --test tests/admin-organizations.test.js tests/admin-foundation.test.js tests/admin-authentication.test.js
$env:ADMIN_TEST_MYSQL='1'
node --test tests/admin-auth-mysql.test.js
Remove-Item Env:ADMIN_TEST_MYSQL
```

The optional database test uses a generated temporary schema, never copies ERP business data, and removes that schema afterward. It now verifies literal wildcard searches, combined filters, server pagination, zero/NULL/other-status counts, context POSTs, and rerunnable/audited role upgrades, in addition to authentication. Run on a test database host with CREATE/DROP DATABASE privileges.

## Remaining gaps

Native-language review and browser visual/keyboard testing remain pending. Directory count and page queries are separate reads and may reflect concurrent changes between them. Large-data query performance/load testing and optional additional indexes require deployment-sized evaluation. Stored organization type/inventory codes remain untranslated metadata. Selected context will need to be applied explicitly by future business modules; this step does not implement those modules. Production runtime/TLS/proxy compatibility remains deployment-specific.
