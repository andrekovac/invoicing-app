// recurring invoices: services/recurring.js and /api/v1/invoices/recurring
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const recurring = require('../services/recurring');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

let srv;
let brandt;
let albers;
let templateId;

test.before(async function () {
  srv = await helpers.startServer();
  brandt = helpers.client(srv.base);
  albers = helpers.client(srv.base);
  await brandt.login('brandt');
  await albers.login('albers');
  // Kanzlei Seidel: default tax rate 19 %
  const customers = await albers.get('/api/v1/customers?q=Seidel');
  const created = await albers.post('/api/v1/invoices', {
    customer_id: customers.body[0].id,
    tax_rate: 19,
    issue_date: '2024-01-15',
    items: [
      { description: 'Newsletter {monat} {jahr}, Druck und Versand', quantity: 1, unit_price: 340 },
      { description: 'Porto', quantity: 250, unit_price: 0.85 }
    ]
  });
  templateId = created.body.id;
});

test.after(function () {
  srv.stop();
});

test('addMonths keeps the day or takes the last day of the month', function () {
  assert.strictEqual(recurring.addMonths('2024-01-31', 1, 31), '2024-02-29');
  assert.strictEqual(recurring.addMonths('2024-11-15', 2, 15), '2025-01-15');
  assert.strictEqual(recurring.addMonths('2024-03-01', 12, 1), '2025-03-01');
});

test('first date is not before the start', function () {
  assert.strictEqual(recurring.firstDate('2024-03-10', 5), '2024-04-05');
  assert.strictEqual(recurring.firstDate('2024-03-10', 15), '2024-03-15');
});

test('placeholders in the item texts', function () {
  assert.strictEqual(recurring.fillText('Wartung {monat} {jahr}', '2024-03-01', 1), 'Wartung März 2024');
  assert.strictEqual(recurring.fillText('Hosting {zeitraum}', '2024-01-01', 3), 'Hosting Januar bis März 2024');
});

test('create a recurring invoice and run it', async function () {
  const res = await albers.post('/api/v1/invoices/recurring', {
    template_invoice_id: templateId,
    title: 'Newsletter Kanzlei',
    start_date: '2024-02-01',
    end_date: '2024-04-30',
    day_of_month: 1
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.next_date, '2024-02-01');

  const created = recurring.runDue(2, '2024-06-30').filter(function (c) { return c.recurring_id === res.body.id; });
  assert.strictEqual(created.length, 3);
  assert.deepStrictEqual(created.map(function (c) { return c.date; }), ['2024-02-01', '2024-03-01', '2024-04-01']);

  const detail = await albers.get('/api/v1/invoices/recurring/' + res.body.id);
  assert.strictEqual(detail.body.copies.length, 3);
  assert.strictEqual(detail.body.active, 0);
  assert.strictEqual(detail.body.next_date, null);

  const copy = await albers.get('/api/v1/invoices/' + created[1].invoice_id);
  assert.strictEqual(copy.body.status, 'issued');
  assert.ok(/^RE-2024-\d{4}$/.test(copy.body.number));
  assert.strictEqual(copy.body.items[0].description, 'Newsletter März 2024, Druck und Versand');
  assert.strictEqual(copy.body.due_date, '2024-03-15');
  assert.strictEqual(copy.body.tax_rate, 19);
  assert.strictEqual(copy.body.total_gross, money.round2(pricing.gross(340 + 250 * 0.85, 19)));
});

test('preview of the next copy', async function () {
  const res = await albers.post('/api/v1/invoices/' + templateId + '/recurring', { start_date: '2024-07-01', interval_months: 3 });
  assert.strictEqual(res.status, 201);
  const detail = await albers.get('/api/v1/invoices/recurring/' + res.body.id);
  assert.strictEqual(detail.body.next.date, '2024-07-15');
  assert.strictEqual(detail.body.next.items[0].description, 'Newsletter Juli 2024, Druck und Versand');
  assert.strictEqual(detail.body.next.total_gross, money.round2(pricing.gross(552.5, 19)));
});

test('pause, run now, resume', async function () {
  const res = await albers.post('/api/v1/invoices/recurring', { template_invoice_id: templateId, start_date: '2030-01-01' });
  const id = res.body.id;
  const paused = await albers.post('/api/v1/invoices/recurring/' + id + '/pause');
  assert.strictEqual(paused.body.active, 0);
  const run = await albers.post('/api/v1/invoices/recurring/' + id + '/run');
  assert.strictEqual(run.status, 201);
  assert.strictEqual(run.body.issue_date, '2030-01-01');
  const resumed = await albers.post('/api/v1/invoices/recurring/' + id + '/resume');
  assert.strictEqual(resumed.body.active, 1);
  assert.strictEqual(resumed.body.next_date, '2030-02-01');
});

test('list and delete', async function () {
  const list = await albers.get('/api/v1/invoices/recurring');
  assert.ok(list.body.length >= 3);
  const del = await albers.del('/api/v1/invoices/recurring/' + list.body[list.body.length - 1].id);
  assert.strictEqual(del.status, 204);
});

test('wrong input', async function () {
  const res = await albers.post('/api/v1/invoices/recurring', { template_invoice_id: templateId, start_date: 'morgen', interval_months: 5 });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.errors.length, 2);
});

test('template of another account', async function () {
  const res = await brandt.post('/api/v1/invoices/recurring', { template_invoice_id: templateId, start_date: '2024-02-01' });
  assert.strictEqual(res.status, 400);
});

test('coming recurring invoices for the dashboard', async function () {
  const res = await albers.get('/api/v1/reports/recurring?months=12');
  assert.strictEqual(res.status, 200);
  res.body.invoices.forEach(function (r) { assert.ok(r.date <= res.body.until); });
  const sum = res.body.invoices.reduce(function (s, r) { return s + r.total_gross; }, 0);
  assert.strictEqual(money.round2(sum), res.body.total_gross);
});
