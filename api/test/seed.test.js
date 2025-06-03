// demo data: what a fresh `npm run db:reset` contains
process.env.APP_DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const invoices = require('../services/invoices');
const customers = require('../services/customers');

test.before(function () {
  db.open();
  require('../seed/seed').seed();
});

test.after(function () {
  db.close();
});

test('two accounts with users', function () {
  const rows = db.open().prepare('SELECT a.name, count(u.id) AS users FROM accounts a JOIN users u ON u.account_id = a.id GROUP BY a.id ORDER BY a.id').all();
  assert.deepStrictEqual(rows.map(function (r) { return [r.name, r.users]; }), [['Agentur Brandt', 2], ['Druckerei Albers KG', 2]]);
});

test('every invoice has a customer of its own account', function () {
  const bad = db.open().prepare('SELECT count(*) AS n FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE c.account_id != i.account_id').get();
  assert.strictEqual(bad.n, 0);
});

test('issued and paid invoices have a number', function () {
  const missing = db.open().prepare("SELECT count(*) AS n FROM invoices WHERE status != 'draft' AND number IS NULL").get();
  assert.strictEqual(missing.n, 0);
});

test('Krause GmbH has the new address from 2023', function () {
  const krause = customers.list(2, 'Krause')[0];
  assert.strictEqual(krause.street, 'Carl-Benz-Str. 21');
  assert.strictEqual(krause.legacy_no, 'K1001');
});

test('Krause invoices were saved once with the new address', function () {
  const krause = customers.list(2, 'Krause')[0];
  const list = invoices.list(2, { customer_id: krause.id });
  assert.strictEqual(list.length, 6);
  list.forEach(function (inv) {
    const updated = invoices.events(inv.id).filter(function (e) { return e.type === 'updated'; });
    assert.ok(updated.length >= 1, inv.number);
    assert.ok(updated[updated.length - 1].data.fields.indexOf('items') !== -1, inv.number);
  });
});

test('RE-2021-0087 is open', function () {
  const inv = invoices.findByNumber(2, 'RE-2021-0087');
  assert.strictEqual(inv.status, 'issued');
  assert.strictEqual(inv.legacy_no, '2021-0087');
});
