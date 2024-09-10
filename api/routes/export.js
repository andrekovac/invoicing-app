// downloads for the tax advisor. GET /api/v1/export/<what>?from=YYYY-MM-DD&to=YYYY-MM-DD
const express = require('express');
const auth = require('../lib/auth');
const utils = require('../lib/utils');
const exp = require('../services/export');
const log = require('../lib/logger')('export');

const router = express.Router();
router.use(auth.requireLogin);

function period(req, res) {
  var from = req.query.from;
  var to = req.query.to;
  if ((from && !utils.isDate(from)) || (to && !utils.isDate(to))) {
    res.status(400).json({ error: 'Datum ungültig (JJJJ-MM-TT)' });
    return null;
  }
  if (from && to && from > to) {
    res.status(400).json({ error: 'von ist nach bis' });
    return null;
  }
  return { from: from, to: to, with_cancelled: req.query.cancelled === '1' };
}

function fileName(base, p) {
  return base + (p.from ? '_' + p.from : '') + (p.to ? '_' + p.to : '') + '.csv';
}

function send(res, name, body, charset) {
  res.setHeader('Content-Type', 'text/csv; charset=' + (charset || 'utf-8'));
  res.setHeader('Content-Disposition', 'attachment; filename="' + name + '"');
  res.send(body);
}

router.get('/invoices.csv', function (req, res) {
  var p = period(req, res);
  if (!p) return;
  log.info('invoices', { account: req.accountId, from: p.from, to: p.to });
  send(res, fileName('rechnungen', p), exp.invoicesCsv(req.accountId, p));
});

router.get('/items.csv', function (req, res) {
  var p = period(req, res);
  if (!p) return;
  send(res, fileName('positionen', p), exp.itemsCsv(req.accountId, p));
});

router.get('/customers.csv', function (req, res) {
  send(res, 'debitoren.csv', exp.customersCsv(req.accountId));
});

router.get('/datev.csv', function (req, res) {
  var p = period(req, res);
  if (!p) return;
  log.info('booking export', { account: req.accountId, from: p.from, to: p.to });
  send(res, fileName('buchungen', p), exp.datevLike(req.accountId, p), 'windows-1252');
});

// what is in the booking export, per tax rate (for the page before the download)
router.get('/datev/summary', function (req, res) {
  var p = period(req, res);
  if (!p) return;
  res.json(exp.datevSummary(req.accountId, p));
});

module.exports = router;
