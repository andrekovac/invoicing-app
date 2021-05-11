# Rechnungen

Invoicing for small companies: customers, invoices, PDF. Started as the internal tool of
Agentur Brandt in 2020.

## Quickstart

Needs Node.js 24 or newer (uses the built-in `node:sqlite`).

```
npm install
npm run dev:api
```

Open http://localhost:4730/admin-old/ and log in with `jonas@agentur-brandt.example` /
`rechnungen` (admin) or `buero@agentur-brandt.example` / `rechnungen`.

The first start creates `api/data/app.db` with demo data. Start over with `npm run db:reset`.

Tests: `npm test`

## What is where

```
api/
  server.js        express app, port 4730
  db.js            sqlite connection, runs api/migrations/*.sql on start
  routes/          http routes (/api/v1/...)
  services/        db access for invoices and customers
  lib/             money, pricing (tax), pdf, session, auth
  migrations/      sql files, applied in order, never change an old one
  seed/            demo data
  scripts/         reset-db.js
  legacy/admin-old the first admin page (plain js), served at /admin-old
  test/            node:test tests, in-memory db
```

## API

All routes under `/api/v1`, JSON. Login sets a signed cookie (`rsid`).

| Method | Path | |
|---|---|---|
| POST | /auth/login | `{email, password}` |
| POST | /auth/logout | |
| GET | /auth/me | |
| POST | /auth/password | `{old_password, new_password}` |
| GET | /customers?q= | |
| GET/POST/PUT/DELETE | /customers/:id | |
| GET | /customers/:id/invoices | |
| GET | /invoices?status=&q=&customer_id= | |
| GET | /invoices/summary | open / overdue / paid |
| POST | /invoices/preview | totals for the form |
| GET | /invoices/:id | with items + customer |
| GET | /invoices/by-number/:number | e.g. RE-2021-0001 |
| GET | /invoices/:id/pdf | `?format=txt` for plain text |
| POST/PUT/DELETE | /invoices/:id | only drafts can be changed |
| POST | /invoices/:id/issue | gives the number RE-YYYY-NNNN |
| POST | /invoices/:id/paid | `{paid_at}` |
| POST | /invoices/:id/cancel | |
| PUT | /invoices/:id/note | internal note |
| POST | /invoices/:id/copy | copy as new draft |
| GET | /invoices/:id/mail | mail text for the customer |
| POST/PUT/DELETE | /invoices/:id/items/:itemId | single items (drafts only) |
| GET | /invoices/years | years with invoices |
| GET/PUT | /admin/account | company data (admin) |
| GET/POST/PUT/DELETE | /admin/users | users (admin) |

## Money

Amounts are euros as numbers, rounded to 2 decimals when stored. Tax rate per invoice
(`vat_rate`, 0.19 / 0.07 / 0). `lib/pricing.js` works with percent: `gross(net, 19)`.
The PDF computes its totals from the items again.

## Config

| Env | Default | |
|---|---|---|
| PORT | 4730 | |
| APP_DB_FILE | api/data/app.db | `:memory:` in tests |
| SESSION_SECRET | dev value | set this in production |
