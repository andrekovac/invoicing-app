const express = require('express');
const customers = require('../services/customers');
const invoices = require('../services/invoices');
const auth = require('../lib/auth');

const router = express.Router();
router.use(auth.requireLogin);

router.get('/', function (req, res) {
  res.json(customers.list(req.accountId, req.query.q));
});

router.get('/:id', function (req, res) {
  var c = customers.findById(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

router.get('/:id/invoices', function (req, res) {
  var c = customers.findById(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(invoices.list(req.accountId, { customer_id: c.id }));
});

router.post('/', function (req, res) {
  var body = req.body || {};
  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ error: 'Name fehlt' });
  }
  body.name = String(body.name).trim();
  res.status(201).json(customers.create(req.accountId, body));
});

router.put('/:id', function (req, res) {
  var id = Number(req.params.id);
  if (!customers.findById(id)) return res.status(404).json({ error: 'not found' });
  if (req.body.name !== undefined && !String(req.body.name).trim()) {
    return res.status(400).json({ error: 'Name fehlt' });
  }
  res.json(customers.update(id, req.body || {}));
});

router.delete('/:id', function (req, res, next) {
  var id = Number(req.params.id);
  if (!customers.findById(id)) return res.status(404).json({ error: 'not found' });
  try {
    customers.remove(id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
