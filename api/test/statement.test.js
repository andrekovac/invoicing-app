// statement of account per customer: GET /api/v1/customers/:id/statement
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');

let srv;
let albers;
let brandt;
let seidel;

test.before(async function () {
  srv = await helpers.startServer();
  albers = helpers.client(srv.base);
  brandt = helpers.client(srv.base);
  await albers.login('albers');
  await brandt.login('brandt');
  seidel = (await albers.get('/api/v1/customers?q=Seidel')).body[0];
});

test.after(function () {
  srv.stop();
});

test('invoices and payments with running balance', async function () {
  const res = await albers.get('/api/v1/customers/' + seidel.id + '/statement');
  assert.strictEqual(res.status, 200);
  const st = res.body;
  assert.strictEqual(st.opening_balance, 0);
  assert.strictEqual(st.lines[0].type, 'invoice');
  assert.strictEqual(st.lines[1].type, 'payment');
  const last = st.lines[st.lines.length - 1];
  assert.strictEqual(last.balance, st.closing_balance);
  assert.strictEqual(Math.round((st.debit - st.credit) * 100) / 100, st.closing_balance);
  assert.strictEqual(st.closing_balance, seidel.open_amount);
});

test('opening balance from before the period', async function () {
  const res = await albers.get('/api/v1/customers/' + seidel.id + '/statement?from=2022-07-01');
  assert.ok(res.body.opening_balance > 0);
  assert.strictEqual(res.body.lines.length, 0);
});

test('as text and pdf', async function () {
  const txt = await albers.get('/api/v1/customers/' + seidel.id + '/statement?format=txt');
  assert.ok(txt.body.indexOf('KONTOAUSZUG') !== -1);
  assert.ok(txt.body.indexOf('Offener Betrag') !== -1);
  const pdf = await albers.get('/api/v1/customers/' + seidel.id + '/statement?format=pdf');
  assert.strictEqual(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok(pdf.body.indexOf('%PDF-1.4') === 0);
});

test('other account gets 404', async function () {
  const res = await brandt.get('/api/v1/customers/' + seidel.id + '/statement');
  assert.strictEqual(res.status, 404);
});
