// credit notes: POST /api/v1/invoices/:id/credit-note
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const money = require('../lib/money');

let srv;
let api;
let customerId;

test.before(async function () {
  srv = await helpers.startServer();
  api = helpers.client(srv.base);
  await api.login('brandt');
  customerId = (await api.get('/api/v1/customers?q=Lindner')).body[0].id;
});

test.after(function () {
  srv.stop();
});

async function issuedInvoice(items) {
  const created = await api.post('/api/v1/invoices', { customer_id: customerId, tax_rate: 19, items: items });
  const issued = await api.post('/api/v1/invoices/' + created.body.id + '/issue');
  return issued.body;
}

test('whole invoice: credit note with own number, original cancelled', async function () {
  const inv = await issuedInvoice([{ description: 'Plakat A1', quantity: 10, unit_price: 12.5 }]);
  const res = await api.post('/api/v1/invoices/' + inv.id + '/credit-note', { reason: 'falscher Kunde' });
  assert.strictEqual(res.status, 201);
  const credit = res.body;
  assert.ok(/^RE-\d{4}-\d{4}$/.test(credit.number));
  assert.notStrictEqual(credit.number, inv.number);
  assert.strictEqual(credit.status, 'paid');
  assert.strictEqual(credit.total_gross, -inv.total_gross);
  assert.strictEqual(credit.items[0].quantity, -10);

  const original = await api.get('/api/v1/invoices/' + inv.id);
  assert.strictEqual(original.body.status, 'cancelled');
  const list = await api.get('/api/v1/invoices/' + inv.id + '/credit-notes');
  assert.deepStrictEqual(list.body.map(function (c) { return c.number; }), [credit.number]);
});

test('part of an invoice: open amount goes down', async function () {
  const inv = await issuedInvoice([
    { description: 'Flyer A6', quantity: 1000, unit_price: 0.1 },
    { description: 'Gestaltung', quantity: 2, unit_price: 60 }
  ]);
  const second = inv.items[1];
  const res = await api.post('/api/v1/invoices/' + inv.id + '/credit-note', { reason: 'nur 1 Std. Gestaltung', items: [{ item_id: second.id, quantity: 1 }] });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.total_gross, -71.4);
  const pay = await api.get('/api/v1/payments?invoice_id=' + inv.id);
  assert.strictEqual(pay.body.open, money.round2(inv.total_gross - 71.4));
  assert.strictEqual(pay.body.payments[0].method, 'credit');
});

test('credit note as text says GUTSCHRIFT', async function () {
  const inv = await issuedInvoice([{ description: 'Banner', quantity: 1, unit_price: 80 }]);
  const res = await api.post('/api/v1/invoices/' + inv.id + '/credit-note', { reason: 'doppelt berechnet' });
  const txt = await api.get('/api/v1/invoices/' + res.body.id + '/pdf?format=txt');
  assert.ok(txt.body.indexOf('GUTSCHRIFT ' + res.body.number) !== -1);
  assert.ok(txt.body.indexOf('Gutschrift zu ' + inv.number) !== -1);
});

test('not more than the invoice', async function () {
  const inv = await issuedInvoice([{ description: 'Stempel', quantity: 2, unit_price: 20 }]);
  const item = inv.items[0];
  await api.post('/api/v1/invoices/' + inv.id + '/credit-note', { reason: 'eins zurück', items: [{ item_id: item.id, quantity: 1 }] });
  await api.post('/api/v1/invoices/' + inv.id + '/credit-note', { reason: 'zweites zurück', items: [{ item_id: item.id, quantity: 1 }] });
  const res = await api.post('/api/v1/invoices/' + inv.id + '/credit-note', { reason: 'nochmal', items: [{ item_id: item.id, quantity: 1 }] });
  assert.strictEqual(res.status, 409);
});

test('drafts and missing reason', async function () {
  const draft = await api.post('/api/v1/invoices', { customer_id: customerId, items: [{ description: 'x', quantity: 1, unit_price: 1 }] });
  assert.strictEqual((await api.post('/api/v1/invoices/' + draft.body.id + '/credit-note', { reason: 'x' })).status, 409);
  const inv = await issuedInvoice([{ description: 'y', quantity: 1, unit_price: 1 }]);
  assert.strictEqual((await api.post('/api/v1/invoices/' + inv.id + '/credit-note', {})).status, 400);
});
