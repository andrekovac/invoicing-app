// sent to the customer: POST/DELETE /api/v1/invoices/:id/sent, bulk 'sent', /not-sent
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const utils = require('../lib/utils');

let srv;
let api;
let customerId;

test.before(async function () {
  srv = await helpers.startServer();
  api = helpers.client(srv.base);
  await api.login('brandt');
  customerId = (await api.get('/api/v1/customers?q=Rosenrot')).body[0].id;
});

test.after(function () {
  srv.stop();
});

async function issued() {
  const created = await api.post('/api/v1/invoices', { customer_id: customerId, tax_rate: 19, items: [{ description: 'Speisekarten A4', quantity: 30, unit_price: 2.4 }] });
  return (await api.post('/api/v1/invoices/' + created.body.id + '/issue')).body;
}

test('mark as sent by post and undo it', async function () {
  const inv = await issued();
  const notSent = await api.get('/api/v1/invoices/not-sent');
  assert.ok(notSent.body.some(function (i) { return i.id === inv.id; }));

  const res = await api.post('/api/v1/invoices/' + inv.id + '/sent', { via: 'post' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.sent_via, 'post');
  assert.strictEqual(res.body.sent_at, utils.today());
  const after = await api.get('/api/v1/invoices/not-sent');
  assert.ok(!after.body.some(function (i) { return i.id === inv.id; }));

  const undo = await api.del('/api/v1/invoices/' + inv.id + '/sent');
  assert.strictEqual(undo.status, 200);
  assert.strictEqual(undo.body.sent_at, null);
  const events = (await api.get('/api/v1/invoices/' + inv.id + '/events')).body.map(function (e) { return e.type; });
  assert.ok(events.indexOf('sent') !== -1 && events.indexOf('sent_removed') !== -1);
});

test('drafts, wrong way or a date in the future are refused', async function () {
  const draft = await api.post('/api/v1/invoices', { customer_id: customerId, items: [{ description: 'x', quantity: 1, unit_price: 1 }] });
  assert.strictEqual((await api.post('/api/v1/invoices/' + draft.body.id + '/sent', {})).status, 409);
  const inv = await issued();
  assert.strictEqual((await api.post('/api/v1/invoices/' + inv.id + '/sent', { via: 'brieftaube' })).status, 400);
  assert.strictEqual((await api.post('/api/v1/invoices/' + inv.id + '/sent', { sent_at: utils.addDays(utils.today(), 3) })).status, 400);
});

test('invoice mail marks it as sent by mail', async function () {
  const inv = await issued();
  const mail = await api.post('/api/v1/invoices/' + inv.id + '/mail', {});
  assert.strictEqual(mail.status, 201);
  const view = await api.get('/api/v1/invoices/' + inv.id);
  assert.strictEqual(view.body.sent_via, 'mail');
});

test('bulk sent', async function () {
  const a = await issued();
  const b = await issued();
  const res = await api.post('/api/v1/invoices/bulk', { action: 'sent', ids: [a.id, b.id], via: 'post' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.done, 2);
  assert.strictEqual((await api.get('/api/v1/invoices/' + b.id)).body.sent_via, 'post');
});
