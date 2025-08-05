const express = require('express');
const invoices = require('../services/invoices');
const customers = require('../services/customers');
const pricing = require('../lib/pricing');
const money = require('../lib/money');
const pdf = require('../lib/pdf');
const db = require('../db');
const auth = require('../lib/auth');
const utils = require('../lib/utils');
const payments = require('../services/payments');
const links = require('../services/payment-links');
const mailer = require('../lib/mailer');
const reminders = require('../services/reminders');
const invoiceNumber = require('../lib/invoice-number');
const validate = require('../lib/validate');
const flags = require('../lib/flags');
const recurring = require('../services/recurring');
const csv = require('../lib/csv');
const attachments = require('../services/attachments');

const router = express.Router();

// checks the items array from the admin form, returns error text or null
function checkItems(items) {
  if (!Array.isArray(items)) return 'items fehlen';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.description || !String(it.description).trim()) return 'Position ' + (i + 1) + ': Beschreibung fehlt';
    var q = Number(it.quantity);
    if (isNaN(q) || q <= 0) return 'Position ' + (i + 1) + ': Menge ungültig';
    var p = typeof it.unit_price === 'string' ? money.parseEuro(it.unit_price) : Number(it.unit_price);
    if (isNaN(p) || p < 0 || p > 100000) return 'Position ' + (i + 1) + ': Preis ungültig';
    it.unit_price = p;
    it.quantity = q;
  }
  return null;
}

function checkDiscount(d) {
  if (d === undefined || d === null || d === '') return true;
  var n = Number(d);
  return !isNaN(n) && n >= 0 && n <= 50;
}

// pdf stays above the login check so the old admin (/admin-old) can open pdfs:
// it opens them in a new tab / download and that did not send the cookie in all browsers.
// TODO check again when the new web app is done
router.get('/:id/pdf', function (req, res) {
  var inv = invoices.getById(Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'not found' });
  var account = db.open().prepare('SELECT * FROM accounts WHERE id = ?').get(inv.account_id);
  var name = inv.number || 'entwurf-' + inv.id;
  var layout = flags.isOn(inv.account_id, 'NEW_PDF_LAYOUT') ? 'new' : 'classic';
  // ?format=txt -> same lines as plain text, for pasting into mails
  if (req.query.format === 'txt') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(pdf.linesFor(inv, account, layout).join('\r\n') + '\r\n');
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', (req.query.download ? 'attachment' : 'inline') + '; filename="' + name + '.pdf"');
  res.send(pdf.invoicePdf(inv, account, layout));
});

router.use(auth.requireLogin);

// who did it, for the invoice history
router.use(function (req, res, next) {
  invoices.setActor(req.user.id);
  res.on('finish', function () { invoices.setActor(null); });
  next();
});

// invoice of the logged in account, else 404
function ownInvoice(req, res) {
  var inv = invoices.findById(Number(req.params.id));
  if (!inv || inv.account_id !== req.accountId) {
    res.status(404).json({ error: 'not found' });
    return null;
  }
  return inv;
}

var STATUSES = ['draft', 'issued', 'paid', 'cancelled'];
var MAX_PER_PAGE = 200;

// list with filters. paging only when page or per_page is given, the old admin
// and the customer page still load everything. X-Total-Count is always set
router.get('/', function (req, res) {
  var q = req.query;
  var opts = {
    status: q.status,
    customer_id: q.customer_id,
    q: q.q ? String(q.q).trim() : '',
    from: q.from,
    to: q.to,
    sort: q.sort,
    order: q.order
  };
  if (opts.status && STATUSES.indexOf(opts.status) === -1) return res.status(400).json({ error: 'Status ungültig' });
  if ((opts.from && !validate.isDate(opts.from)) || (opts.to && !validate.isDate(opts.to))) {
    return res.status(400).json({ error: 'Datum ungültig' });
  }
  if (opts.sort && !invoices.SORT[opts.sort]) return res.status(400).json({ error: 'Sortierung ungültig' });
  if (validate.oneOf(opts.order, ['asc', 'desc'], 'desc') === undefined) return res.status(400).json({ error: 'Sortierung ungültig' });

  var paged = q.page !== undefined || q.per_page !== undefined;
  var page = validate.int(q.page, { min: 1, def: 1 });
  var perPage = validate.int(q.per_page, { min: 1, max: MAX_PER_PAGE, def: 50 });
  if (isNaN(page) || isNaN(perPage)) return res.status(400).json({ error: 'page / per_page ungültig' });
  if (paged) {
    opts.limit = perPage;
    opts.offset = (page - 1) * perPage;
  }

  var total = invoices.count(req.accountId, opts);
  res.setHeader('X-Total-Count', String(total));
  if (paged) {
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Per-Page', String(perPage));
  }
  res.json(invoices.list(req.accountId, opts));
});

// the list as csv, same filters as GET / (no paging), for "Export" in the list
var LIST_CSV_HEAD = ['Nummer', 'Kunde', 'Datum', 'Fällig', 'Status', 'Netto', 'USt-Satz', 'USt', 'Brutto', 'Bezahlt', 'Offen'];
var STATUS_TEXT = { draft: 'Entwurf', issued: 'Gestellt', paid: 'Bezahlt', cancelled: 'Storniert' };

function csvNum(n) {
  return money.round2(n || 0).toFixed(2).replace('.', ',');
}

router.get('/export.csv', function (req, res) {
  var q = req.query;
  var opts = { status: q.status, customer_id: q.customer_id, q: q.q ? String(q.q).trim() : '', from: q.from, to: q.to, sort: q.sort, order: q.order };
  if (opts.status && STATUSES.indexOf(opts.status) === -1) return res.status(400).json({ error: 'Status ungültig' });
  if ((opts.from && !validate.isDate(opts.from)) || (opts.to && !validate.isDate(opts.to))) return res.status(400).json({ error: 'Datum ungültig' });
  if (opts.sort && !invoices.SORT[opts.sort]) return res.status(400).json({ error: 'Sortierung ungültig' });
  var rows = invoices.list(req.accountId, opts).map(function (inv) {
    var open = inv.status === 'issued' ? inv.total_gross - inv.paid_amount : 0;
    return [inv.number || '', inv.customer_name, inv.issue_date ? inv.issue_date.split('-').reverse().join('.') : '',
      inv.due_date ? inv.due_date.split('-').reverse().join('.') : '', STATUS_TEXT[inv.status] || inv.status,
      csvNum(inv.total_net), inv.tax_rate, csvNum(inv.total_tax), csvNum(inv.total_gross), csvNum(inv.paid_amount), csvNum(open)];
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rechnungen-liste.csv"');
  res.send('\ufeff' + csv.stringify([LIST_CSV_HEAD].concat(rows)));
});

router.get('/summary', function (req, res) {
  res.json(invoices.summary(req.accountId));
});

router.get('/years', function (req, res) {
  res.json(invoices.years(req.accountId));
});

// totals for the form while typing
router.post('/preview', function (req, res) {
  var body = req.body || {};
  var err = checkItems(body.items || []);
  if (err) return res.status(400).json({ error: err });
  var rate = invoices.rateFrom(body, 19);
  var net = pricing.sumItems(body.items);
  if (body.discount_percent) net = net - net * Number(body.discount_percent) / 100;
  var gross = money.round2(pricing.gross(net, rate));
  res.json({
    total_net: money.round2(net),
    total_tax: money.round2(gross - net),
    total_gross: gross
  });
});

// several invoices at once, from the list (checkboxes):
//   POST /bulk { action: 'issue' | 'paid' | 'cancel' | 'remind' | 'mail' | 'sent', ids: [1, 2, 3], paid_at?, via?, sent_at? }
// every invoice on its own, one failing does not stop the others.
// answer: { done: 2, failed: 1, results: [{ id, ok, error?, number? }] }
var BULK_ACTIONS = ['issue', 'paid', 'cancel', 'remind', 'mail', 'sent'];
var BULK_MAX = 100;

function bulkOne(req, action, id) {
  var inv = invoices.findById(id);
  if (!inv || inv.account_id !== req.accountId) return { id: id, ok: false, error: 'not found' };
  switch (action) {
    case 'issue':
      if (inv.status !== 'draft') return { id: id, ok: false, error: 'Rechnung ist schon gestellt' };
      if (!invoices.itemsFor(id).length) return { id: id, ok: false, error: 'Rechnung hat keine Positionen' };
      return { id: id, ok: true, number: invoices.issue(id).number };
    case 'paid': {
      if (inv.status !== 'issued') return { id: id, ok: false, error: 'nur gestellte Rechnungen können bezahlt werden' };
      var paidAt = req.body.paid_at || utils.today();
      var open = payments.openAmount(inv);
      if (open > 0) payments.recordPayment(inv, { amount: open, method: 'transfer', paid_at: paidAt, user_id: req.user.id });
      invoices.markPaid(id, paidAt);
      return { id: id, ok: true, number: inv.number };
    }
    case 'cancel':
      if (inv.status === 'cancelled') return { id: id, ok: false, error: 'schon storniert' };
      if (inv.status === 'paid') return { id: id, ok: false, error: 'bezahlte Rechnungen nicht stornieren' };
      invoices.setStatus(id, 'cancelled');
      return { id: id, ok: true, number: inv.number };
    case 'remind': {
      var overdue = reminders.overdueInvoices(req.accountId).find(function (i) { return i.id === id; });
      if (!overdue) return { id: id, ok: false, error: 'Rechnung ist nicht überfällig' };
      reminders.sendReminder(overdue);
      return { id: id, ok: true, number: inv.number };
    }
    case 'mail': {
      if (inv.status !== 'issued') return { id: id, ok: false, error: 'nur offene Rechnungen' };
      var full = invoices.getById(id);
      var cust = full.customer || {};
      if (!cust.email) return { id: id, ok: false, error: 'Kunde hat keine E-Mail-Adresse' };
      var acc = db.open().prepare('SELECT name FROM accounts WHERE id = ?').get(full.account_id) || {};
      mailer.queue({
        account_id: full.account_id,
        invoice_id: full.id,
        template: 'invoice',
        to: cust.email,
        vars: {
          greeting: mailer.greeting(cust),
          number: full.number,
          amount: money.formatEuro(full.total_gross),
          due: full.due_date ? full.due_date.split('-').reverse().join('.') : '',
          pay_line: '\nOder direkt mit Karte bezahlen: ' + links.create(full).url + '\n',
          account: acc.name
        }
      });
      if (!inv.sent_at) markSent(inv, 'mail', utils.today(), req.user.id);
      return { id: id, ok: true, number: inv.number };
    }
    case 'sent': {
      if (inv.status !== 'issued' && inv.status !== 'paid') return { id: id, ok: false, error: 'nur gestellte Rechnungen' };
      if (inv.sent_at) return { id: id, ok: true, number: inv.number, sent_at: inv.sent_at };
      var via = SENT_VIA.indexOf(req.body.via) !== -1 ? req.body.via : 'post';
      markSent(inv, via, req.body.sent_at || utils.today(), req.user.id);
      return { id: id, ok: true, number: inv.number };
    }
  }
}

router.post('/bulk', function (req, res, next) {
  var body = req.body || {};
  if (BULK_ACTIONS.indexOf(body.action) === -1) return res.status(400).json({ error: 'Aktion ungültig' });
  if (!Array.isArray(body.ids) || !body.ids.length) return res.status(400).json({ error: 'keine Rechnungen gewählt' });
  if (body.ids.length > BULK_MAX) return res.status(400).json({ error: 'höchstens ' + BULK_MAX + ' Rechnungen auf einmal' });
  if (body.paid_at && !utils.isDate(body.paid_at)) return res.status(400).json({ error: 'Datum ungültig' });
  if (body.sent_at && !utils.isDate(body.sent_at)) return res.status(400).json({ error: 'Datum ungültig' });
  var ids = [];
  for (var i = 0; i < body.ids.length; i++) {
    var n = validate.int(body.ids[i], { min: 1 });
    if (isNaN(n)) return res.status(400).json({ error: 'ids ungültig' });
    if (ids.indexOf(n) === -1) ids.push(n);
  }
  var results = [];
  try {
    ids.forEach(function (id) {
      try {
        results.push(bulkOne(req, body.action, id));
      } catch (err) {
        if (err.status && err.status < 500) results.push({ id: id, ok: false, error: err.message });
        else throw err;
      }
    });
  } catch (err) {
    return next(err);
  }
  var done = results.filter(function (r) { return r.ok; }).length;
  res.json({ done: done, failed: results.length - done, results: results });
});

// overdue invoices with the date of the last reminder
router.get('/overdue', function (req, res) {
  res.json(reminders.overdueInvoices(req.accountId).map(function (inv) {
    var last = reminders.lastReminder(inv.id);
    return {
      id: inv.id,
      number: inv.number,
      customer_name: inv.customer_name,
      customer_email: inv.customer_email,
      due_date: inv.due_date,
      total_gross: inv.total_gross,
      open: payments.openAmount(inv),
      reminded_at: last ? last.created_at : null
    };
  }));
});

// ---- recurring invoices (Serienrechnungen) ----
// GET    /recurring              list
// POST   /recurring              { template_invoice_id, start_date, interval_months?, day_of_month?, end_date?, ... }
// GET    /recurring/:rid         one, with the copies made so far and a preview of the next one
// PUT    /recurring/:rid         change interval, day, end, auto_issue, send_mail, title
// POST   /recurring/:rid/pause | /resume | /run
// DELETE /recurring/:rid         the copies stay, they only lose the link
function ownRecurring(req, res) {
  var rec = recurring.findById(Number(req.params.rid));
  if (!rec || rec.account_id !== req.accountId) {
    res.status(404).json({ error: 'not found' });
    return null;
  }
  return rec;
}

function checkRecurring(body, isNew) {
  var errors = [];
  if (isNew && !body.template_invoice_id) errors.push({ field: 'template_invoice_id', message: 'Vorlage fehlt' });
  if (isNew && !utils.isDate(body.start_date)) errors.push({ field: 'start_date', message: 'Startdatum fehlt oder ungültig' });
  if (body.end_date && !utils.isDate(body.end_date)) errors.push({ field: 'end_date', message: 'Enddatum ungültig' });
  if (body.end_date && body.start_date && body.end_date < body.start_date) errors.push({ field: 'end_date', message: 'Enddatum vor dem Start' });
  if (body.interval_months !== undefined && [1, 2, 3, 6, 12].indexOf(Number(body.interval_months)) === -1) {
    errors.push({ field: 'interval_months', message: 'Intervall: 1, 2, 3, 6 oder 12 Monate' });
  }
  if (body.day_of_month !== undefined) {
    var d = Number(body.day_of_month);
    if (!(d >= 1 && d <= 31) || Math.floor(d) !== d) errors.push({ field: 'day_of_month', message: 'Tag 1 bis 31' });
  }
  if (body.payment_days !== undefined) {
    var p = Number(body.payment_days);
    if (!(p >= 0 && p <= 90)) errors.push({ field: 'payment_days', message: 'Zahlungsziel 0 bis 90 Tage' });
  }
  return errors;
}

router.get('/recurring', function (req, res) {
  res.json(recurring.list(req.accountId));
});

router.post('/recurring', function (req, res, next) {
  var body = req.body || {};
  var errors = checkRecurring(body, true);
  if (errors.length) return res.status(400).json({ errors: errors });
  var template = invoices.findById(Number(body.template_invoice_id));
  if (!template || template.account_id !== req.accountId) return res.status(400).json({ errors: [{ field: 'template_invoice_id', message: 'Vorlage nicht gefunden' }] });
  if (template.status === 'cancelled') return res.status(400).json({ errors: [{ field: 'template_invoice_id', message: 'stornierte Rechnung als Vorlage' }] });
  try {
    res.status(201).json(recurring.create(req.accountId, body, req.user.id));
  } catch (err) {
    next(err);
  }
});

router.get('/recurring/:rid', function (req, res) {
  var rec = ownRecurring(req, res);
  if (!rec) return;
  rec.copies = recurring.copiesOf(rec.id);
  rec.next = recurring.preview(rec);
  res.json(rec);
});

router.put('/recurring/:rid', function (req, res) {
  var rec = ownRecurring(req, res);
  if (!rec) return;
  var body = req.body || {};
  var errors = checkRecurring(Object.assign({ start_date: rec.start_date }, body), false);
  if (errors.length) return res.status(400).json({ errors: errors });
  res.json(recurring.update(rec.id, body));
});

router.post('/recurring/:rid/pause', function (req, res) {
  var rec = ownRecurring(req, res);
  if (!rec) return;
  res.json(recurring.setActive(rec.id, false));
});

router.post('/recurring/:rid/resume', function (req, res) {
  var rec = ownRecurring(req, res);
  if (!rec) return;
  if (!rec.next_date) return res.status(409).json({ error: 'Serie ist abgelaufen' });
  res.json(recurring.setActive(rec.id, true));
});

// make the next copy now (e.g. the customer wants the invoice early)
router.post('/recurring/:rid/run', function (req, res, next) {
  var rec = ownRecurring(req, res);
  if (!rec) return;
  if (!rec.next_date) return res.status(409).json({ error: 'Serie ist abgelaufen' });
  try {
    res.status(201).json(recurring.runNow(rec.id));
  } catch (err) {
    next(err);
  }
});

router.delete('/recurring/:rid', function (req, res) {
  var rec = ownRecurring(req, res);
  if (!rec) return;
  recurring.remove(rec.id);
  res.status(204).end();
});

// ---- sent to the customer (versendet) ----
// the office prints some invoices and sends them by post, others go out with their own
// mail program. POST /:id/sent { via: 'mail' | 'post' | 'portal' | 'other', sent_at? }
var SENT_VIA = ['mail', 'post', 'portal', 'other'];

function markSent(inv, via, sentAt, userId) {
  var c = db.open();
  c.prepare('UPDATE invoices SET sent_at = ?, sent_via = ? WHERE id = ?').run(sentAt, via, inv.id);
  c.prepare('INSERT INTO invoice_events (invoice_id, account_id, type, data, user_id) VALUES (?, ?, ?, ?, ?)')
    .run(inv.id, inv.account_id, 'sent', JSON.stringify({ via: via, sent_at: sentAt }), userId || null);
}

router.post('/:id/sent', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  if (inv.status === 'draft') return res.status(409).json({ error: 'Entwürfe erst stellen, dann versenden' });
  if (inv.status === 'cancelled') return res.status(409).json({ error: 'Rechnung ist storniert' });
  var body = req.body || {};
  var via = body.via || 'post';
  if (SENT_VIA.indexOf(via) === -1) return res.status(400).json({ error: 'Versandart ungültig' });
  var sentAt = body.sent_at || utils.today();
  if (!utils.isDate(sentAt)) return res.status(400).json({ error: 'Datum ungültig' });
  if (sentAt > utils.today()) return res.status(400).json({ error: 'Datum liegt in der Zukunft' });
  if (inv.issue_date && sentAt < inv.issue_date) return res.status(400).json({ error: 'Datum vor dem Rechnungsdatum' });
  markSent(inv, via, sentAt, req.user.id);
  res.json(invoices.getById(inv.id));
});

// wrong click: not sent after all
router.delete('/:id/sent', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  if (!inv.sent_at) return res.status(409).json({ error: 'Rechnung ist nicht als versendet markiert' });
  var c = db.open();
  c.prepare('UPDATE invoices SET sent_at = NULL, sent_via = NULL WHERE id = ?').run(inv.id);
  c.prepare('INSERT INTO invoice_events (invoice_id, account_id, type, data, user_id) VALUES (?, ?, ?, ?, ?)')
    .run(inv.id, inv.account_id, 'sent_removed', JSON.stringify({ was: inv.sent_at }), req.user.id);
  res.json(invoices.getById(inv.id));
});

// issued, but not sent yet: for the "still to send" box on the start page
router.get('/not-sent', function (req, res) {
  res.json(db.open().prepare("SELECT i.id, i.number, i.issue_date, i.total_gross, c.name AS customer_name, c.email AS customer_email FROM invoices i " +
    "JOIN customers c ON c.id = i.customer_id WHERE i.account_id = ? AND i.status = 'issued' AND i.sent_at IS NULL " +
    "AND i.issue_date >= ? ORDER BY i.issue_date, i.id").all(req.accountId, utils.addDays(utils.today(), -60)));
});

// lookup by number, e.g. from the bank statement
router.get('/by-number/:number', function (req, res) {
  var number = invoiceNumber.normalize(req.params.number);
  if (!invoiceNumber.isValid(number)) {
    return res.status(400).json({ error: 'Ungültige Rechnungsnumer (erwartet RE-JJJJ-NNNN)' });
  }
  var inv = invoices.findByNumber(req.accountId, number);
  if (!inv) return res.status(404).json({ error: 'not found' });
  res.json(invoices.getById(inv.id));
});

router.get('/:id', function (req, res) {
  var inv = invoices.getById(Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'not found' });
  res.json(inv);
});

// history: created, updated, issued, paid, ...
router.get('/:id/events', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  res.json(invoices.events(inv.id));
});

// everything about one invoice in one list, newest first: history, payments, mails,
// card attempts (also the failed ones), attachments. for the "Verlauf" tab and for support
//   GET /:id/timeline?kinds=event,payment,mail,card,attachment
var TIMELINE_KINDS = ['event', 'payment', 'mail', 'card', 'attachment'];

function sqlDate(s) {
  // events and mails have 'YYYY-MM-DD HH:MM:SS', payments only the day
  return s && s.length === 10 ? s + ' 00:00:00' : s;
}

router.get('/:id/timeline', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  var kinds = TIMELINE_KINDS;
  if (req.query.kinds) {
    kinds = String(req.query.kinds).split(',').map(function (k) { return k.trim(); }).filter(Boolean);
    var wrong = kinds.filter(function (k) { return TIMELINE_KINDS.indexOf(k) === -1; });
    if (wrong.length) return res.status(400).json({ errors: wrong.map(function (k) { return { field: 'kinds', message: 'unbekannt: ' + k }; }) });
  }
  var c = db.open();
  var out = [];
  if (kinds.indexOf('event') !== -1) {
    invoices.events(inv.id).forEach(function (e) {
      out.push({ at: e.created_at, kind: 'event', type: e.type, user_name: e.user_name, data: e.data });
    });
  }
  if (kinds.indexOf('payment') !== -1) {
    c.prepare('SELECT p.*, u.name AS user_name FROM payments p LEFT JOIN users u ON u.id = p.created_by WHERE p.invoice_id = ? ORDER BY p.id')
      .all(inv.id).forEach(function (p) {
        out.push({ at: sqlDate(p.paid_at), kind: 'payment', type: p.method, user_name: p.user_name || null,
          data: { amount: p.amount, reference: p.reference, booked_at: p.created_at } });
      });
  }
  if (kinds.indexOf('mail') !== -1) {
    c.prepare('SELECT id, template, to_email, subject, created_at, sent_at FROM outbox WHERE invoice_id = ? ORDER BY id')
      .all(inv.id).forEach(function (m) {
        out.push({ at: m.created_at, kind: 'mail', type: m.template, user_name: null,
          data: { to: m.to_email, subject: m.subject, sent_at: m.sent_at } });
      });
  }
  if (kinds.indexOf('card') !== -1) {
    // invoice_ids is "12,13,14" (portal pays several at once)
    c.prepare("SELECT * FROM card_attempts WHERE account_id = ? AND (',' || invoice_ids || ',') LIKE ? ORDER BY id")
      .all(inv.account_id, '%,' + inv.id + ',%').forEach(function (a) {
        out.push({ at: a.created_at, kind: 'card', type: a.status, user_name: null,
          data: { amount: a.amount, error: a.error, invoices: a.invoice_ids.split(',').length } });
      });
  }
  if (kinds.indexOf('attachment') !== -1) {
    attachments.list(inv.id).forEach(function (a) {
      out.push({ at: a.created_at, kind: 'attachment', type: a.kind, user_name: a.uploaded_by_name || null,
        data: { id: a.id, filename: a.filename, size: a.size } });
    });
  }
  out.sort(function (a, b) {
    if (a.at === b.at) return 0;
    return a.at < b.at ? 1 : -1;
  });
  var limit = validate.int(req.query.limit, { min: 1, max: 500, def: 200 });
  if (isNaN(limit)) return res.status(400).json({ errors: [{ field: 'limit', message: '1 bis 500' }] });
  res.setHeader('X-Total-Count', String(out.length));
  res.json(out.slice(0, limit));
});

router.post('/', function (req, res) {
  var body = req.body || {};
  var cust = body.customer_id && customers.findById(Number(body.customer_id));
  if (!cust || cust.account_id !== req.accountId) {
    return res.status(400).json({ error: 'Kunde fehlt' });
  }
  var err = checkItems(body.items || []);
  if (err) return res.status(400).json({ error: err });
  if (!pricing.isValidRate(invoices.rateFrom(body, 19))) {
    return res.status(400).json({ error: 'Steuersatz ungültig' });
  }
  if (!checkDiscount(body.discount_percent)) return res.status(400).json({ error: 'Rabatt ungültig' });
  if ((body.issue_date && !utils.isDate(body.issue_date)) || (body.due_date && !utils.isDate(body.due_date))) {
    return res.status(400).json({ error: 'Datum ungültig' });
  }
  res.status(201).json(invoices.create(req.accountId, body));
});

router.put('/:id', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  var id = inv.id;
  if (inv.status === 'cancelled') return res.status(409).json({ error: 'stornierte Rechnungen können nicht geändert werden' });
  var body = req.body || {};
  if (inv.status !== 'draft' && body.items && body.items.length !== invoices.itemsFor(id).length) {
    return res.status(409).json({ error: 'bei gestellten Rechnungen nur Texte ändern, keine Positionen' });
  }
  if (body.items) {
    var err = checkItems(body.items);
    if (err) return res.status(400).json({ error: err });
  }
  if (!checkDiscount(body.discount_percent)) return res.status(400).json({ error: 'Rabatt ungültig' });
  res.json(invoices.update(id, body));
});

router.post('/:id/issue', function (req, res, next) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  var id = inv.id;
  if (!invoices.itemsFor(id).length) return res.status(400).json({ error: 'Rechnung hat keine Positionen' });
  try {
    res.json(invoices.issue(id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/paid', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  var id = inv.id;
  if (inv.status !== 'issued') return res.status(409).json({ error: 'nur gestellte Rechnungen können bezahlt werden' });
  var paidAt = req.body && req.body.paid_at;
  if (paidAt && !utils.isDate(paidAt)) return res.status(400).json({ error: 'Datum ungültig' });
  // rest as one transfer, so the payments add up
  var open = payments.openAmount(inv);
  if (open > 0) payments.recordPayment(inv, { amount: open, method: 'transfer', paid_at: paidAt, user_id: req.user.id });
  res.json(invoices.markPaid(id, paidAt));
});

// copy an invoice as a new draft, e.g. for the monthly maintenance invoices
router.post('/:id/copy', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  res.status(201).json(invoices.duplicate(inv.id));
});

// this invoice as template for a recurring invoice, starting next month
router.post('/:id/recurring', function (req, res, next) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  if (inv.status === 'cancelled') return res.status(409).json({ error: 'stornierte Rechnung als Vorlage' });
  var body = req.body || {};
  var day = body.day_of_month || Number(String(inv.issue_date || utils.today()).slice(8, 10)) || 1;
  var data = Object.assign({
    template_invoice_id: inv.id,
    start_date: recurring.addMonths(utils.today(), 1, 1),
    day_of_month: day
  }, body, { template_invoice_id: inv.id });
  var errors = checkRecurring(data, true);
  if (errors.length) return res.status(400).json({ errors: errors });
  try {
    res.status(201).json(recurring.create(req.accountId, data, req.user.id));
  } catch (err) {
    next(err);
  }
});

// ---- credit notes (Gutschrift / Stornorechnung) ----
// an issued invoice is never changed, a correction is a new invoice with negative amounts.
//   POST /:id/credit-note { reason, items?: [{ item_id, quantity }] }
// without items the whole invoice is credited. the credit note gets its own number, is
// 'paid' right away (settled against the original) and is booked on the original as a
// payment with method 'credit', so the open amount goes down.
// full credit of an invoice that is not paid at all: the original is cancelled as well
function creditedSoFar(inv) {
  return invoices.events(inv.id)
    .filter(function (e) { return e.type === 'credit_note' && e.data; })
    .reduce(function (sum, e) { return sum + (Number(e.data.amount) || 0); }, 0);
}

function creditItems(inv, wanted) {
  var items = invoices.itemsFor(inv.id);
  if (!wanted || !wanted.length) {
    return items.map(function (it) {
      return { description: it.description, quantity: -Number(it.quantity), unit_price: it.unit_price };
    });
  }
  var out = [];
  for (var i = 0; i < wanted.length; i++) {
    var w = wanted[i] || {};
    var it = items.find(function (x) { return x.id === Number(w.item_id); });
    if (!it) return 'Position ' + w.item_id + ' gehört nicht zur Rechnung';
    var q = w.quantity === undefined ? Number(it.quantity) : Number(String(w.quantity).replace(',', '.'));
    if (isNaN(q) || q <= 0 || q > Number(it.quantity)) return 'Menge für Position ' + it.position + ' ungültig (höchstens ' + it.quantity + ')';
    out.push({ description: it.description, quantity: -q, unit_price: it.unit_price });
  }
  return out;
}

router.post('/:id/credit-note', function (req, res, next) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  if (inv.status !== 'issued' && inv.status !== 'paid') return res.status(409).json({ error: 'nur gestellte oder bezahlte Rechnungen' });
  if (inv.total_gross < 0) return res.status(409).json({ error: 'Gutschrift zu einer Gutschrift geht nicht' });
  var body = req.body || {};
  var reason = String(body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Grund fehlt' });
  if (reason.length > 500) return res.status(400).json({ error: 'Grund zu lang' });
  var items = creditItems(inv, body.items);
  if (typeof items === 'string') return res.status(400).json({ error: items });

  var net = pricing.sumItems(items);
  if (inv.discount_percent) net = net * (1 - inv.discount_percent / 100);
  var totalGross = money.round2(pricing.gross(net, inv.tax_rate));
  var totalNet = money.round2(net);
  var already = creditedSoFar(inv);
  if (money.round2(-(already + totalGross)) > inv.total_gross) {
    return res.status(409).json({ error: 'mehr als der Rechnungsbetrag gutgeschrieben (bisher ' + money.formatEuro(already) + ')' });
  }

  var c = db.open();
  var today = utils.today();
  var creditId;
  c.exec('BEGIN');
  try {
    var info = c.prepare('INSERT INTO invoices (account_id, customer_id, status, issue_date, due_date, tax_rate, legacy_tax_rate, discount_percent, note, total_net, total_tax, total_gross) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(inv.account_id, inv.customer_id, 'draft', today, today, inv.tax_rate, inv.legacy_tax_rate, inv.discount_percent || 0,
        'Gutschrift zu ' + inv.number + ': ' + reason, totalNet, money.round2(totalGross - totalNet), totalGross);
    creditId = Number(info.lastInsertRowid);
    var stmt = c.prepare('INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)');
    items.forEach(function (it, i) {
      stmt.run(creditId, i + 1, it.description, it.quantity, it.unit_price);
    });
    c.prepare('INSERT INTO invoice_events (invoice_id, account_id, type, data, user_id) VALUES (?, ?, ?, ?, ?)')
      .run(creditId, inv.account_id, 'created', JSON.stringify({ credit_for: inv.number }), req.user.id);
    c.exec('COMMIT');
  } catch (err) {
    c.exec('ROLLBACK');
    return next(err);
  }

  try {
    var credit = invoices.issue(creditId);
    invoices.markPaid(creditId, today);
    c.prepare('INSERT INTO invoice_events (invoice_id, account_id, type, data, user_id) VALUES (?, ?, ?, ?, ?)')
      .run(inv.id, inv.account_id, 'credit_note', JSON.stringify({ number: credit.number, amount: totalGross, reason: reason }), req.user.id);
    var whole = !body.items || !body.items.length;
    var open = payments.openAmount(inv);
    if (inv.status === 'issued' && whole && open === inv.total_gross) {
      invoices.setStatus(inv.id, 'cancelled');
    } else if (inv.status === 'issued' && open > 0) {
      payments.recordPayment(inv, { amount: Math.min(-totalGross, open), method: 'credit', paid_at: today, reference: credit.number, user_id: req.user.id });
    }
    res.status(201).json(invoices.getById(creditId));
  } catch (err) {
    next(err);
  }
});

// credit notes of an invoice
router.get('/:id/credit-notes', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  var numbers = invoices.events(inv.id)
    .filter(function (e) { return e.type === 'credit_note' && e.data && e.data.number; })
    .map(function (e) { return e.data.number; });
  res.json(numbers.map(function (n) { return invoices.findByNumber(req.accountId, n); }).filter(Boolean));
});

// ---- attachments (Anhänge) ----
// GET    /:id/attachments              list, without the files
// POST   /:id/attachments              { filename, data (base64), kind? }
// GET    /:id/attachments/:aid         the file (?download=1 as attachment)
// PUT    /:id/attachments/:aid         { filename?, kind? }
// DELETE /:id/attachments/:aid
// works for every status: the delivery note often comes after the invoice went out
function ownAttachment(req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return null;
  var att = attachments.findById(Number(req.params.aid));
  if (!att || att.invoice_id !== inv.id) {
    res.status(404).json({ error: 'Anhang nicht gefunden' });
    return null;
  }
  return { inv: inv, att: att };
}

function decodeBase64(s) {
  if (typeof s !== 'string' || !s) return null;
  // data urls from the browser: data:application/pdf;base64,....
  var comma = s.indexOf(',');
  if (s.slice(0, 5) === 'data:' && comma !== -1) s = s.slice(comma + 1);
  s = s.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  return Buffer.from(s, 'base64');
}

router.get('/:id/attachments', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  res.json(attachments.list(inv.id));
});

router.post('/:id/attachments', function (req, res, next) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  var body = req.body || {};
  var filename = attachments.cleanName(body.filename);
  if (!filename) return res.status(400).json({ error: 'Dateiname fehlt' });
  var mime = attachments.mimeFor(filename);
  if (!mime) return res.status(400).json({ error: 'nur PDF, PNG, JPG, TXT oder CSV' });
  var kind = body.kind || 'other';
  if (attachments.KINDS.indexOf(kind) === -1) return res.status(400).json({ error: 'Art ungültig' });
  var data = decodeBase64(body.data);
  if (!data || !data.length) return res.status(400).json({ error: 'Datei fehlt oder ist kein base64' });
  if (data.length > attachments.MAX_SIZE) return res.status(413).json({ error: 'Datei zu groß (höchstens 700 KB)' });
  if (mime === 'application/pdf' && data.slice(0, 5).toString('latin1') !== '%PDF-') {
    return res.status(400).json({ error: 'Datei ist kein PDF' });
  }
  if (attachments.countFor(inv.id) >= attachments.MAX_PER_INVOICE) {
    return res.status(409).json({ error: 'höchstens ' + attachments.MAX_PER_INVOICE + ' Anhänge pro Rechnung' });
  }
  var same = attachments.findSame(inv.id, data);
  if (same) return res.status(200).json(attachments.findById(same.id));
  try {
    var att = attachments.add(inv, { filename: filename, mime: mime, kind: kind, data: data }, req.user.id);
    db.open().prepare('INSERT INTO invoice_events (invoice_id, account_id, type, data, user_id) VALUES (?, ?, ?, ?, ?)')
      .run(inv.id, inv.account_id, 'attachment', JSON.stringify({ filename: filename, size: att.size }), req.user.id);
    res.status(201).json(att);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/attachments/:aid', function (req, res) {
  var own = ownAttachment(req, res);
  if (!own) return;
  var file = attachments.content(own.att.id);
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('Content-Disposition', utils.contentDisposition(req.query.download ? 'attachment' : 'inline', file.filename));
  res.send(Buffer.from(file.data));
});

router.put('/:id/attachments/:aid', function (req, res) {
  var own = ownAttachment(req, res);
  if (!own) return;
  var body = req.body || {};
  var filename = body.filename !== undefined ? attachments.cleanName(body.filename) : null;
  if (body.filename !== undefined && !filename) return res.status(400).json({ error: 'Dateiname fehlt' });
  // the type comes from the ending, so the ending stays
  if (filename && attachments.mimeFor(filename) !== own.att.mime) return res.status(400).json({ error: 'Dateiendung darf sich nicht ändern' });
  if (body.kind !== undefined && attachments.KINDS.indexOf(body.kind) === -1) return res.status(400).json({ error: 'Art ungültig' });
  res.json(attachments.rename(own.att.id, filename, body.kind));
});

router.delete('/:id/attachments/:aid', function (req, res) {
  var own = ownAttachment(req, res);
  if (!own) return;
  attachments.remove(own.att.id);
  db.open().prepare('INSERT INTO invoice_events (invoice_id, account_id, type, data, user_id) VALUES (?, ?, ?, ?, ?)')
    .run(own.inv.id, own.inv.account_id, 'attachment_removed', JSON.stringify({ filename: own.att.filename }), req.user.id);
  res.status(204).end();
});

// text for the mail to the customer (the pdf is attached by hand)
router.get('/:id/mail', function (req, res) {
  if (!ownInvoice(req, res)) return;
  var inv = invoices.getById(Number(req.params.id));
  if (inv.status === 'draft') return res.status(409).json({ error: 'Rechnung ist noch ein Entwurf' });
  var account = db.open().prepare('SELECT * FROM accounts WHERE id = ?').get(inv.account_id) || {};
  var c = inv.customer || {};
  var greeting = c.contact_name ? 'Hallo ' + c.contact_name + ',' : 'Sehr geehrte Damen und Herren,';
  var due = inv.due_date ? inv.due_date.split('-').reverse().join('.') : '';
  var body = [
    greeting,
    '',
    'anbei erhalten Sie unsere Rechnung ' + inv.number + ' über ' + money.formatEuro(inv.total_gross) + '.',
    due ? 'Bitte überweisen Sie den Betrag bis zum ' + due + '.' : '',
    '',
    'Viele Grüße',
    account.name || ''
  ].join('\n');
  res.json({
    to: c.email || '',
    subject: 'Rechnung ' + inv.number + (account.name ? ' - ' + account.name : ''),
    body: body
  });
});

// reminder by hand (the job sends only the first one)
router.post('/:id/remind', function (req, res, next) {
  var own = ownInvoice(req, res);
  if (!own) return;
  var inv = reminders.overdueInvoices(req.accountId).find(function (i) { return i.id === own.id; });
  if (!inv) return res.status(409).json({ error: 'Rechnung ist nicht überfällig' });
  try {
    res.status(201).json(reminders.sendReminder(inv));
  } catch (err) {
    next(err);
  }
});

// send the invoice mail (outbox) with a payment link
router.post('/:id/mail', function (req, res) {
  if (!ownInvoice(req, res)) return;
  var inv = invoices.getById(Number(req.params.id));
  if (inv.status !== 'issued') return res.status(409).json({ error: 'nur offene Rechnungen' });
  var c = inv.customer || {};
  var to = (req.body && req.body.to) || c.email;
  if (!to) return res.status(400).json({ error: 'Kunde hat keine E-Mail-Adresse' });
  var account = db.open().prepare('SELECT * FROM accounts WHERE id = ?').get(inv.account_id) || {};
  var link = links.create(inv);
  var mail = mailer.queue({
    account_id: inv.account_id,
    invoice_id: inv.id,
    template: 'invoice',
    to: to,
    vars: {
      greeting: mailer.greeting(c),
      number: inv.number,
      amount: money.formatEuro(inv.total_gross),
      due: inv.due_date ? inv.due_date.split('-').reverse().join('.') : '',
      pay_line: '\nOder direkt mit Karte bezahlen: ' + link.url + '\n',
      account: account.name
    }
  });
  if (!inv.sent_at) markSent(inv, 'mail', utils.today(), req.user.id);
  res.status(201).json(mail);
});

// single items. the admin page sends all items with PUT, these are for scripts
function checkItem(it) {
  if (it.description !== undefined && !String(it.description).trim()) return 'Beschreibung fehlt';
  if (it.quantity !== undefined) {
    var q = Number(it.quantity);
    if (isNaN(q) || q <= 0 || q > 10000) return 'Menge ungültig';
  }
  if (it.unit_price !== undefined) {
    var p = money.parseEuro(it.unit_price);
    if (isNaN(p) || p < 0 || p >= 1000000) return 'Preis ungültig';
    it.unit_price = p;
  }
  return null;
}

function draftOr409(req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return null;
  if (inv.status !== 'draft') {
    res.status(409).json({ error: 'gestellte Rechnungen können nicht geändert werden' });
    return null;
  }
  return inv;
}

router.post('/:id/items', function (req, res) {
  var inv = draftOr409(req, res);
  if (!inv) return;
  var it = req.body || {};
  if (!it.description) return res.status(400).json({ error: 'Beschreibung fehlt' });
  if (it.quantity === undefined) it.quantity = 1;
  if (it.unit_price === undefined) return res.status(400).json({ error: 'Preis fehlt' });
  var err = checkItem(it);
  if (err) return res.status(400).json({ error: err });
  res.status(201).json(invoices.addItem(inv.id, it));
});

// positions pasted from a spreadsheet (Excel, LibreOffice) into a draft:
//   POST /:id/items/paste { text: "Flyer A5\t2\t69,90\nVersand\t1\t12,50", replace?: false }
// one line per position: description, quantity, unit price (tab or ;). a first line with
// "Beschreibung" / "Menge" is skipped. answer: the invoice, or { errors: [{ line, message }] }
var PASTE_MAX_LINES = 200;

function pasteNumber(s) {
  s = String(s || '').trim().replace(/\s*€$/, '').replace(/\s/g, '');
  if (!s) return NaN;
  // 1.234,56 (German) or 1234.56
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

function parsePasted(text) {
  var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
  var items = [];
  var errors = [];
  lines.forEach(function (line, i) {
    var cols = line.indexOf('\t') !== -1 ? line.split('\t') : line.split(';');
    if (i === 0 && /beschreibung|bezeichnung|menge/i.test(line)) return;
    if (cols.length < 3) return errors.push({ line: i + 1, message: 'drei Spalten erwartet: Beschreibung, Menge, Preis' });
    var description = cols[0].trim();
    var quantity = pasteNumber(cols[1]);
    var price = pasteNumber(cols[2]);
    if (!description) return errors.push({ line: i + 1, message: 'Beschreibung fehlt' });
    if (description.length > 500) return errors.push({ line: i + 1, message: 'Beschreibung zu lang' });
    if (isNaN(quantity) || quantity <= 0 || quantity > 99999) return errors.push({ line: i + 1, message: 'Menge ungültig' });
    if (isNaN(price) || price < 0 || price > 250000) return errors.push({ line: i + 1, message: 'Preis ungültig' });
    items.push({ description: description, quantity: quantity, unit_price: price });
  });
  return { items: items, errors: errors };
}

router.post('/:id/items/paste', function (req, res, next) {
  var inv = draftOr409(req, res);
  if (!inv) return;
  var body = req.body || {};
  if (!body.text || !String(body.text).trim()) return res.status(400).json({ errors: [{ line: 0, message: 'nichts eingefügt' }] });
  var parsed = parsePasted(body.text);
  if (parsed.errors.length) return res.status(400).json({ errors: parsed.errors });
  if (!parsed.items.length) return res.status(400).json({ errors: [{ line: 0, message: 'keine Positionen gefunden' }] });
  var keep = body.replace ? [] : invoices.itemsFor(inv.id).map(function (it) {
    return { description: it.description, quantity: it.quantity, unit_price: it.unit_price };
  });
  if (keep.length + parsed.items.length > PASTE_MAX_LINES) {
    return res.status(400).json({ errors: [{ line: 0, message: 'höchstens ' + PASTE_MAX_LINES + ' Positionen' }] });
  }
  try {
    res.json(invoices.update(inv.id, { items: keep.concat(parsed.items) }));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/items/:itemId', function (req, res) {
  var inv = draftOr409(req, res);
  if (!inv) return;
  var err = checkItem(req.body || {});
  if (err) return res.status(400).json({ error: err });
  var result = invoices.updateItem(inv.id, Number(req.params.itemId), req.body || {});
  if (!result) return res.status(404).json({ error: 'Position nicht gefunden' });
  res.json(result);
});

router.delete('/:id/items/:itemId', function (req, res) {
  var inv = draftOr409(req, res);
  if (!inv) return;
  var result = invoices.removeItem(inv.id, Number(req.params.itemId));
  if (!result) return res.status(404).json({ error: 'Position nicht gefunden' });
  res.json(result);
});

router.put('/:id/note', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  var id = inv.id;
  var note = req.body && req.body.note;
  if (note && String(note).length > 2000) return res.status(400).json({ error: 'Notiz zu lang' });
  res.json(invoices.setNote(id, note));
});

// payment extension (Zahlungsaufschub): new due date for an issued invoice, with a reason.
// a reminder already sent stays in the history, the job only looks at the new date
router.put('/:id/due-date', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  if (inv.status !== 'issued') return res.status(409).json({ error: 'nur bei offenen Rechnungen' });
  var body = req.body || {};
  if (!utils.isDate(body.due_date)) return res.status(400).json({ error: 'Datum ungültig' });
  if (inv.issue_date && body.due_date < inv.issue_date) return res.status(400).json({ error: 'Fällig vor dem Rechnungsdatum' });
  if (body.due_date > utils.addDays(inv.issue_date || utils.today(), 365)) return res.status(400).json({ error: 'höchstens ein Jahr nach dem Rechnungsdatum' });
  var reason = String(body.reason || '').trim();
  if (reason.length > 300) return res.status(400).json({ error: 'Grund zu lang' });
  if (body.due_date === inv.due_date) return res.json(invoices.getById(inv.id));
  var updated = invoices.update(inv.id, { due_date: body.due_date });
  db.open().prepare('INSERT INTO invoice_events (invoice_id, account_id, type, data, user_id) VALUES (?, ?, ?, ?, ?)')
    .run(inv.id, inv.account_id, 'due_date', JSON.stringify({ from: inv.due_date, to: body.due_date, reason: reason || null }), req.user.id);
  res.json(updated);
});

router.post('/:id/cancel', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  var id = inv.id;
  if (inv.status === 'cancelled') return res.status(409).json({ error: 'schon storniert' });
  res.json(invoices.setStatus(id, 'cancelled'));
});

router.delete('/:id', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  var id = inv.id;
  if (inv.status !== 'draft') return res.status(409).json({ error: 'nur Entwürfe können gelöscht werden' });
  invoices.remove(id);
  res.status(204).end();
});

module.exports = router;
