// import of the desktop csv export
process.env.APP_DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const db = require('../db');
const importer = require('../scripts/import-legacy');
const invoices = require('../services/invoices');
const pdf = require('../lib/pdf');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

const DIR = path.join(__dirname, '..', 'seed', 'legacy');
var accountId;

test.before(function () {
  accountId = Number(db.open().prepare("INSERT INTO accounts (name) VALUES ('Import Test')").run().lastInsertRowid);
});

test.after(function () {
  db.close();
});

test('dry run reads the files', function () {
  var stats = importer.importDir(DIR, accountId, { dry: true });
  assert.strictEqual(stats.customers, 7);
  assert.strictEqual(stats.invoices, 24);
  assert.deepStrictEqual(stats.warnings, []);
});

test('import', function () {
  var stats = importer.importDir(DIR, accountId);
  assert.strictEqual(stats.customers, 7);
  assert.strictEqual(stats.invoices, 24);
  assert.ok(stats.items > 40);
});

test('second import skips everything', function () {
  var stats = importer.importDir(DIR, accountId);
  assert.strictEqual(stats.invoices, 0);
  assert.strictEqual(stats.skipped, 31);
});

test('prices keep 4 decimals', function () {
  var inv = invoices.findByNumber(accountId, 'RE-2021-0087');
  assert.ok(inv);
  var items = invoices.itemsFor(inv.id);
  assert.strictEqual(items[0].unit_price, 118.3104);
  assert.strictEqual(inv.total_gross, 1234.57);
  assert.strictEqual(inv.status, 'issued');
});

test('totals like the old program', function () {
  var t = importer.legacyTotals([{ quantity: 2, unit_price: 12.345 }], 19, 0);
  assert.strictEqual(t.total_net, 24.69);
  assert.strictEqual(t.total_gross, money.round2(pricing.gross(24.69, 19)));
});

test('pdf shows the same total as the list', function () {
  var rows = db.open().prepare('SELECT id FROM invoices WHERE account_id = ?').all(accountId);
  rows.forEach(function (r) {
    var inv = invoices.getById(r.id);
    assert.strictEqual(pdf.totals(inv).gross, inv.total_gross, inv.number);
  });
});
