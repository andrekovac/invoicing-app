// positions pasted from a spreadsheet, payment extension
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
  customerId = (await api.get('/api/v1/customers?q=Weber')).body[0].id;
});

test.after(function () {
  srv.stop();
});

async function draft() {
  return (await api.post('/api/v1/invoices', { customer_id: customerId, tax_rate: 19, items: [{ description: 'Beratung', quantity: 1, unit_price: 90 }] })).body;
}

test('paste lines from a spreadsheet', async function () {
  const inv = await draft();
  const text = 'Beschreibung\tMenge\tEinzelpreis\nTerminkarten\t500\t0,12\nPraxisschild Acryl\t1\t1.149,00 €\n';
  const res = await api.post('/api/v1/invoices/' + inv.id + '/items/paste', { text: text });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.items.length, 3);
  assert.strictEqual(res.body.items[2].unit_price, 1149);
  assert.strictEqual(res.body.total_net, 1299);
});

test('semicolons and replace', async function () {
  const inv = await draft();
  const res = await api.post('/api/v1/invoices/' + inv.id + '/items/paste', { text: 'Flyer;2;69,90', replace: true });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.items.length, 1);
  assert.strictEqual(res.body.items[0].description, 'Flyer');
});

test('wrong lines come back with the line number', async function () {
  const inv = await draft();
  const res = await api.post('/api/v1/invoices/' + inv.id + '/items/paste', { text: 'Flyer\t2\t69,90\nVersand\tzwei\t5\nnur text' });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(res.body.errors.map(function (e) { return e.line; }), [2, 3]);
});

test('issued invoices take no pasted lines', async function () {
  const inv = await draft();
  await api.post('/api/v1/invoices/' + inv.id + '/issue');
  const res = await api.post('/api/v1/invoices/' + inv.id + '/items/paste', { text: 'Flyer\t2\t69,90' });
  assert.strictEqual(res.status, 409);
});

test('payment extension moves the due date, the amounts stay', async function () {
  const inv = (await api.post('/api/v1/invoices/' + (await draft()).id + '/issue')).body;
  const due = utils.addDays(inv.due_date, 30);
  const res = await api.put('/api/v1/invoices/' + inv.id + '/due-date', { due_date: due, reason: 'Kunde hat angerufen' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.due_date, due);
  assert.strictEqual(res.body.total_gross, inv.total_gross);
  const events = (await api.get('/api/v1/invoices/' + inv.id + '/events')).body;
  const ev = events.find(function (e) { return e.type === 'due_date'; });
  assert.strictEqual(ev.data.reason, 'Kunde hat angerufen');

  const bad = await api.put('/api/v1/invoices/' + inv.id + '/due-date', { due_date: utils.addDays(inv.issue_date, -1) });
  assert.strictEqual(bad.status, 400);
});
