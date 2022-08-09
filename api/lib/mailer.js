// mails go into the outbox table (and the log). sending is done outside of the api.
const db = require('../db');

const QUIET = process.env.APP_DB_FILE === ':memory:';

// {{name}} is replaced. keep the texts short, customers read them on the phone
const TEMPLATES = {
  invoice: {
    subject: 'Rechnung {{number}} - {{account}}',
    body: '{{greeting}}\n\nanbei erhalten Sie unsere Rechnung {{number}} über {{amount}}.\n' +
      'Bitte überweisen Sie den Betrag bis zum {{due}}.\n{{pay_line}}\nViele Grüße\n{{account}}'
  },
  reminder: {
    subject: 'Zahlungserinnerung {{number}} - {{account}}',
    body: '{{greeting}}\n\nunsere Rechnung {{number}} vom {{date}} über {{amount}} war am {{due}} fällig.\n' +
      'Sicher haben Sie das nur übersehen. Bitte überweisen Sie den offenen Betrag von {{open}}.\n{{pay_line}}\n' +
      'Falls Sie schon bezahlt haben, ist diese Mail gegenstandslos.\n\nViele Grüße\n{{account}}'
  },
  payment_reminder: {
    subject: '2. Mahnung {{number}} - {{account}}',
    body: '{{greeting}}\n\nauf unsere Zahlungserinnerung zur Rechnung {{number}} haben wir noch keinen Eingang gesehen.\n' +
      'Bitte überweisen Sie {{open}} innerhalb von 7 Tagen.\n{{pay_line}}\nViele Grüße\n{{account}}'
  },
  payment_received: {
    subject: 'Zahlung erhalten {{number}}',
    body: '{{greeting}}\n\nvielen Dank, wir haben {{amount}} für {{number}} erhalten.\n\nViele Grüße\n{{account}}'
  },
  portal_link: {
    subject: 'Ihre offenen Rechnungen bei {{account}}',
    body: '{{greeting}}\n\nhier sehen Sie alle offenen Rechnungen und können sie direkt bezahlen:\n{{url}}\n\nViele Grüße\n{{account}}'
  }
};

function render(text, vars) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

function greeting(customer) {
  return customer && customer.contact_name ? 'Hallo ' + customer.contact_name + ',' : 'Sehr geehrte Damen und Herren,';
}

function queue(mail) {
  const tpl = TEMPLATES[mail.template];
  if (!tpl) throw new Error('unknown mail template ' + mail.template);
  if (!mail.to) throw Object.assign(new Error('keine E-Mail-Adresse'), { status: 400 });
  const vars = mail.vars || {};
  const subject = render(tpl.subject, vars);
  const body = render(tpl.body, vars);
  const info = db.open().prepare('INSERT INTO outbox (account_id, invoice_id, template, to_email, subject, body) VALUES (?, ?, ?, ?, ?, ?)')
    .run(mail.account_id, mail.invoice_id || null, mail.template, mail.to, subject, body);
  if (!QUIET) console.log('[mail] ' + mail.template + ' to ' + mail.to + ' "' + subject + '"');
  return { id: Number(info.lastInsertRowid), to: mail.to, subject: subject, body: body };
}

function list(accountId, limit) {
  return db.open().prepare('SELECT * FROM outbox WHERE account_id = ? ORDER BY id DESC LIMIT ?').all(accountId, limit || 100);
}

function pending() {
  return db.open().prepare('SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY id').all();
}

function markSent(id) {
  db.open().prepare("UPDATE outbox SET sent_at = datetime('now') WHERE id = ?").run(id);
}

module.exports = { TEMPLATES, render, greeting, queue, list, pending, markSent };
