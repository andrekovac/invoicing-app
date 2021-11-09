const express = require('express');
const invoices = require('../services/invoices');
const customers = require('../services/customers');
const pricing = require('../lib/pricing');
const money = require('../lib/money');
const pdf = require('../lib/pdf');
const db = require('../db');
const auth = require('../lib/auth');
const utils = require('../lib/utils');

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
  // ?format=txt -> same lines as plain text, for pasting into mails
  if (req.query.format === 'txt') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(pdf.invoiceLines(inv, account).join('\r\n') + '\r\n');
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', (req.query.download ? 'attachment' : 'inline') + '; filename="' + name + '.pdf"');
  res.send(pdf.invoicePdf(inv, account));
});

router.use(auth.requireLogin);

// invoice of the logged in account, else 404
function ownInvoice(req, res) {
  var inv = invoices.findById(Number(req.params.id));
  if (!inv || inv.account_id !== req.accountId) {
    res.status(404).json({ error: 'not found' });
    return null;
  }
  return inv;
}

router.get('/', function (req, res) {
  res.json(invoices.list(req.accountId, {
    status: req.query.status,
    customer_id: req.query.customer_id,
    q: req.query.q
  }));
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
  var vat = body.vat_rate !== undefined ? Number(body.vat_rate) : 0.19;
  var net = pricing.sumItems(body.items);
  if (body.discount_percent) net = net - net * Number(body.discount_percent) / 100;
  var gross = money.round2(pricing.gross(net, vat * 100));
  res.json({
    total_net: money.round2(net),
    total_tax: money.round2(gross - net),
    total_gross: gross
  });
});

// lookup by number, e.g. from the bank statement
router.get('/by-number/:number', function (req, res) {
  var inv = invoices.findByNumber(req.accountId, req.params.number);
  if (!inv) return res.status(404).json({ error: 'not found' });
  res.json(invoices.getById(inv.id));
});

router.get('/:id', function (req, res) {
  var inv = invoices.getById(Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'not found' });
  res.json(inv);
});

router.post('/', function (req, res) {
  var body = req.body || {};
  var cust = body.customer_id && customers.findById(Number(body.customer_id));
  if (!cust || cust.account_id !== req.accountId) {
    return res.status(400).json({ error: 'Kunde fehlt' });
  }
  var err = checkItems(body.items || []);
  if (err) return res.status(400).json({ error: err });
  if (body.vat_rate !== undefined && !pricing.isValidRate(Math.round(Number(body.vat_rate) * 100))) {
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
  res.json(invoices.markPaid(id, paidAt));
});

// copy an invoice as a new draft, e.g. for the monthly maintenance invoices
router.post('/:id/copy', function (req, res) {
  var inv = ownInvoice(req, res);
  if (!inv) return;
  res.status(201).json(invoices.duplicate(inv.id));
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
