// small scripts: run-recurring (plan) and export-month
process.env.APP_DB_FILE = ':memory:';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../db');
const runRecurring = require('../scripts/run-recurring');
const exportMonth = require('../scripts/export-month');

test.before(function () {
  db.open();
  require('../seed/seed').seed();
});

test('plan of a series stops at the end date', function () {
  const rec = { next_date: '2025-10-05', interval_months: 1, day_of_month: 5, end_date: '2025-12-31' };
  assert.deepStrictEqual(runRecurring.plan(rec, '2026-03-31'), ['2025-10-05', '2025-11-05', '2025-12-05']);
});

test('month range', function () {
  assert.deepStrictEqual(exportMonth.monthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' });
  assert.strictEqual(exportMonth.monthRange('2024-2'), null);
});

test('export of one month writes three files', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-'));
  try {
    const files = exportMonth.write(dir, 2, '2021-06');
    assert.strictEqual(files.length, 3);
    const invoices = fs.readFileSync(files[0], 'utf8');
    assert.ok(invoices.indexOf('RE-2021-0087') !== -1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('lint finds no errors in the api', function () {
  const res = require('child_process').spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'scripts', 'lint.js')], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, res.stdout);
  assert.match(res.stdout, /0 errors/);
});
