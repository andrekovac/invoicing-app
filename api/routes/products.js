const express = require('express');
const auth = require('../lib/auth');
const products = require('../services/products');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

const router = express.Router();
router.use(auth.requireLogin);

function own(req, res) {
  var p = products.findById(Number(req.params.id));
  if (!p || p.account_id !== req.accountId) {
    res.status(404).json({ error: 'not found' });
    return null;
  }
  return p;
}

// returns a list of problems, empty = ok
function check(body, isNew) {
  var errors = [];
  if (isNew || body.sku !== undefined) {
    if (!body.sku || !/^[A-Za-z0-9._-]{1,32}$/.test(String(body.sku).trim())) errors.push({ field: 'sku', message: 'Artikelnummer: Buchstaben, Ziffern, . _ -' });
  }
  if ((isNew || body.name !== undefined) && (!body.name || !String(body.name).trim())) errors.push({ field: 'name', message: 'Bezeichnung fehlt' });
  if (isNew || body.unit_price !== undefined) {
    var p = money.parseEuro(body.unit_price);
    if (isNaN(p) || p < 0) errors.push({ field: 'unit_price', message: 'Preis ungültig' });
    else body.unit_price = p;
  }
  if (body.tax_rate !== undefined && !pricing.isValidRate(body.tax_rate)) errors.push({ field: 'tax_rate', message: 'Steuersatz ungültig' });
  return errors;
}

router.get('/', function (req, res) {
  res.json(products.list(req.accountId, { q: req.query.q, all: req.query.all === '1' }));
});

router.get('/:id', function (req, res) {
  var p = own(req, res);
  if (p) res.json(p);
});

router.post('/', function (req, res) {
  var body = req.body || {};
  var errors = check(body, true);
  if (errors.length) return res.status(400).json({ errors: errors });
  if (products.findBySku(req.accountId, String(body.sku).trim())) return res.status(409).json({ errors: [{ field: 'sku', message: 'Artikelnummer gibt es schon' }] });
  res.status(201).json(products.create(req.accountId, body));
});

// { csv: "Artikelnummer;Bezeichnung;Einheit;Preis;USt\n..." }
router.post('/import', function (req, res) {
  var text = (req.body || {}).csv;
  if (!text || typeof text !== 'string') return res.status(400).json({ errors: [{ field: 'csv', message: 'csv fehlt' }] });
  res.json(products.importCsv(req.accountId, text));
});

router.put('/:id', function (req, res) {
  var p = own(req, res);
  if (!p) return;
  var body = req.body || {};
  var errors = check(body, false);
  if (errors.length) return res.status(400).json({ errors: errors });
  if (body.sku && body.sku !== p.sku && products.findBySku(req.accountId, String(body.sku).trim())) {
    return res.status(409).json({ errors: [{ field: 'sku', message: 'Artikelnummer gibt es schon' }] });
  }
  res.json(products.update(p.id, body));
});

router.delete('/:id', function (req, res) {
  var p = own(req, res);
  if (!p) return;
  var what = products.remove(req.accountId, p.id);
  if (what === 'archived') return res.json({ archived: true, product: products.findById(p.id) });
  res.status(204).end();
});

module.exports = router;
