const express = require('express');
const customers = require('../services/customers');
const invoices = require('../services/invoices');
const auth = require('../lib/auth');

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

router.post('/', function (req, res) {
  var body = req.body || {};
  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ error: 'Name fehlt' });
  }
  body.name = String(body.name).trim();
  if (body.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
    return res.status(400).json({ error: 'E-Mail ungültig' });
  }
  res.status(201).json(customers.create(req.accountId, body));
});

router.put('/:id', function (req, res) {
  var c = own(req, res);
  if (!c) return;
  var id = c.id;
  if (req.body.name !== undefined && !String(req.body.name).trim()) {
    return res.status(400).json({ error: 'Name fehlt' });
  }
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
