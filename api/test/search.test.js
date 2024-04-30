// customer search: GET /api/v1/customers/search
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');

let srv;
let albers;
let brandt;

test.before(async function () {
  srv = await helpers.startServer();
  albers = helpers.client(srv.base);
  brandt = helpers.client(srv.base);
  await albers.login('albers');
  await brandt.login('brandt');
});

test.after(function () {
  srv.stop();
});

function names(res) {
  return res.body.map(function (c) { return c.name; });
}

test('finds a customer by part of the name', async function () {
  const res = await albers.get('/api/v1/customers/search?q=Krause');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(names(res), ['Krause GmbH']);
});

test('case does not matter', async function () {
  const res = await albers.get('/api/v1/customers/search?q=kRAUSE');
  assert.deepStrictEqual(names(res), ['Krause GmbH']);
});

test('finds Müller Gartenbau', async function () {
  const res = await albers.get('/api/v1/customers/search?q=' + encodeURIComponent('Müller'));
  assert.strictEqual(res.status, 200);
  assert.ok(names(res).indexOf('Müller Gartenbau') !== -1);
});

test('middle of the name', async function () {
  const res = await albers.get('/api/v1/customers/search?q=garten');
  assert.deepStrictEqual(names(res), ['Müller Gartenbau']);
});

test('counts invoices and the open amount', async function () {
  const res = await albers.get('/api/v1/customers/search?q=Gartenbau');
  const c = res.body[0];
  assert.strictEqual(c.invoice_count, 2);
  assert.ok(c.open_amount > 0);
  assert.strictEqual(c.last_invoice_date, '2024-04-22');
});

test('only customers with open invoices', async function () {
  const res = await albers.get('/api/v1/customers/search?q=Schäfer&with_open=1');
  assert.deepStrictEqual(names(res), ['Weingut Schäfer']);
});

test('only the own account', async function () {
  const res = await brandt.get('/api/v1/customers/search?q=Krause');
  assert.deepStrictEqual(res.body, []);
});

test('at least 2 letters', async function () {
  const res = await albers.get('/api/v1/customers/search?q=K');
  assert.strictEqual(res.status, 400);
});
