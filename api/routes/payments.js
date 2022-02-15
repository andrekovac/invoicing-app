const express = require('express');
const payments = require('../services/payments');
const invoices = require('../services/invoices');
const auth = require('../lib/auth');

const router = express.Router();

router.use(auth.requireLogin);

function ownInvoice(req, res, id) {
  const inv = invoices.findById(Number(id));
  if (!inv || inv.account_id !== req.accountId) {
    res.status(404).json({ error: 'not found' });
    return null;
  }
  return inv;
}

// payments of one invoice: ?invoice_id=12
router.get('/', function (req, res) {
  if (!req.query.invoice_id) return res.status(400).json({ error: 'invoice_id fehlt' });
  const inv = ownInvoice(req, res, req.query.invoice_id);
  if (!inv) return;
  res.json({
    invoice_id: inv.id,
    total_gross: inv.total_gross,
    paid: payments.paidAmount(inv.id),
    open: payments.openAmount(inv),
    payments: payments.forInvoice(inv.id)
  });
});

// card payment taken in the office (customer on the phone)
router.post('/card', async function (req, res, next) {
  const body = req.body || {};
  const inv = ownInvoice(req, res, body.invoice_id);
  if (!inv) return;
  if (inv.status !== 'issued') return res.status(409).json({ error: 'Rechnung ist nicht offen' });
  try {
    res.status(201).json(await payments.startCardPayment(inv, body.card));
  } catch (err) {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

module.exports = router;
