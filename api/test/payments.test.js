// payments: card via the CardPay sandbox, bank transfers
process.env.APP_DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const invoices = require('../services/invoices');
const customers = require('../services/customers');
const payments = require('../services/payments');
const cardpay = require('../lib/cardpay');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

const CARD = { number: '4242 4242 4242 4242', exp_month: 12, exp_year: new Date().getFullYear() + 2, cvc: '123' };
var customer;

function openInvoice(net) {
  var inv = invoices.create(1, {
    customer_id: customer.id,
    items: [{ description: 'Beratung', quantity: 1, unit_price: net }]
  });
  return invoices.issue(inv.id);
}

test.before(function () {
  db.open();
  require('../seed/seed').seed();
  customer = customers.create(1, { name: 'Zahlungstest GmbH', city: 'Köln', country: 'Deutschland' });
});

test.after(function () {
  db.close();
});

test('sandbox charge', async function () {
  var res = await cardpay.charge({ amount: 1190, currency: 'EUR', billing_country: 'DE', card: CARD });
  assert.strictEqual(res.status, 'succeeded');
  assert.match(res.id, /^ch_/);
  assert.strictEqual(res.last4, '4242');
});

test('sandbox declined card', async function () {
  await assert.rejects(
    cardpay.charge({ amount: 1190, currency: 'EUR', billing_country: 'DE', card: Object.assign({}, CARD, { number: '4000000000000002' }) }),
    function (err) { return err.status === 402 && err.code === 'card_declined'; }
  );
});

test('card payment marks invoice paid', async function () {
  var inv = openInvoice(100);
  assert.strictEqual(inv.total_gross, money.round2(pricing.gross(100, 19)));
  var res = await payments.startCardPayment(inv, CARD);
  assert.strictEqual(res.amount, 119);
  assert.strictEqual(invoices.findById(inv.id).status, 'paid');
  assert.strictEqual(payments.forInvoice(inv.id)[0].method, 'card');
});

test('partial transfers', function () {
  var inv = openInvoice(200);
  payments.recordPayment(inv, { amount: 100, paid_at: '2022-03-01' });
  assert.strictEqual(payments.openAmount(invoices.findById(inv.id)), 138);
  assert.strictEqual(invoices.findById(inv.id).status, 'issued');
  payments.recordPayment(inv, { amount: 138, paid_at: '2022-03-05' });
  var after = invoices.findById(inv.id);
  assert.strictEqual(after.status, 'paid');
  assert.strictEqual(after.paid_at, '2022-03-05');
  assert.strictEqual(payments.paidAmount(inv.id), money.round2(pricing.gross(200, 19)));
});

test('remove payment opens the invoice again', function () {
  var inv = openInvoice(50);
  var p = payments.recordPayment(inv, { amount: 59.5 });
  assert.strictEqual(invoices.findById(inv.id).status, 'paid');
  payments.removePayment(p);
  assert.strictEqual(invoices.findById(inv.id).status, 'issued');
});

test('list payments of the account', function () {
  var rows = payments.list(1);
  assert.ok(rows.length >= 3);
  assert.ok(rows[0].number);
});
