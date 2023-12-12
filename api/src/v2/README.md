# api v2

TypeScript, read only for now. Mounted at `/api/v2` from `server.js` (dynamic
`import()`, the rest of the api is CommonJS).

No build step: Node strips the types when it loads the `.ts` files. That only works
with syntax that can be erased, so:

- no `enum` (use a union type and a `const` array, see `STATUSES` in `types.ts`)
- no `namespace`, no parameter properties in constructors
- type only imports with `import type`, imports with the `.ts` ending
- `package.json` here says `"type": "module"`, the files are ES modules

`tsconfig.json` is only for the editor, nothing compiles.

## Files

| File | What |
|---|---|
| `app.ts` | express router, query checks, errors as `{ errors: [{ field, message }] }` |
| `repo.ts` | db access, sync functions (`customers()`, `customer()`, `invoices()`, `invoice()`, `items()`) |
| `invoices.ts` | db row -> api shape (camelCase), totals |
| `types.ts` | api and row types |

## Differences to v1

- camelCase fields, totals as `{ net, tax, gross }`, no internal `note`
- lists are pages: `{ data, page, perPage, total }`, `perPage` max 100
- `q` needs at least 2 characters, ids must be positive integers
- unknown query values are errors, v1 often ignores them

## Next

- write endpoints (create draft, update, issue) with the same rules as v1
- move the web app to v2 page by page
- `repo.ts` is the only place with SQL, for the move to postgres
