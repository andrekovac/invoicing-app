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
//   POST /bulk { action: 'issue' | 'paid' | 'cancel' | 'remind', ids: [1, 2, 3], paid_at? }
// every invoice on its own, one failing does not stop the others.
// answer: { done: 2, failed: 1, results: [{ id, ok, error?, number? }] }
var BULK_ACTIONS = ['issue', 'paid', 'cancel', 'remind', 'mail'];
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
