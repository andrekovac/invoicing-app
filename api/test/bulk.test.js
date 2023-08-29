// POST /api/v1/invoices/bulk
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');

let srv;
let api;
let customerId;

test.before(async function () {
  srv = await helpers.startServer();
  api = helpers.client(srv.base);
  await api.login('brandt');
  customerId = (await api.get('/api/v1/customers?q=Weber')).body[0].id;
});

test.after(function () {
  srv.stop();
});

async function draft(price) {
  const res = await api.post('/api/v1/invoices', {
    customer_id: customerId,
    items: [{ description: 'Beratung', quantity: 1, unit_price: price }]
  });
  return res.body.id;
}

test('issue several drafts', async function () {
  const a = await draft(100);
  const b = await draft(200);
  const res = await api.post('/api/v1/invoices/bulk', { action: 'issue', ids: [a, b, b] });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.done, 2);
  assert.strictEqual(res.body.failed, 0);
  res.body.results.forEach(function (r) { assert.match(r.number, /^RE-/); });
});

test('mark several as paid, one is still a draft', async function () {
  const a = await draft(50);
  const b = await draft(60);
  await api.post('/api/v1/invoices/' + a + '/issue');
  const res = await api.post('/api/v1/invoices/bulk', { action: 'paid', ids: [a, b], paid_at: '2023-08-01' });
  assert.strictEqual(res.body.done, 1);
  assert.strictEqual(res.body.failed, 1);
  assert.strictEqual(res.body.results[1].ok, false);
  const paid = await api.get('/api/v1/invoices/' + a);
  assert.strictEqual(paid.body.status, 'paid');
  assert.strictEqual(paid.body.paid_at, '2023-08-01');
});

test('cancel skips paid invoices', async function () {
  const list = await api.get('/api/v1/invoices?status=paid&per_page=1');
  const a = await draft(70);
  await api.post('/api/v1/invoices/' + a + '/issue');
  const res = await api.post('/api/v1/invoices/bulk', { action: 'cancel', ids: [a, list.body[0].id] });
  assert.strictEqual(res.body.done, 1);
  assert.strictEqual(res.body.results[1].error, 'bezahlte Rechnungen nicht stornieren');
});

test('invoices of another account are not touched', async function () {
  const other = helpers.client(srv.base);
  await other.login('albers');
  const theirs = await other.get('/api/v1/invoices?status=issued&per_page=1');
  const res = await api.post('/api/v1/invoices/bulk', { action: 'cancel', ids: [theirs.body[0].id] });
  assert.deepStrictEqual(res.body.results, [{ id: theirs.body[0].id, ok: false, error: 'not found' }]);
});

test('wrong input', async function () {
  assert.strictEqual((await api.post('/api/v1/invoices/bulk', { action: 'delete', ids: [1] })).status, 400);
  assert.strictEqual((await api.post('/api/v1/invoices/bulk', { action: 'issue', ids: [] })).status, 400);
  assert.strictEqual((await api.post('/api/v1/invoices/bulk', { action: 'issue', ids: ['x'] })).status, 400);
  assert.strictEqual((await api.post('/api/v1/invoices/bulk', { action: 'paid', ids: [1], paid_at: '1.8.2023' })).status, 400);
});
