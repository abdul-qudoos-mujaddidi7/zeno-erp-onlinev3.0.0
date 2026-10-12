# Smart Super Admin

An Express sub-application mounted at `/smart-super-admin`. It uses JavaScript,
express-handlebars 9.0.2, and the existing mysql2 pool in `backend/db.js`.
The legacy `/api/superadmin`, ERP frontend, authentication, and client command
integration endpoints are retained.

## Run

From PowerShell in `backend`:

```powershell
npm.cmd ci
npm.cmd start
```

Open `http://localhost:3001/smart-super-admin` when using the existing port 3001;
use the configured `PORT` otherwise. There is no new login, authentication,
permission middleware, administrator provisioning, or database migration.
All routes, including writes and command submission, accept anonymous requests.
The host application's session stores only organization selection and language
for this module; a host user name is displayed when available. There is no
impersonation feature and selection does not change the ERP user identity.

Use the existing database configuration (`DB_HOST`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME`) and the existing host session configuration. No new runtime environment
variables are required. The pinned Handlebars dependency requires Node.js
22.23.3 or newer. Development verification used Node.js 24.18.0; the intended
deployment runtime has not been supplied and its compatibility remains unverified.

## Features and organization

- Dashboard, searchable organization selector, all-organizations context, card
  grid, and paginated organization list with business-record counts and latest
  subscription information.
- Allowlisted generic business-table list/detail pages, search, sorting,
  pagination, image previews, changed-field comparisons, related line items,
  payments, and organization-scoped user-name lookups. Credential columns and
  credential keys in structured JSON are omitted.
- Error-log browsing and clearing; sync-log clearing.
- Command browsing, Monaco editor, queuing, and status/result polling. Text,
  JSON, images, and sandboxed HTML/iframe previews are supported.
- Organization type and feature create/edit forms with existing inactive status
  fields; subscription plans and subscriptions with dynamic feature assignments,
  plan-feature JSON lookup, multilingual business fields, and preserved usage.
- Invoice list/create/edit/print and payment recording. Multi-query saves use
  transactions; payments lock their invoice and use SQL DECIMAL calculations.
  Invoice form dates use Kabul time and are stored as UTC.
- Local MDB 7.2.0 LTR/RTL styles with original license headers, existing Bootstrap
  Icons and Vazirmatn assets, primary `#1e6ca5`, background `#f5f6f9`, responsive
  sidebar, and English/Dari/Pashto shared navigation and actions.

`routes.js` defines the complete requested route map. Controllers build view
models, services query existing tables, and `services/database.js` validates
identifiers, sort fields, filters, page limits, and values. Templates are in
`backend/views/smart-super-admin`; browser code and styles are in
`backend/public/smart-super-admin`, served at `/smart-super-admin/assets`.
Templates use escaped Handlebars output. JavaScript is external to templates.

List and index styling follows the existing ERP Svelte `IndexPageLayout`,
`DataTable`, `FilterToolbar`, and `PaginationBar`: shared compact panels,
action/search toolbars, dense striped tables, sticky sortable headers, status
badges, footer page sizing, and labeled record cards on phones. These patterns
are implemented in Handlebars and CSS; the ERP Svelte pages are unchanged.
The application shell also follows the active ERP `DashboardLayout`, `Sidebar`,
and `Topbar`: narrow logo sidebar, pale active links, bottom profile/language
menu, saved desktop icon collapse, section navigation, organization context,
fullscreen, and a mobile drawer with backdrop, Escape dismissal and focus trap.
Sidebar collapse is stored under `smartSuperAdmin.sidebarCollapsed`, separately
from ERP preferences. Shell styles are in `public/smart-super-admin/css/shell.css`.

## Verification

```powershell
node --test tests/smart-super-admin.test.js
$env:SMART_SUPER_ADMIN_TEST_MYSQL = '1'
node --test tests/smart-super-admin-mysql.test.js
Remove-Item Env:SMART_SUPER_ADMIN_TEST_MYSQL
npm.cmd test
```

The MySQL test requires CREATE/DROP DATABASE privileges. It creates a randomly
named `zeno_smart_test_*` database, copies schema only from the configured ERP
database, tests writes against fixtures, and drops that test database afterwards.
It does not modify ERP business records.

Focused checks cover rendering, dates, decimals, identifier validation,
pagination bounds, excluded credentials, safe feature-row DOM editing, anonymous
workflow access, organization selection, CRUD, assignment usage preservation,
invoice/payment balances, transaction rollback, command results, and database
failure pages. Live smoke checks cover new pages and existing legacy login,
legacy authentication redirect, ERP frontend, server-time API, and v2 anonymous
authentication rejection. The unchanged full backend suite currently has one
failure in `tests/fiscal-year.test.js`: a source-formatting assertion expects a
single-quoted fiscal-year route registration in the existing v2 index.

## Remaining verification and behavior limits

- Monaco is loaded from jsDelivr; a normal textarea remains usable if unavailable.
  Full interactive browser/printing checks and real ERP client command execution
  have not been performed. Database queue/result integration is tested.
- Existing `/logs` delivery and `/command-executed` replies are unchanged.
  Delivery currently supports the legacy `tab_ses_id` selector. Other selector
  values can be stored but require client/server delivery support outside this
  module. The old secret-token selector and impersonation are not recreated.
- HTML results render in sandboxed frames rather than injecting markup into the
  panel document. Polling pauses after approximately one minute; reopening a
  pending command resumes polling.
- Shared navigation/actions and direction support three languages. Some schema
  column labels, form labels, and browser status messages remain English and need
  a complete translation review. Reference pickers are bounded to 1,000 rows;
  related detail rows are bounded to 1,000. Organization search remains available.
- Counts use the legacy nonzero-status rule. Existing sample data and schema were
  inspected, but business owners have not independently reconciled those counts.
