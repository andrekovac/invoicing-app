// recurring invoices ("Serienrechnungen"): every month (or every n months) a copy of a
// template invoice is made, issued and optionally mailed. the job in jobs/recurring.js runs
// runDue() once a day, POST /api/v1/invoices/recurring/:id/run makes the next copy now.
//
// in the item texts {monat}, {jahr} and {zeitraum} are replaced with the month of the copy:
//   "Wartung Website {monat} {jahr}" -> "Wartung Website März 2024"
const db = require('../db');
const money = require('../lib/money');
const pricing = require('../lib/pricing');
const utils = require('../lib/utils');
const mailer = require('../lib/mailer');
const invoices = require('./invoices');
const customers = require('./customers');
const links = require('./payment-links');
const log = require('../lib/logger')('recurring');

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MAX_COPIES_PER_RUN = 24;

function conn() {
  return db.open();
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// date in the month of `dateStr` + `months`, on `day` (31 -> last day of a short month)
function addMonths(dateStr, months, day) {
  var y = Number(dateStr.slice(0, 4));
  var m = Number(dateStr.slice(5, 7)) + months;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  var d = Math.min(day || Number(dateStr.slice(8, 10)), daysInMonth(y, m));
  return y + '-' + utils.pad(m, 2) + '-' + utils.pad(d, 2);
}

// first date on day_of_month that is not before start
function firstDate(start, day) {
  var same = addMonths(start, 0, day);
  return same >= start ? same : addMonths(start, 1, day);
}

function fillText(text, runDate, intervalMonths) {
  var y = Number(runDate.slice(0, 4));
  var m = Number(runDate.slice(5, 7));
  var period = MONTH_NAMES[m - 1] + ' ' + y;
  if (intervalMonths > 1) {
    var last = addMonths(runDate, intervalMonths - 1, 1);
    period = MONTH_NAMES[m - 1] + ' bis ' + MONTH_NAMES[Number(last.slice(5, 7)) - 1] + ' ' + last.slice(0, 4);
  }
  return String(text || '')
    .replace(/\{monat\}/gi, MONTH_NAMES[m - 1])
    .replace(/\{jahr\}/gi, String(y))
    .replace(/\{zeitraum\}/gi, period);
}

function findById(id) {
  return conn().prepare('SELECT * FROM recurring_invoices WHERE id = ?').get(id);
}

function list(accountId) {
  return conn().prepare('SELECT r.*, c.name AS customer_name, t.number AS template_number, ' +
    '(SELECT count(*) FROM invoices i WHERE i.recurring_id = r.id) AS copies ' +
    'FROM recurring_invoices r JOIN customers c ON c.id = r.customer_id LEFT JOIN invoices t ON t.id = r.template_invoice_id ' +
    'WHERE r.account_id = ? ORDER BY r.active DESC, r.next_date, r.id').all(accountId);
}

function copiesOf(id) {
  return conn().prepare('SELECT id, number, status, issue_date, due_date, tax_rate, total_gross FROM invoices WHERE recurring_id = ? ORDER BY issue_date, id').all(id);
}

function create(accountId, data, userId) {
  var template = invoices.findById(Number(data.template_invoice_id));
  if (!template || template.account_id !== accountId) {
    var err = new Error('Vorlage nicht gefunden');
    err.status = 400;
    throw err;
  }
  var day = Number(data.day_of_month) || Number(String(data.start_date).slice(8, 10)) || 1;
  var interval = Number(data.interval_months) || 1;
  var info = conn().prepare('INSERT INTO recurring_invoices (account_id, customer_id, template_invoice_id, title, interval_months, day_of_month, payment_days, start_date, end_date, next_date, auto_issue, send_mail, created_by) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(accountId, template.customer_id, template.id, data.title || null, interval, day,
      data.payment_days !== undefined ? Number(data.payment_days) : 14,
      data.start_date, data.end_date || null, firstDate(data.start_date, day),
      data.auto_issue === false ? 0 : 1, data.send_mail ? 1 : 0, userId || null);
  return findById(Number(info.lastInsertRowid));
}

var EDITABLE = ['title', 'interval_months', 'day_of_month', 'payment_days', 'end_date', 'auto_issue', 'send_mail'];

function update(id, data) {
  var rec = findById(id);
  if (!rec) return null;
  var sets = [];
  var vals = [];
  EDITABLE.forEach(function (f) {
    if (data[f] === undefined) return;
    var v = data[f];
    if (f === 'auto_issue' || f === 'send_mail') v = v ? 1 : 0;
    sets.push(f + ' = ?');
    vals.push(v === '' ? null : v);
  });
  if (sets.length) {
    vals.push(id);
    var stmt = conn().prepare('UPDATE recurring_invoices SET ' + sets.join(', ') + ' WHERE id = ?');
    stmt.run.apply(stmt, vals);
  }
  // day changed: next copy on the new day, same month
  if (data.day_of_month !== undefined && rec.next_date) {
    conn().prepare('UPDATE recurring_invoices SET next_date = ? WHERE id = ?').run(addMonths(rec.next_date, 0, Number(data.day_of_month)), id);
  }
  return findById(id);
}

function setActive(id, active) {
  var rec = findById(id);
  if (!rec) return null;
  var next = rec.next_date;
  // resume: no copies for the months in between
  if (active && !rec.active && next && next < utils.today()) {
    next = firstDate(utils.today(), rec.day_of_month);
  }
  conn().prepare('UPDATE recurring_invoices SET active = ?, next_date = ? WHERE id = ?').run(active ? 1 : 0, next, id);
  return findById(id);
}

function remove(id) {
  conn().prepare('UPDATE invoices SET recurring_id = NULL WHERE recurring_id = ?').run(id);
  conn().prepare('DELETE FROM recurring_invoices WHERE id = ?').run(id);
}

// what the next copy will look like (for the form)
function preview(rec) {
  var template = rec.template_invoice_id && invoices.getById(rec.template_invoice_id);
  if (!template) return null;
  var customer = customers.findById(rec.customer_id) || {};
  var taxRate = customer.default_tax_rate ?? 19;
  var runDate = rec.next_date || firstDate(rec.start_date, rec.day_of_month);
  var net = pricing.sumItems(template.items);
  if (template.discount_percent) net = net * (1 - template.discount_percent / 100);
  return {
    date: runDate,
    tax_rate: taxRate,
    items: template.items.map(function (it) {
      return { description: fillText(it.description, runDate, rec.interval_months), quantity: it.quantity, unit_price: it.unit_price };
    }),
    total_net: money.round2(net),
    total_gross: money.round2(pricing.gross(net, taxRate))
  };
}

// one copy of the template for `runDate`. same items, prices and discount as the template
function copyFor(rec, runDate) {
  var template = invoices.getById(rec.template_invoice_id);
  if (!template) {
    var err = new Error('Vorlage gelöscht');
    err.status = 409;
    throw err;
  }
  var customer = customers.findById(template.customer_id);
  var c = conn();
  var items = template.items.map(function (it) {
    return { description: fillText(it.description, runDate, rec.interval_months), quantity: it.quantity, unit_price: it.unit_price };
  });
  var taxRate = customer.default_tax_rate ?? 19;
  var discount = template.discount_percent || 0;
  var net = pricing.sumItems(items);
  if (discount) net = net * (1 - discount / 100);
  var totalGross = money.round2(pricing.gross(net, taxRate));
  var totalNet = money.round2(net);
  var dueDate = utils.addDays(runDate, rec.payment_days);

  c.exec('BEGIN');
  var id;
  try {
    var info = c.prepare('INSERT INTO invoices (account_id, customer_id, status, issue_date, due_date, tax_rate, legacy_tax_rate, discount_percent, note, total_net, total_tax, total_gross, recurring_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(template.account_id, template.customer_id, 'draft', runDate, dueDate, taxRate, template.legacy_tax_rate, discount,
        template.note, totalNet, money.round2(totalGross - totalNet), totalGross, rec.id);
    id = Number(info.lastInsertRowid);
    var stmt = c.prepare('INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)');
    items.forEach(function (it, i) {
      stmt.run(id, i + 1, it.description, it.quantity, it.unit_price);
    });
    c.prepare('INSERT INTO invoice_events (invoice_id, account_id, type, data) VALUES (?, ?, ?, ?)')
      .run(id, template.account_id, 'created', JSON.stringify({ recurring_from: rec.id, template: template.number || template.id }));
    c.exec('COMMIT');
  } catch (e) {
    c.exec('ROLLBACK');
    throw e;
  }

  var inv = rec.auto_issue ? invoices.issue(id) : invoices.getById(id);
  if (rec.auto_issue && rec.send_mail && customer.email) {
    var account = c.prepare('SELECT name FROM accounts WHERE id = ?').get(inv.account_id) || {};
    mailer.queue({
      account_id: inv.account_id,
      invoice_id: inv.id,
      template: 'invoice',
      to: customer.email,
      vars: {
        greeting: mailer.greeting(customer),
        number: inv.number,
        amount: money.formatEuro(inv.total_gross),
        due: inv.due_date.split('-').reverse().join('.'),
        pay_line: '\nOder direkt mit Karte bezahlen: ' + links.create(inv).url + '\n',
        account: account.name
      }
    });
  }
  return inv;
}

// all copies that are due until `until` (default today). accountId null = all accounts
function runDue(accountId, until) {
  until = until || utils.today();
  var sql = 'SELECT * FROM recurring_invoices WHERE active = 1 AND next_date IS NOT NULL AND next_date <= ?';
  var args = [until];
  if (accountId) {
    sql += ' AND account_id = ?';
    args.push(accountId);
  }
  var stmt = conn().prepare(sql);
  var created = [];
  stmt.all.apply(stmt, args).forEach(function (rec) {
    var next = rec.next_date;
    var n = 0;
    while (next && next <= until && n < MAX_COPIES_PER_RUN) {
      if (rec.end_date && next > rec.end_date) {
        next = null;
        break;
      }
      try {
        var inv = copyFor(rec, next);
        created.push({ recurring_id: rec.id, invoice_id: inv.id, number: inv.number, date: next });
      } catch (err) {
        log.error('copy failed', { recurring: rec.id, date: next, error: err.message });
        break;
      }
      next = addMonths(next, rec.interval_months, rec.day_of_month);
      n++;
    }
    if (next && rec.end_date && next > rec.end_date) next = null;
    conn().prepare('UPDATE recurring_invoices SET next_date = ?, last_run_at = ?, active = ? WHERE id = ?')
      .run(next, new Date().toISOString(), next ? 1 : 0, rec.id);
  });
  return created;
}

// "run now": the next copy right away, no matter the date
function runNow(id) {
  var rec = findById(id);
  if (!rec || !rec.next_date) return null;
  var inv = copyFor(rec, rec.next_date);
  var next = addMonths(rec.next_date, rec.interval_months, rec.day_of_month);
  if (rec.end_date && next > rec.end_date) next = null;
  conn().prepare('UPDATE recurring_invoices SET next_date = ?, last_run_at = ?, active = ? WHERE id = ?')
    .run(next, new Date().toISOString(), next ? rec.active : 0, rec.id);
  return inv;
}

module.exports = {
  MONTH_NAMES: MONTH_NAMES,
  addMonths: addMonths,
  firstDate: firstDate,
  fillText: fillText,
  findById: findById,
  list: list,
  copiesOf: copiesOf,
  create: create,
  update: update,
  setActive: setActive,
  remove: remove,
  preview: preview,
  copyFor: copyFor,
  runDue: runDue,
  runNow: runNow
};
