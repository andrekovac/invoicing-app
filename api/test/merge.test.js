// duplicate customers and merging them
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const customers = require('../services/customers');

let srv;
let admin;
let user;

test.before(async function () {
  srv = await helpers.startServer();
  admin = helpers.client(srv.base);
  user = helpers.client(srv.base);
  await admin.login('brandt');
  await user.login('brandtUser');
});

test.after(function () {
  srv.stop();
});

test('names for comparing', function () {
  assert.strictEqual(customers.compareName('Krause GmbH'), 'krause');
  assert.strictEqual(customers.compareName('KRAUSE G.m.b.H.'), 'krause');
  assert.strictEqual(customers.compareName('Hofmann Logistik GmbH & Co. KG'), 'hofmann logistik');
  assert.strictEqual(customers.compareName('Café Rosenrot'), 'café rosenrot');
  assert.strictEqual(customers.compareName('Praxis Dr. Weber'), 'praxis dr weber');
});

test('finds and merges a duplicate', async function () {
  const dup = await admin.post('/api/v1/customers', { name: 'HOFMANN LOGISTIK G.m.b.H.', phone: '0214 88 99 0', city: 'Leverkusen' });
  const inv = await admin.post('/api/v1/invoices', { customer_id: dup.body.id, items: [{ description: 'Flyer', quantity: 1, unit_price: 80 }] });

  const groups = await admin.get('/api/v1/customers/duplicates');
  assert.strictEqual(groups.status, 200);
  const group = groups.body.find(function (g) { return g.key === 'hofmann logistik'; });
  assert.strictEqual(group.customers.length, 2);
  const keepId = group.customers[0].id;

  const res = await admin.post('/api/v1/customers/' + keepId + '/merge', { from: dup.body.id });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.invoices_moved, 1);
  assert.deepStrictEqual(res.body.fields_filled, ['phone']);
  assert.strictEqual(res.body.customer.phone, '0214 88 99 0');

  const moved = await admin.get('/api/v1/invoices/' + inv.body.id);
  assert.strictEqual(moved.body.customer_id, keepId);
  assert.strictEqual((await admin.get('/api/v1/customers/' + dup.body.id)).status, 404);
});

test('only admins merge', async function () {
  const a = await admin.post('/api/v1/customers', { name: 'Doppelt' });
  const b = await admin.post('/api/v1/customers', { name: 'doppelt' });
  const res = await user.post('/api/v1/customers/' + a.body.id + '/merge', { from: b.body.id });
  assert.strictEqual(res.status, 403);
});

test('cannot merge with itself or a customer of another account', async function () {
  const a = await admin.post('/api/v1/customers', { name: 'Einzeln' });
  assert.strictEqual((await admin.post('/api/v1/customers/' + a.body.id + '/merge', { from: a.body.id })).status, 400);
  const other = helpers.client(srv.base);
  await other.login('albers');
  const theirs = await other.get('/api/v1/customers?q=Krause');
  assert.strictEqual((await admin.post('/api/v1/customers/' + a.body.id + '/merge', { from: theirs.body[0].id })).status, 404);
});
