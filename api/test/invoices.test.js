// services/invoices without http
process.env.APP_DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const invoices = require('../services/invoices');
const pdf = require('../lib/pdf');

test.before(function () {
  db.open();
  require('../seed/seed').seed();
});

test.after(function () {
  db.close();
});

test('rate from percent or old decimal', function () {
  assert.strictEqual(invoices.rateFrom({ tax_rate: 7 }, 19), 7);
  assert.strictEqual(invoices.rateFrom({ vat_rate: 0.07 }, 19), 7);
  assert.strictEqual(invoices.rateFrom({}, 19), 19);
});

test('create writes both tax columns', function () {
  var inv = invoices.create(1, { customer_id: 1, tax_rate: 7, items: [{ description: 'Buch', quantity: 3, unit_price: 20 }] });
  assert.strictEqual(inv.tax_rate, 7);
  assert.strictEqual(inv.legacy_tax_rate, 0.07);
  assert.strictEqual(inv.total_gross, 64.2);
});

test('draft update recomputes totals', function () {
  var inv = invoices.create(1, { customer_id: 1, items: [{ description: 'Stunde', quantity: 1, unit_price: 100 }] });
  var after = invoices.update(inv.id, { items: [{ description: 'Stunde', quantity: 2, unit_price: 100 }] });
  assert.strictEqual(after.total_net, 200);
  assert.strictEqual(after.total_gross, 238);
});

test('issued invoice keeps its totals on update', function () {
  var inv = invoices.findByNumber(1, 'RE-2020-0010');
  var full = invoices.getById(inv.id);
  var after = invoices.update(inv.id, {
    note: 'Anschrift geändert',
    discount_percent: 0,
    items: full.items.map(function (it) { return { description: it.description, quantity: it.quantity, unit_price: it.unit_price }; })
  });
  assert.strictEqual(after.total_gross, inv.total_gross);
  assert.strictEqual(after.discount_percent, 5);
  assert.strictEqual(after.note, 'Anschrift geändert');
});

test('copy keeps the tax rate', function () {
  var inv = invoices.findByNumber(2, 'RE-2022-0005');
  var copy = invoices.duplicate(inv.id);
  assert.strictEqual(copy.status, 'draft');
  assert.strictEqual(copy.tax_rate, 7);
});

test('imported invoices print with their old rate', function () {
  var inv = invoices.findByNumber(2, 'RE-2021-0079');
  assert.strictEqual(pdf.rateFor(inv), 7);
});
