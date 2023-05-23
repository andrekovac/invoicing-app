// GET /api/v1/invoices with page, per_page, sort and filters
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');

let srv;
let api;

test.before(async function () {
  srv = await helpers.startServer();
  api = helpers.client(srv.base);
  await api.login('albers');
});

test.after(function () {
  srv.stop();
});

test('without page everything comes back', async function () {
  const res = await api.get('/api/v1/invoices');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(Number(res.headers.get('x-total-count')), res.body.length);
  assert.strictEqual(res.headers.get('x-page'), null);
});

test('first and second page', async function () {
  const all = await api.get('/api/v1/invoices?sort=issue_date&order=asc');
  const p1 = await api.get('/api/v1/invoices?sort=issue_date&order=asc&page=1&per_page=10');
  const p2 = await api.get('/api/v1/invoices?sort=issue_date&order=asc&page=2&per_page=10');
  assert.strictEqual(p1.body.length, 10);
  assert.strictEqual(p1.headers.get('x-page'), '1');
  assert.strictEqual(p1.headers.get('x-per-page'), '10');
  assert.strictEqual(Number(p1.headers.get('x-total-count')), all.body.length);
  assert.deepStrictEqual(p1.body.concat(p2.body).map(function (i) { return i.id; }),
    all.body.slice(0, 20).map(function (i) { return i.id; }));
});

test('page after the end is empty', async function () {
  const res = await api.get('/api/v1/invoices?page=99&per_page=50');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, []);
});

test('sorted by issue date', async function () {
  const res = await api.get('/api/v1/invoices?sort=issue_date&order=asc&status=paid');
  const dates = res.body.map(function (i) { return i.issue_date; });
  assert.deepStrictEqual(dates, dates.slice().sort());
});

test('status filter and count', async function () {
  const res = await api.get('/api/v1/invoices?status=issued&per_page=5');
  res.body.forEach(function (i) { assert.strictEqual(i.status, 'issued'); });
  assert.ok(Number(res.headers.get('x-total-count')) >= res.body.length);
});

test('date range', async function () {
  const res = await api.get('/api/v1/invoices?from=2021-01-01&to=2021-12-31');
  assert.ok(res.body.length > 0);
  res.body.forEach(function (i) { assert.strictEqual(i.issue_date.slice(0, 4), '2021'); });
  assert.strictEqual(Number(res.headers.get('x-total-count')), res.body.length);
});

test('search', async function () {
  const res = await api.get('/api/v1/invoices?q=Krause&page=1&per_page=20');
  assert.ok(res.body.length > 0);
  res.body.forEach(function (i) { assert.strictEqual(i.customer_name, 'Krause GmbH'); });
});

test('wrong paging values', async function () {
  assert.strictEqual((await api.get('/api/v1/invoices?page=0')).status, 400);
  assert.strictEqual((await api.get('/api/v1/invoices?per_page=1000')).status, 400);
  assert.strictEqual((await api.get('/api/v1/invoices?page=abc')).status, 400);
  assert.strictEqual((await api.get('/api/v1/invoices?sort=note')).status, 400);
  assert.strictEqual((await api.get('/api/v1/invoices?status=offen')).status, 400);
  assert.strictEqual((await api.get('/api/v1/invoices?from=01.01.2021')).status, 400);
});
