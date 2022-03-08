const express = require('express');
const payments = require('../services/payments');
const invoices = require('../services/invoices');
const auth = require('../lib/auth');
const money = require('../lib/money');
const utils = require('../lib/utils');

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

// payments of one invoice: ?invoice_id=12, without: all payments of the account
router.get('/', function (req, res) {
  if (!req.query.invoice_id) {
    return res.json(payments.list(req.accountId, { method: req.query.method, from: req.query.from, to: req.query.to }));
  }
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

// bank transfer, also partial payments
router.post('/', function (req, res) {
  const body = req.body || {};
  const inv = ownInvoice(req, res, body.invoice_id);
  if (!inv) return;
  if (inv.status !== 'issued') return res.status(409).json({ error: 'Rechnung ist nicht offen' });
  const amount = typeof body.amount === 'string' ? money.parseEuro(body.amount) : Number(body.amount);
  if (isNaN(amount) || amount <= 0 || amount > 500000) return res.status(400).json({ error: 'Betrag ungültig' });
  if (body.paid_at && !utils.isDate(body.paid_at)) return res.status(400).json({ error: 'Datum ungültig' });
  const open = payments.openAmount(inv);
  // Achtung: Überzahlung erlauben wir nicht, sonst stimmt die offene Summe nicht mehr
  if (money.round2(amount) > open) return res.status(400).json({ error: 'Betrag höher als offen (' + money.formatEuro(open) + ')' });
  const p = payments.recordPayment(inv, {
    amount: amount,
    method: 'transfer',
    paid_at: body.paid_at,
    reference: body.reference,
    user_id: req.user.id
  });
  res.status(201).json(Object.assign(p, { open: payments.openAmount(invoices.findById(inv.id)) }));
});

router.delete('/:id', function (req, res) {
  const p = payments.findById(Number(req.params.id));
  if (!p || p.account_id !== req.accountId) return res.status(404).json({ error: 'not found' });
  if (p.method === 'card') return res.status(409).json({ error: 'Kartenzahlungen nur über CardPay erstatten' });
  payments.removePayment(p);
  res.status(204).end();
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
