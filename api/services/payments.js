// payments: bank transfer (entered by hand) and card (CardPay)
const db = require('../db');
const money = require('../lib/money');
const utils = require('../lib/utils');
const cardpay = require('../lib/cardpay');
const invoices = require('./invoices');
const customers = require('./customers');

function conn() {
  return db.open();
}

function forInvoice(invoiceId) {
  return conn().prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at, id').all(invoiceId);
}

function paidAmount(invoiceId) {
  const row = conn().prepare('SELECT coalesce(sum(amount), 0) AS s FROM payments WHERE invoice_id = ?').get(invoiceId);
  return money.round2(row.s);
}

function openAmount(inv) {
  if (inv.status !== 'issued') return 0;
  return money.round2(inv.total_gross - paidAmount(inv.id));
}

function isOverdue(inv) {
  return inv.status === 'issued' && !!inv.due_date && new Date(inv.due_date) < new Date();
}

// one payment for one invoice. when everything is paid the invoice goes to 'paid'
function recordPayment(inv, data) {
  const amount = money.round2(Number(data.amount));
  const paidAt = data.paid_at || utils.today();
  const info = conn().prepare('INSERT INTO payments (account_id, invoice_id, amount, method, paid_at, reference, provider_ref, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(inv.account_id, inv.id, amount, data.method || 'transfer', paidAt, data.reference || null,
      data.provider_ref || null, data.user_id || null);
  if (paidAmount(inv.id) >= money.round2(inv.total_gross)) {
    invoices.markPaid(inv.id, paidAt);
  }
  return conn().prepare('SELECT * FROM payments WHERE id = ?').get(Number(info.lastInsertRowid));
}

function logAttempt(accountId, invs, amount, status, error, ref) {
  conn().prepare('INSERT INTO card_attempts (account_id, invoice_ids, amount, status, error, provider_ref) VALUES (?, ?, ?, ?, ?, ?)')
    .run(accountId, invs.map(i => i.id).join(','), amount, status, error || null, ref || null);
}

// card payment for one or more open invoices of the same customer (portal pays several at once)
async function startCardPayment(invs, card) {
  if (!Array.isArray(invs)) invs = [invs];
  if (!invs.length) throw Object.assign(new Error('keine Rechnung ausgewählt'), { status: 400 });
  const customer = customers.findById(invs[0].customer_id);
  const amounts = invs.map(openAmount);
  const total = money.round2(amounts.reduce((a, b) => a + b, 0));
  if (total <= 0) throw Object.assign(new Error('nichts mehr offen'), { status: 409 });
  const numbers = invs.map(i => i.number).join(',');

  const request = {
    amount: Math.round(total * 100),
    currency: 'EUR',
    description: 'Rechnung ' + numbers,
    reference: numbers,
    billing_country: (customer.country || '').slice(0, 2).toUpperCase(),
    card: card
  };

  let result;
  try {
    result = await cardpay.charge(request);
  } catch (err) {
    console.log(`[payments] cardpay ${err.status || 500} ${err.code || 'error'} invoice=${numbers} country="${request.billing_country}"`);
    logAttempt(invs[0].account_id, invs, total, 'failed', err.code || err.message);
    const e = new Error('Zahlung fehlgeschlagen');
    e.status = err.status === 402 ? 402 : 400;
    e.code = err.code;
    throw e;
  }

  logAttempt(invs[0].account_id, invs, total, 'succeeded', null, result.id);
  const payments = invs.map((inv, i) => recordPayment(inv, {
    amount: amounts[i],
    method: 'card',
    reference: 'Karte **** ' + result.last4,
    provider_ref: result.id
  }));
  return { charge_id: result.id, amount: total, payments: payments };
}

module.exports = {
  forInvoice,
  paidAmount,
  openAmount,
  isOverdue,
  recordPayment,
  startCardPayment
};
