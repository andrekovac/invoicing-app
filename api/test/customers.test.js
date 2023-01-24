// customers api: crud, search, scoping per account
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');

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

test('list is sorted by name', async function () {
  const res = await brandt.get('/api/v1/customers');
  assert.strictEqual(res.status, 200);
  const names = res.body.map(function (c) { return c.name; });
  assert.deepStrictEqual(names, names.slice().sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }));
});

test('search by city', async function () {
  const res = await brandt.get('/api/v1/customers?q=Bonn');
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].name, 'Schulz Immobilien GmbH');
});

test('open amount per customer', async function () {
  const res = await brandt.get('/api/v1/customers?q=Schulz');
  assert.ok(res.body[0].open_amount > 0);
});

test('create, update, delete', async function () {
  const created = await brandt.post('/api/v1/customers', { name: '  Tischlerei Vogt ', city: 'Brühl', country: ' Deutschland ', default_tax_rate: '19' });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.name, 'Tischlerei Vogt');
  assert.strictEqual(created.body.country, 'Deutschland');
  assert.strictEqual(created.body.default_tax_rate, 19);

  const updated = await brandt.put('/api/v1/customers/' + created.body.id, { email: 'info@vogt.example', default_tax_rate: '' });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.body.email, 'info@vogt.example');
  assert.strictEqual(updated.body.default_tax_rate, null);

  const removed = await brandt.del('/api/v1/customers/' + created.body.id);
  assert.strictEqual(removed.status, 204);
  const gone = await brandt.get('/api/v1/customers/' + created.body.id);
  assert.strictEqual(gone.status, 404);
});

test('name is required', async function () {
  const res = await brandt.post('/api/v1/customers', { name: '   ' });
  assert.strictEqual(res.status, 400);
});

test('wrong tax rate', async function () {
  const res = await brandt.post('/api/v1/customers', { name: 'Test', default_tax_rate: 16 });
  assert.strictEqual(res.status, 400);
});

test('customer with invoices cannot be deleted', async function () {
  const list = await brandt.get('/api/v1/customers?q=Lindner');
  const res = await brandt.del('/api/v1/customers/' + list.body[0].id);
  assert.strictEqual(res.status, 409);
});

test('customers of another account are not visible', async function () {
  const list = await albers.get('/api/v1/customers?q=Krause');
  assert.strictEqual(list.body.length, 1);
  const res = await brandt.get('/api/v1/customers/' + list.body[0].id);
  assert.strictEqual(res.status, 404);
  const put = await brandt.put('/api/v1/customers/' + list.body[0].id, { name: 'x' });
  assert.strictEqual(put.status, 404);
});

test('invoices of a customer', async function () {
  const list = await albers.get('/api/v1/customers?q=Krause');
  const res = await albers.get('/api/v1/customers/' + list.body[0].id + '/invoices');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.length >= 6);
  res.body.forEach(function (inv) { assert.strictEqual(inv.customer_name, 'Krause GmbH'); });
});
