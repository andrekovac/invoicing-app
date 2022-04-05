const express = require('express');
const payments = require('../services/payments');
const links = require('../services/payment-links');
const db = require('../db');
const invoices = require('../services/invoices');
const auth = require('../lib/auth');
const money = require('../lib/money');
const utils = require('../lib/utils');

const router = express.Router();

// ---- payment link, no login: the customer opens /pay/<token> in the web app ----

function linkInvoice(req, res) {
  const data = links.verify(req.params.token);
  const inv = data && invoices.findById(data.invoice_id);
  if (!inv || inv.account_id !== data.account_id) {
    res.status(404).json({ error: 'Link ungültig oder abgelaufen' });
    return null;
  }
  return inv;
}

router.get('/link/:token', function (req, res) {
  const inv = linkInvoice(req, res);
  if (!inv) return;
  const full = invoices.getById(inv.id);
  const account = db.open().prepare('SELECT name, city FROM accounts WHERE id = ?').get(inv.account_id) || {};
  res.json({
    number: inv.number,
    status: inv.status,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    total_gross: inv.total_gross,
    open: payments.openAmount(inv),
    customer_name: full.customer && full.customer.name,
    account_name: account.name,
    account_city: account.city
  });
});

router.post('/link/:token/card', async function (req, res, next) {
  const inv = linkInvoice(req, res);
  if (!inv) return;
  if (inv.status !== 'issued') return res.status(409).json({ error: 'Rechnung ist schon bezahlt' });
  try {
    const result = await payments.startCardPayment(inv, (req.body || {}).card);
    res.status(201).json({ ok: true, amount: result.amount, charge_id: result.charge_id });
  } catch (err) {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

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

// new payment link for an open invoice (goes into the mail to the customer)
router.post('/link', function (req, res) {
  const body = req.body || {};
  const inv = ownInvoice(req, res, body.invoice_id);
  if (!inv) return;
  if (inv.status !== 'issued') return res.status(409).json({ error: 'Rechnung ist nicht offen' });
  const days = body.days === undefined ? links.DEFAULT_DAYS : Number(body.days);
  if (!(days >= 1 && days <= 365)) return res.status(400).json({ error: 'Tage ungültig (1 bis 365)' });
  res.status(201).json(links.create(inv, days));
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
