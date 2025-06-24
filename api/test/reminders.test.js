// reminders for overdue invoices + the job
process.env.APP_DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const payments = require('../services/payments');
const reminders = require('../services/reminders');
const mailer = require('../lib/mailer');
const utils = require('../lib/utils');

test.before(function () {
  db.open();
  require('../seed/seed').seed();
});

test.after(function () {
  db.close();
});

test('overdue', function () {
  assert.strictEqual(payments.isOverdue({ status: 'issued', due_date: utils.addDays(utils.today(), -3) }), true);
  assert.strictEqual(payments.isOverdue({ status: 'issued', due_date: utils.addDays(utils.today(), 10) }), false);
  assert.strictEqual(payments.isOverdue({ status: 'paid', due_date: '2020-01-01' }), false);
});

test('overdue list of the agency', function () {
  var list = reminders.overdueInvoices(1);
  assert.ok(list.length >= 1);
  assert.ok(list.some(function (i) { return i.customer_email === 'mia.schulz@example.com'; }));
});

test('job writes one reminder per invoice', function () {
  var sent = reminders.run(1);
  assert.ok(sent.length >= 1);
  var mail = mailer.list(1)[0];
  assert.strictEqual(mail.template, 'reminder');
  assert.match(mail.subject, /^Zahlungserinnerung RE-/);
  assert.deepStrictEqual(reminders.run(1), []);
});

test('templates', function () {
  assert.ok(mailer.TEMPLATES.payment_reminder);
  assert.strictEqual(mailer.render('Hallo {{name}}', { name: 'Mia' }), 'Hallo Mia');
});

// the second step (payment_reminder, with fee) is only a template so far, run() sends the
// first reminder once. turn this on when the job does the second step
test.skip('second reminder 14 days after the first one', function () {
  var inv = reminders.overdueInvoices(1)[0];
  db.open().prepare("UPDATE outbox SET created_at = datetime('now', '-15 days') WHERE invoice_id = ?").run(inv.id);
  var sent = reminders.run(1);
  assert.ok(sent.some(function (s) { return s.number === inv.number; }));
  var mail = mailer.list(1).find(function (m) { return m.invoice_id === inv.id && m.template === 'payment_reminder'; });
  assert.ok(mail);
});
