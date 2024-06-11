// reports: revenue per month, open items, top customers, tax per rate
const express = require('express');
const auth = require('../lib/auth');
const reports = require('../services/reports');
const utils = require('../lib/utils');

const router = express.Router();
router.use(auth.requireLogin);

function year(req, res) {
  if (req.query.year === undefined) return Number(utils.today().slice(0, 4));
  var y = utils.toInt(req.query.year, NaN);
  if (isNaN(y) || y < 2000 || y > 2100) {
    res.status(400).json({ message: 'year ungültig' });
    return null;
  }
  return y;
}

router.get('/revenue', function (req, res) {
  var y = year(req, res);
  if (y === null) return;
  res.json(reports.revenuePerMonth(req.accountId, y));
});

router.get('/open-items', function (req, res) {
  var asOf = req.query.as_of;
  if (asOf && !utils.isDate(asOf)) return res.status(400).json({ message: 'as_of ungültig' });
  res.json(reports.openItems(req.accountId, asOf));
});

router.get('/top-customers', function (req, res) {
  var y = year(req, res);
  if (y === null) return;
  res.json(reports.topCustomers(req.accountId, y, req.query.limit));
});

router.get('/tax', function (req, res) {
  var y = year(req, res);
  if (y === null) return;
  var q = req.query.quarter;
  if (q !== undefined && ['1', '2', '3', '4'].indexOf(String(q)) === -1) return res.status(400).json({ message: 'quarter ungültig' });
  res.json(reports.taxPerRate(req.accountId, y, q));
});

// years that have invoices, for the year picker
router.get('/years', function (req, res) {
  res.json(require('../services/invoices').years(req.accountId));
});

module.exports = router;
