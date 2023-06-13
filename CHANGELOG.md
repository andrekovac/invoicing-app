# Changelog

Notable changes from 2023 on. Commit messages follow Conventional Commits
(`feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `ci:`, `chore:`), the list below is
written by hand from them once in a while.

## Unreleased

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
