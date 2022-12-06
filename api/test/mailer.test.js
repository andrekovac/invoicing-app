process.env.APP_DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const mailer = require('../lib/mailer');

test.before(function () {
  db.open();
  db.open().prepare("INSERT INTO accounts (id, name) VALUES (1, 'Testfirma')").run();
});

test.after(function () {
  db.close();
});

test('queue writes to the outbox', function () {
  var mail = mailer.queue({
    account_id: 1,
    template: 'payment_received',
    to: 'kunde@example.com',
    vars: { greeting: 'Hallo,', amount: '119,00 €', number: 'RE-2022-0001', account: 'Testfirma' }
  });
  assert.strictEqual(mail.subject, 'Zahlung erhalten RE-2022-0001');
  assert.match(mail.body, /119,00 €/);
  assert.strictEqual(mailer.pending().length, 1);
  mailer.markSent(mail.id);
  assert.strictEqual(mailer.pending().length, 0);
});

test('greeting', function () {
  assert.strictEqual(mailer.greeting({ contact_name: 'Mia Schulz' }), 'Hallo Mia Schulz,');
  assert.strictEqual(mailer.greeting({}), 'Sehr geehrte Damen und Herren,');
});
