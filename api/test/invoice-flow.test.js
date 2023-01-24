// one invoice from draft to paid through the http api
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

let srv;
let api;
let customerId;
let id;

test.before(async function () {
  srv = await helpers.startServer();
  api = helpers.client(srv.base);
  await api.login('brandt');
  const list = await api.get('/api/v1/customers?q=Hofmann');
  customerId = list.body[0].id;
});

test.after(function () {
  srv.stop();
});

test('create a draft', async function () {
  const res = await api.post('/api/v1/invoices', {
    customer_id: customerId,
    tax_rate: 19,
    items: [
      { description: 'Wartung Website Januar', quantity: 1, unit_price: '120,00' },
      { description: 'Hosting', quantity: 3, unit_price: 14.9 }
    ]
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.status, 'draft');
  assert.strictEqual(res.body.number, null);
  assert.strictEqual(res.body.total_net, 164.7);
  assert.strictEqual(res.body.total_gross, money.round2(pricing.gross(164.7, 19)));
  id = res.body.id;
});

test('change items of the draft', async function () {
  const res = await api.put('/api/v1/invoices/' + id, {
    items: [
      { description: 'Wartung Website Januar', quantity: 1, unit_price: 120 },
      { description: 'Hosting', quantity: 3, unit_price: 14.9 },
      { description: 'Domain', quantity: 1, unit_price: 12 }
    ]
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.items.length, 3);
  assert.strictEqual(res.body.total_net, 176.7);
});

test('issue gives a number and a due date', async function () {
  const res = await api.post('/api/v1/invoices/' + id + '/issue');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'issued');
  assert.match(res.body.number, /^RE-\d{4}-\d{4}$/);
  assert.ok(res.body.due_date > res.body.issue_date);
});

test('issued: no more new items', async function () {
  const res = await api.post('/api/v1/invoices/' + id + '/items', { description: 'Extra', unit_price: 10 });
  assert.strictEqual(res.status, 409);
});

test('partial payment, then paid', async function () {
  const part = await api.post('/api/v1/payments', { invoice_id: id, amount: '50,00' });
  assert.strictEqual(part.status, 201);
  const paid = await api.post('/api/v1/invoices/' + id + '/paid');
  assert.strictEqual(paid.status, 200);
  assert.strictEqual(paid.body.status, 'paid');
  const pays = await api.get('/api/v1/payments?invoice_id=' + id);
  assert.strictEqual(pays.body.payments.length, 2);
  assert.strictEqual(pays.body.open, 0);
});

test('paid invoices cannot be deleted', async function () {
  const res = await api.del('/api/v1/invoices/' + id);
  assert.strictEqual(res.status, 409);
});
