const express = require('express');
const customers = require('../services/customers');
const invoices = require('../services/invoices');
const auth = require('../lib/auth');
const pricing = require('../lib/pricing');
const mailer = require('../lib/mailer');
const links = require('../services/payment-links');
const db = require('../db');
const validate = require('../lib/validate');

const router = express.Router();
router.use(auth.requireLogin);

// customer of the logged in account or 404 (never say that it exists elsewhere)
function own(req, res) {
  var c = customers.findById(Number(req.params.id));
  if (!c || c.account_id !== req.accountId) {
    res.status(404).json({ error: 'not found' });
    return null;
  }
  return c;
}

// default tax rate: empty = none (then the invoice form uses 19 %)
function checkTaxRate(body) {
  if (body.default_tax_rate === undefined) return true;
  if (body.default_tax_rate === '' || body.default_tax_rate === null) {
    body.default_tax_rate = null;
    return true;
  }
  body.default_tax_rate = Number(body.default_tax_rate);
  return pricing.isValidRate(body.default_tax_rate);
}

router.get('/', function (req, res) {
  res.json(customers.list(req.accountId, req.query.q));
});

router.get('/:id', function (req, res) {
  var c = own(req, res);
  if (!c) return;
  res.json(c);
});

router.get('/:id/invoices', function (req, res) {
  var c = own(req, res);
  if (!c) return;
  res.json(invoices.list(req.accountId, { customer_id: c.id }));
});

// mail with the portal link: the customer sees and pays all open invoices
router.post('/:id/portal-mail', function (req, res) {
  var c = own(req, res);
  if (!c) return;
  if (!c.email) return res.status(400).json({ error: 'Kunde hat keine E-Mail-Adresse' });
  var account = db.open().prepare('SELECT name FROM accounts WHERE id = ?').get(req.accountId) || {};
  var link = links.createPortal(c);
  res.status(201).json(mailer.queue({
    account_id: req.accountId,
    template: 'portal_link',
    to: c.email,
    vars: { greeting: mailer.greeting(c), url: link.url, account: account.name }
  }));
});

router.post('/', function (req, res) {
  var body = req.body || {};
  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ error: 'Name fehlt' });
  }
  body.name = String(body.name).trim();
  if (body.email && !validate.isEmail(body.email)) {
    return res.status(400).json({ error: 'E-Mail ungültig' });
  }
  if (!checkTaxRate(body)) return res.status(400).json({ error: 'Steuersatz ungültig' });
  if (body.country) body.country = String(body.country).trim();
  res.status(201).json(customers.create(req.accountId, body));
});

router.put('/:id', function (req, res) {
  var c = own(req, res);
  if (!c) return;
  var id = c.id;
  if (req.body.name !== undefined && !String(req.body.name).trim()) {
    return res.status(400).json({ error: 'Name fehlt' });
  }
  if (req.body.email && !validate.isEmail(req.body.email)) {
    return res.status(400).json({ error: 'E-Mail ungültig' });
  }
  if (!checkTaxRate(req.body)) return res.status(400).json({ error: 'Steuersatz ungültig' });
  res.json(customers.update(id, req.body || {}));
});

router.delete('/:id', function (req, res, next) {
  var c = own(req, res);
  if (!c) return;
  try {
    customers.remove(c.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
