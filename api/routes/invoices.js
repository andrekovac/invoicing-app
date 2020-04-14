const express = require('express');
const invoices = require('../services/invoices');
const customers = require('../services/customers');
const pricing = require('../lib/pricing');
const money = require('../lib/money');
const pdf = require('../lib/pdf');
const db = require('../db');
const auth = require('../lib/auth');

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

// pdf stays above the login check: the admin page opens it in a new tab / download
// and that did not send the cookie in all browsers. TODO check again
router.get('/:id/pdf', function (req, res) {
  var inv = invoices.getById(Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'not found' });
  var account = db.open().prepare('SELECT * FROM accounts WHERE id = ?').get(inv.account_id);
  var name = (inv.number || 'entwurf-' + inv.id) + '.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + name + '"');
  res.send(pdf.invoicePdf(inv, account));
});

router.use(auth.requireLogin);

router.get('/', function (req, res) {
  res.json(invoices.list(req.accountId, {
    status: req.query.status,
    customer_id: req.query.customer_id,
    q: req.query.q
  }));
});

// totals for the form while typing
router.post('/preview', function (req, res) {
  var body = req.body || {};
  var err = checkItems(body.items || []);
  if (err) return res.status(400).json({ error: err });
  var vat = body.vat_rate !== undefined ? Number(body.vat_rate) : 0.19;
  var net = pricing.sumItems(body.items);
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
  if (!body.customer_id || !customers.findById(Number(body.customer_id))) {
    return res.status(400).json({ error: 'Kunde fehlt' });
  }
  var err = checkItems(body.items || []);
  if (err) return res.status(400).json({ error: err });
  if (body.vat_rate !== undefined && !pricing.isValidRate(Math.round(Number(body.vat_rate) * 100))) {
    return res.status(400).json({ error: 'Steuersatz ungültig' });
  }
  res.status(201).json(invoices.create(req.accountId, body));
});

router.put('/:id', function (req, res) {
  var id = Number(req.params.id);
  var inv = invoices.findById(id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  if (inv.status !== 'draft') return res.status(409).json({ error: 'gestellte Rechnungen können nicht geändert werden' });
  var body = req.body || {};
  if (body.items) {
    var err = checkItems(body.items);
    if (err) return res.status(400).json({ error: err });
  }
  res.json(invoices.update(id, body));
});

router.post('/:id/issue', function (req, res, next) {
  var id = Number(req.params.id);
  var inv = invoices.findById(id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  if (!invoices.itemsFor(id).length) return res.status(400).json({ error: 'Rechnung hat keine Positionen' });
  try {
    res.json(invoices.issue(id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/paid', function (req, res) {
  var id = Number(req.params.id);
  var inv = invoices.findById(id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  if (inv.status !== 'issued') return res.status(409).json({ error: 'nur gestellte Rechnungen können bezahlt werden' });
  res.json(invoices.setStatus(id, 'paid'));
});

router.post('/:id/cancel', function (req, res) {
  var id = Number(req.params.id);
  var inv = invoices.findById(id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  if (inv.status === 'cancelled') return res.status(409).json({ error: 'schon storniert' });
  res.json(invoices.setStatus(id, 'cancelled'));
});

router.delete('/:id', function (req, res) {
  var id = Number(req.params.id);
  var inv = invoices.findById(id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  if (inv.status !== 'draft') return res.status(409).json({ error: 'nur Entwürfe können gelöscht werden' });
  invoices.remove(id);
  res.status(204).end();
});

module.exports = router;
