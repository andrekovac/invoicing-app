// shows the mails waiting in the outbox. with --mark they are marked as sent
// (until the mail service is set up, someone sends the important ones by hand)
//   node scripts/send-outbox.js [--mark] [--account 2]
const db = require('../db');
const mailer = require('../lib/mailer');

const args = process.argv.slice(2);
const mark = args.indexOf('--mark') !== -1;
const a = args.indexOf('--account');
const accountId = a !== -1 ? Number(args[a + 1]) : null;

db.open();
const mails = mailer.pending().filter(m => !accountId || m.account_id === accountId);
mails.forEach(m => {
  console.log('---- #' + m.id + ' ' + m.created_at + ' ' + m.template);
  console.log('To: ' + m.to_email);
  console.log('Subject: ' + m.subject);
  console.log('');
  console.log(m.body);
  console.log('');
  if (mark) mailer.markSent(m.id);
});
console.log('[outbox] ' + mails.length + ' mail(s)' + (mark ? ' marked as sent' : ' waiting'));
db.close();
