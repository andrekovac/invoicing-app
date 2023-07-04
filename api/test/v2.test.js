// api v2 (typescript, read only)
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

let srv;
let api;
let anon;

test.before(async function () {
  srv = await helpers.startServer();
  api = helpers.client(srv.base);
  anon = helpers.client(srv.base);
  await api.login('albers');
});

test.after(function () {
  srv.stop();
});

test('needs a login', async function () {
  const res = await anon.get('/api/v2/invoices');
  assert.strictEqual(res.status, 401);
});

test('invoice list is a page', async function () {
  const res = await api.get('/api/v2/invoices?perPage=5');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.length, 5);
  assert.strictEqual(res.body.page, 1);
  assert.strictEqual(res.body.perPage, 5);
  assert.ok(res.body.total > 5);
  const first = res.body.data[0];
  assert.ok('customerName' in first);
  assert.ok('totals' in first);
  assert.ok(!('note' in first));
});

test('same number of invoices as v1', async function () {
  const v1 = await api.get('/api/v1/invoices');
  const v2 = await api.get('/api/v2/invoices?perPage=100');
  assert.strictEqual(v2.body.total, v1.body.length);
});

test('filter by status', async function () {
  const res = await api.get('/api/v2/invoices?status=paid&perPage=100');
  assert.ok(res.body.data.length > 0);
  res.body.data.forEach(function (i) { assert.strictEqual(i.status, 'paid'); });
});

test('invoice detail with items', async function () {
  const v1 = await api.get('/api/v1/invoices/by-number/RE-2022-0002');
  const res = await api.get('/api/v2/invoices/' + v1.body.id);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.number, 'RE-2022-0002');
  assert.strictEqual(res.body.items.length, v1.body.items.length);
  assert.strictEqual(res.body.totals.gross, v1.body.total_gross);
  assert.strictEqual(res.body.items[0].lineTotal, money.round2(v1.body.items[0].quantity * v1.body.items[0].unit_price));
});

test('draft totals are computed from the items', async function () {
  const res = await api.get('/api/v2/invoices?status=draft');
  const draft = await api.get('/api/v2/invoices/' + res.body.data[0].id);
  const net = draft.body.items.reduce(function (s, it) { return s + it.lineTotal; }, 0);
  assert.strictEqual(draft.body.totals.gross, money.round2(pricing.gross(net, draft.body.taxRate)));
});

test('invoice of another account', async function () {
  const other = helpers.client(srv.base);
  await other.login('brandt');
  const mine = await other.get('/api/v2/invoices?perPage=1');
  const res = await api.get('/api/v2/invoices/' + mine.body.data[0].id);
  assert.strictEqual(res.status, 404);
});

test('errors come as a list', async function () {
  const res = await api.get('/api/v2/invoices?status=offen&page=0&perPage=1000');
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(res.body.errors.map(function (e) { return e.field; }), ['status', 'page', 'perPage']);
  const bad = await api.get('/api/v2/invoices/abc');
  assert.strictEqual(bad.status, 400);
});

test('customers', async function () {
  const res = await api.get('/api/v2/customers?q=Krause');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 1);
  const c = res.body.data[0];
  assert.strictEqual(c.name, 'Krause GmbH');
  assert.strictEqual(c.imported, true);
  assert.strictEqual(c.address.city, 'Schweinfurt');
});

test('customer detail and invoices', async function () {
  const list = await api.get('/api/v2/customers?q=Krause');
  const id = list.body.data[0].id;
  const one = await api.get('/api/v2/customers/' + id);
  assert.strictEqual(one.body.id, id);
  const invs = await api.get('/api/v2/customers/' + id + '/invoices?perPage=100');
  assert.ok(invs.body.total >= 6);
  invs.body.data.forEach(function (i) { assert.strictEqual(i.customerId, id); });
});

test('unknown v2 route', async function () {
  const res = await api.get('/api/v2/payments');
  assert.strictEqual(res.status, 404);
  assert.ok(Array.isArray(res.body.errors));
});
