# Changelog

Notable changes from 2023 on. Commit messages follow Conventional Commits
(`feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `ci:`, `chore:`), the list below is
written by hand from them once in a while.

## Unreleased

## 2024

### Added

- web: Angular 20 (was 11). `web` is an npm workspace now, `npm run dev:web` (port 4200, proxy to the api) and `npm run build:web` from the root. Older pages stay in `AppModule`, new pages are standalone components with signals
- web: invoice view (`/invoices/:id`) with the stored totals, payments and history
- web: paging and sorting in the invoice list (`X-Total-Count`), select invoices for bulk actions, list as csv
- customer search: `GET /api/v1/customers/search?q=` and the page `/customers/search`
- feature flags per account (`feature_flags`, `lib/flags.js`, `/api/v1/admin/flags`, `FLAGS_ON=...` locally). `NEW_PDF_LAYOUT` is not finished, keep it off
- reports: revenue per month, open items by age, top customers, tax per rate (`/api/v1/reports/...`) and the page `/reports`
- recurring invoices (`recurring_invoices`, `services/recurring.js`, `jobs/recurring.js`, `/api/v1/invoices/recurring`), `{monat}` `{jahr}` `{zeitraum}` in item texts
- exports for the tax advisor: invoices, positions, customers and the old booking format (`/api/v1/export/...`, page `/export`)
- products with number, unit and price (`/api/v1/products`), import of the old price list, picker in the invoice form
- start page with the overview and the coming recurring invoices
- statement of account per customer (`GET /api/v1/customers/:id/statement`, json, pdf, txt)
- `POST /api/v1/invoices/bulk` action `mail`
- credit notes: `POST /api/v1/invoices/:id/credit-note` (whole invoice or single positions), button on the invoice view
- web: feature flags in the settings (admins)
- api v2: `GET /api/v2/products`, `GET /api/v2/reports/revenue?year=` (TypeScript, read only)
- CI builds the web app
- scripts: `npm run recurring -w api -- [until] [account] [--dry]`, `npm run export:month -w api -- <account> [YYYY-MM] [folder]`

### Fixed

- login lock uses the client ip behind the proxy (`trust proxy` loopback)
- v2 server errors go through the logger
- tax report per quarter ends on the last day of the quarter
- test servers listen on 127.0.0.1, sometimes a test reached another server with the same port on macOS

### Migrations

- `013_feature_flags.sql`, `014_recurring_invoices.sql` (also `invoices.recurring_id`), `015_products.sql`

## 2023

### Added

- `.editorconfig` (2 spaces, LF, the legacy CSV exports keep CRLF)
- CI on GitHub Actions: tests on Linux, macOS and Windows
- test helpers (`api/test/helpers.js`) for http tests with their own cookie per client
- `lib/logger.js`: `[scope] text key=value` lines, `LOG_LEVEL`, `LOG_FORMAT=json`
- `lib/invoice-number.js`: format, parse and normalize `RE-YYYY-NNNN`, lookup by number accepts loose input
- invoice history (`invoice_events`, `GET /api/v1/invoices/:id/events`)
- `lib/validate.js` for shared input checks (email, int ranges, whole bodies)
- paging for `GET /api/v1/invoices`: `page`, `per_page` (max 200), `sort`, `order`, `from`, `to`; headers `X-Total-Count`, `X-Page`, `X-Per-Page`
- api v2 in TypeScript (`api/src/v2`, read only): `GET /api/v2/invoices`, `GET /api/v2/invoices/:id`. Node runs the .ts files directly (type stripping), no build step
- api v2: `GET /api/v2/customers`, `/api/v2/customers/:id`, `/api/v2/customers/:id/invoices`; errors as `{ errors: [{ field, message }] }`
- seed: `api/seed/fixes-2023.js` (changes made by hand in 2023, e.g. the new address of Krause GmbH)
- `POST /api/v1/invoices/bulk`: issue, mark paid, cancel or remind several invoices at once
- login is locked for 15 minutes after 5 wrong passwords (`login_attempts`, `LOGIN_MAX_FAILED`, `LOGIN_LOCK_MINUTES`)
- duplicate customers: `GET /api/v1/customers/duplicates`, `POST /api/v1/customers/:id/merge` (admins)
- `api/openapi.yaml`: description of api v1
- invoice number check (gaps and doubles per year): `GET /api/v1/admin/number-check`, `npm run check:numbers -w api`
