// payment reminders for overdue invoices. one reminder per invoice for now,
// the job (jobs/overdue.js) sends them, staff can send one by hand too
const db = require('../db');
const money = require('../lib/money');
const pricing = require('../lib/pricing');
const mailer = require('../lib/mailer');
const payments = require('./payments');
const links = require('./payment-links');

// Mahngebühr netto, 0 = keine (noch nicht mit den Kunden abgestimmt)
const FEE_NET = Number(process.env.REMINDER_FEE_NET || 0);

function dateDe(s) {
  return s ? s.slice(0, 10).split('-').reverse().join('.') : '';
}

// all overdue invoices, optional only one account
function overdueInvoices(accountId) {
  let sql = "SELECT i.*, c.name AS customer_name, c.email AS customer_email, c.contact_name AS customer_contact " +
    "FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.status = 'issued'";
  const args = [];
  if (accountId) {
    sql += ' AND i.account_id = ?';
    args.push(accountId);
  }
  const stmt = db.open().prepare(sql + ' ORDER BY i.due_date, i.id');
  return stmt.all.apply(stmt, args).filter(payments.isOverdue);
}

function lastReminder(invoiceId) {
  return db.open().prepare("SELECT * FROM outbox WHERE invoice_id = ? AND template = 'reminder' ORDER BY id DESC LIMIT 1").get(invoiceId);
}

function sendReminder(inv) {
  if (!inv.customer_email) throw Object.assign(new Error('Kunde hat keine E-Mail-Adresse'), { status: 400 });
  const account = db.open().prepare('SELECT name FROM accounts WHERE id = ?').get(inv.account_id) || {};
  const open = payments.openAmount(inv);
  const fee = FEE_NET ? money.round2(pricing.gross(FEE_NET, 19)) : 0;
  const link = links.create(inv, 14);
  return mailer.queue({
    account_id: inv.account_id,
    invoice_id: inv.id,
    template: 'reminder',
    to: inv.customer_email,
    vars: {
      greeting: mailer.greeting({ contact_name: inv.customer_contact }),
      number: inv.number,
      date: dateDe(inv.issue_date),
      due: dateDe(inv.due_date),
      amount: money.formatEuro(inv.total_gross),
      open: money.formatEuro(open + fee) + (fee ? ' (inkl. ' + money.formatEuro(fee) + ' Mahngebühr)' : ''),
      pay_line: '\nDirekt mit Karte bezahlen: ' + link.url + '\n',
      account: account.name
    }
  });
}

// for the job: every overdue invoice that got no reminder yet
function run(accountId) {
  const sent = [];
  overdueInvoices(accountId).forEach(inv => {
    if (lastReminder(inv.id)) return;
    if (!inv.customer_email) return;
    sendReminder(inv);
    sent.push({ invoice_id: inv.id, number: inv.number, email: inv.customer_email });
  });
  return sent;
}

module.exports = { overdueInvoices, lastReminder, sendReminder, run, FEE_NET };
