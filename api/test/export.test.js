// exports for the tax advisor: /api/v1/export/...
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const pricing = require('../lib/pricing');
const money = require('../lib/money');
const csv = require('../lib/csv');

let srv;
let brandt;
let albers;

test.before(async function () {
  srv = await helpers.startServer();
  brandt = helpers.client(srv.base);
  albers = helpers.client(srv.base);
  await brandt.login('brandt');
  await albers.login('albers');
});

test.after(function () {
  srv.stop();
});

function rows(text) {
  return csv.toObjects(csv.parse(text));
}

test('invoices csv for one year', async function () {
  const res = await brandt.get('/api/v1/export/invoices.csv?from=2020-01-01&to=2020-12-31');
  assert.strictEqual(res.status, 200);
  assert.ok(/text\/csv/.test(res.headers.get('content-type')));
  assert.ok(/rechnungen_2020-01-01_2020-12-31\.csv/.test(res.headers.get('content-disposition')));
  const list = rows(res.body);
  assert.strictEqual(list.length, 10);
  assert.strictEqual(list[0].Rechnungsnummer, 'RE-2020-0001');
  assert.strictEqual(list[0].Kunde, 'Bäckerei Lindner');
  assert.strictEqual(list[0].Status, 'bezahlt');
});

test('positions with gross per line', async function () {
  const res = await brandt.get('/api/v1/export/items.csv?from=2020-01-01&to=2020-01-31');
  const list = rows(res.body);
  const first = list[0];
  assert.strictEqual(first.Text, 'Website Relaunch, Konzept');
  assert.strictEqual(first.Brutto, money.round2(pricing.gross(1450, 19)).toFixed(2).replace('.', ','));
});

test('customer list with debtor numbers', async function () {
  const res = await albers.get('/api/v1/export/customers.csv');
  const list = rows(res.body);
  const krause = list.find(function (c) { return c.Name === 'Krause GmbH'; });
  assert.ok(krause);
  assert.ok(Number(krause.Debitor) > 10000);
});

test('booking export: tax key and revenue account per invoice', async function () {
  const res = await brandt.get('/api/v1/export/datev.csv?from=2020-01-01&to=2020-12-31');
  assert.strictEqual(res.status, 200);
  assert.ok(/windows-1252/.test(res.headers.get('content-type')));
  const lines = csv.parse(res.body);
  assert.strictEqual(lines[0][0], 'Buchungsstapel');
  assert.strictEqual(lines[1][0], 'Umsatz');
  const first = lines[2];
  assert.strictEqual(first[1], 'S');
  assert.strictEqual(first[4], '8400');
  assert.strictEqual(first[5], '3');
  assert.strictEqual(first[7], 'RE-2020-0001');
});

test('booking summary per tax rate', async function () {
  const res = await albers.get('/api/v1/export/datev/summary?from=2021-01-01&to=2021-12-31');
  assert.strictEqual(res.status, 200);
  const keys = res.body.map(function (s) { return s.key; });
  assert.deepStrictEqual(keys, ['3', '2']);
});

test('wrong period', async function () {
  assert.strictEqual((await brandt.get('/api/v1/export/invoices.csv?from=2021-13-01')).status, 400);
  assert.strictEqual((await brandt.get('/api/v1/export/invoices.csv?from=2021-02-01&to=2021-01-01')).status, 400);
});

test('export needs a login', async function () {
  const anon = helpers.client(srv.base);
  assert.strictEqual((await anon.get('/api/v1/export/invoices.csv')).status, 401);
});
