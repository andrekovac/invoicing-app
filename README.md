# Rechnungen

Invoicing for small companies: customers, invoices, PDF, payments, reminders. Started in 2020
as the internal tool of Agentur Brandt, since 2021 used by several companies (accounts).

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

## New web app (Angular)

```
cd web
npm install
npm start
```

Runs on http://localhost:4200 and sends `/api` to the api (see `web/proxy.conf.json`). The web
app is not part of the root `npm install` yet, it has its own `node_modules`.

Second demo account (imported from the old desktop program): `anna@druckerei-albers.example` /
`rechnungen`.

## What is where

```
api/
  server.js          express app, all routes under /api/v1
  db.js              sqlite connection, runs api/migrations/*.sql on start
  routes/            http routes (invoices, customers, payments, portal, auth, admin)
  services/          db access + logic (invoices, customers, payments, payment-links, reminders)
  lib/               money, pricing (tax), pdf, session, auth, cardpay, mailer, csv
  jobs/              overdue.js (reminders, runs every hour)
  migrations/        sql files, applied in order, never change an old one
  seed/              demo data, legacy/ = csv export of the old desktop program
  scripts/           reset-db.js, import-legacy.js, send-outbox.js
  public/            static files for the pdf (logo), not used yet
  legacy/admin-old   the first admin page (plain js), served at /admin-old
  test/              node:test tests, in-memory db
web/                 new admin app, Angular 11 (NgModules)
  src/app/           components + services (HttpClient)
  src/session.js     who is logged in (same key as the old admin)
  src/cart.js        cart of the customer portal
  src/api/client.js  small fetch wrapper (copied from admin-old)
deploy/              systemd unit + nginx config of the server
```

## Accounts (tenants)

Every customer, invoice and payment belongs to an account (`account_id`). Users log in and only
see their own account. A new company signs up with `POST /api/v1/auth/signup`. The first user is
admin of the account.

## Money and tax

Amounts are euros as numbers, rounded to 2 decimals for the totals. Every invoice stores
`total_net`, `total_tax` and `total_gross`. The list and the detail page show these stored
totals, the PDF computes its totals from the items again.

Tax rate per invoice: `tax_rate` in percent (19, 7, 0). The old column `legacy_tax_rate`
(decimal, 0.19) is still written on create, old invoices are printed with it. The api still
accepts `vat_rate` (decimal) from the old admin page. `lib/pricing.js` works with percent:
`gross(net, 19)`.

Customers can have a `default_tax_rate` (empty = 19 %), the web form preselects it.

Issued invoices keep their totals: texts, dates and the note can still be corrected, the amounts
stay as sent to the customer. Only drafts can change items, prices and tax rate.

## Import from the old desktop program

Some accounts came from an old desktop invoicing program. It exports `kunden.csv`,
`rechnungen.csv` and `positionen.csv` (semicolon, German numbers, unit prices with 4 decimals).

```
cd api
npm run import -- ../export-folder --new "Firma GmbH"
npm run import -- ../export-folder --account 2 --dry
```

Unit prices are kept with 4 decimals, the totals are computed like the old program did, so the
imported invoices show the same amounts as before. Customer numbers and invoice numbers are kept
(`2021-0087` becomes `RE-2021-0087`). The importer can run twice, it skips what is there.

## Payments

- Bank transfer: entered by hand (`POST /payments`), partial payments are fine. When the payments
  reach the total the invoice is paid.
- Card: CardPay. In development the sandbox in `lib/cardpay.js` answers like the CardPay test
  environment, no key needed. Test cards: `4242 4242 4242 4242` (ok), `4000 0000 0000 0002`
  (declined), `4000 0000 0000 9995` (insufficient funds). Any future expiry, any CVC.
- Payment link: `POST /payments/link` gives a signed link `/pay/<token>`, valid 30 days.
  Nothing is stored, the expiry is in the token. The invoice mail contains it.
- Customer portal: `/portal/<token>` shows all open invoices of one customer, the customer picks
  several and pays them with one card payment (cart).

## Mails and reminders

Mails are written into the `outbox` table (templates in `lib/mailer.js`), nothing is sent from
the api. `npm run outbox` in `api/` shows the waiting mails.

`jobs/overdue.js` runs every hour (started by `server.js`, `OVERDUE_JOB=off` turns it off) and
writes one payment reminder for every overdue invoice of a customer with an email. More
reminders can be sent by hand from the web app (Überfällig).

## API

All routes under `/api/v1`, JSON. Login sets a signed cookie (`rsid`).

| Method | Path | |
|---|---|---|
| POST | /auth/login | `{email, password}` |
| POST | /auth/signup | `{company, name, email, password}`, new account |
| POST | /auth/logout | |
| GET | /auth/me | user + account name |
| POST | /auth/password | `{old_password, new_password}` |
| GET | /customers?q= | with `open_amount` |
| GET/POST/PUT/DELETE | /customers/:id | `country` free text, `default_tax_rate` |
| GET | /customers/:id/invoices | |
| POST | /customers/:id/portal-mail | mail with the portal link |
| GET | /invoices?status=&q=&customer_id= | with `paid_amount` |
| GET | /invoices/summary | open / overdue / paid |
| GET | /invoices/overdue | overdue + last reminder |
| POST | /invoices/preview | totals for the form |
| GET | /invoices/:id | with items + customer |
| GET | /invoices/by-number/:number | e.g. RE-2021-0087 |
| GET | /invoices/:id/pdf | `?format=txt` for plain text |
| POST/PUT/DELETE | /invoices/:id | issued: only texts and dates |
| POST | /invoices/:id/issue | gives the number RE-YYYY-NNNN |
| POST | /invoices/:id/paid | `{paid_at}`, books the rest as transfer |
| POST | /invoices/:id/cancel | |
| PUT | /invoices/:id/note | internal note |
| POST | /invoices/:id/copy | copy as new draft |
| GET | /invoices/:id/mail | mail text for the customer |
| POST | /invoices/:id/mail | invoice mail into the outbox (with payment link) |
| POST | /invoices/:id/remind | reminder by hand |
| POST/PUT/DELETE | /invoices/:id/items/:itemId | single items (drafts only) |
| GET | /payments?invoice_id= | payments of one invoice, without: all |
| POST | /payments | bank transfer `{invoice_id, amount, paid_at}` |
| POST | /payments/card | card payment in the office |
| POST | /payments/link | payment link `{invoice_id, days}` |
| GET | /payments/link/:token | no login |
| POST | /payments/link/:token/card | no login |
| POST | /portal | portal link for a customer |
| GET | /portal/:token | no login, open invoices |
| POST | /portal/:token/cart | totals of the picked invoices |
| POST | /portal/:token/pay | pay the picked invoices |
| GET/PUT | /admin/account | company data (admin) |
| GET/POST/PUT/DELETE | /admin/users | users (admin) |
| GET | /admin/outbox | mails (admin) |

## Database

SQLite (`node:sqlite`, no extra package). Fine for the current accounts. Postgres is planned for
2023 when more companies come; keep the SQL plain (no SQLite-only functions in new code).

## Production

On the server: `npm start` in `api/` behind nginx (see `deploy/`), `PORT=3000`. The web app is
built with `npm run build` in `web/` and served by nginx from `web/dist/`.

## Config

| Env | Default | |
|---|---|---|
| PORT | 4730 | 3000 on the server |
| APP_DB_FILE | api/data/app.db | `:memory:` in tests |
| SESSION_SECRET | dev value | set this in production |
| LINK_SECRET | dev value | payment and portal links, set this in production |
| APP_URL | http://localhost:4200 | base of the links in mails |
| CARDPAY_MODE | sandbox | |
| OVERDUE_JOB | on | `off` = no reminders job |
| OVERDUE_INTERVAL_MIN | 60 | |
| REMINDER_FEE_NET | 0 | reminder fee (net) |
