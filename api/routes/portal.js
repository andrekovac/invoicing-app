// customer portal: the customer opens /portal/<token> and sees all open invoices,
// picks several (cart) and pays them in one card payment
const express = require('express');
const db = require('../db');
const auth = require('../lib/auth');
const pdf = require('../lib/pdf');
const money = require('../lib/money');
const links = require('../services/payment-links');
const invoices = require('../services/invoices');
const customers = require('../services/customers');
const payments = require('../services/payments');

const router = express.Router();

function portalCustomer(req, res) {
  const data = links.verifyPortal(req.params.token);
  const c = data && customers.findById(data.customer_id);
  if (!c || c.account_id !== data.account_id) {
    res.status(404).json({ error: 'Link ungültig oder abgelaufen' });
    return null;
  }
  return c;
}

function openInvoices(c) {
  return db.open().prepare("SELECT * FROM invoices WHERE customer_id = ? AND account_id = ? AND status = 'issued' ORDER BY due_date, id")
    .all(c.id, c.account_id);
}

// the invoices from the cart, all must be open and belong to this customer
function cartInvoices(c, ids) {
  if (!Array.isArray(ids) || !ids.length) return { error: 'keine Rechnung ausgewählt' };
  if (ids.length > 50) return { error: 'zu viele Rechnungen auf einmal' };
  const open = openInvoices(c);
  const picked = [];
  for (let i = 0; i < ids.length; i++) {
    const inv = open.find(o => o.id === Number(ids[i]));
    if (!inv) return { error: 'Rechnung ' + ids[i] + ' ist nicht offen' };
    if (picked.indexOf(inv) === -1) picked.push(inv);
  }
  return { invoices: picked };
}

function publicInvoice(inv) {
  return {
    id: inv.id,
    number: inv.number,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    total_gross: inv.total_gross,
    open: payments.openAmount(inv),
    overdue: payments.isOverdue(inv)
  };
}

router.get('/:token', function (req, res) {
  const c = portalCustomer(req, res);
  if (!c) return;
  const account = db.open().prepare('SELECT name, street, zip, city, iban FROM accounts WHERE id = ?').get(c.account_id) || {};
  const list = openInvoices(c).map(publicInvoice);
  res.json({
    customer: { name: c.name, city: c.city },
    account: account,
    invoices: list,
    total_open: money.round2(list.reduce((s, i) => s + i.open, 0))
  });
});

router.post('/:token/cart', function (req, res) {
  const c = portalCustomer(req, res);
  if (!c) return;
  const cart = cartInvoices(c, (req.body || {}).invoice_ids);
  if (cart.error) return res.status(400).json({ error: cart.error });
  const list = cart.invoices.map(publicInvoice);
  res.json({ invoices: list, total: money.round2(list.reduce((s, i) => s + i.open, 0)) });
});

router.post('/:token/pay', async function (req, res, next) {
  const c = portalCustomer(req, res);
  if (!c) return;
  const body = req.body || {};
  const cart = cartInvoices(c, body.invoice_ids);
  if (cart.error) return res.status(400).json({ error: cart.error });
  try {
    const result = await payments.startCardPayment(cart.invoices, body.card);
    res.status(201).json({ ok: true, amount: result.amount, charge_id: result.charge_id, paid: cart.invoices.map(i => i.number) });
  } catch (err) {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

router.get('/:token/invoices/:id/pdf', function (req, res) {
  const c = portalCustomer(req, res);
  if (!c) return;
  const inv = invoices.getById(Number(req.params.id));
  if (!inv || inv.customer_id !== c.id || inv.status === 'draft') return res.status(404).json({ error: 'not found' });
  const account = db.open().prepare('SELECT * FROM accounts WHERE id = ?').get(inv.account_id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + inv.number + '.pdf"');
  res.send(pdf.invoicePdf(inv, account));
});

// staff: create the portal link for a customer
router.post('/', auth.requireLogin, function (req, res) {
  const c = customers.findById(Number((req.body || {}).customer_id));
  if (!c || c.account_id !== req.accountId) return res.status(404).json({ error: 'not found' });
  res.status(201).json(links.createPortal(c, (req.body || {}).days));
});

module.exports = router;
