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
