// "Jetzt bezahlen" links: pay one invoice without login.
// token = base64url(json) + '.' + hmac, the expiry is inside the token, nothing is stored.
// (same idea as lib/session.js, own secret so a session cookie is never a valid link)
const crypto = require('crypto');

const SECRET = process.env.LINK_SECRET || 'paylink-2022-change-me';
const DEFAULT_DAYS = 30;
const APP_URL = process.env.APP_URL || 'http://localhost:4200';

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function encode(data) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return body + '.' + sign(body);
}

function decode(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const parts = token.split('.');
  const expected = Buffer.from(sign(parts[0]));
  const given = Buffer.from(parts[1] || '');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!data.e || data.e < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function expiry(days) {
  return Date.now() + (Number(days) || DEFAULT_DAYS) * 24 * 3600 * 1000;
}

// link for one invoice
function create(inv, days) {
  const exp = expiry(days);
  const token = encode({ t: 'pay', i: inv.id, a: inv.account_id, e: exp });
  return { token: token, url: APP_URL + '/pay/' + token, expires_at: new Date(exp).toISOString() };
}

function verify(token) {
  const d = decode(token);
  if (!d || d.t !== 'pay') return null;
  return { invoice_id: d.i, account_id: d.a, expires_at: d.e };
}

// link for the customer portal: all open invoices of one customer
function createPortal(customer, days) {
  const exp = expiry(days || 90);
  const token = encode({ t: 'portal', c: customer.id, a: customer.account_id, e: exp });
  return { token: token, url: APP_URL + '/portal/' + token, expires_at: new Date(exp).toISOString() };
}

function verifyPortal(token) {
  const d = decode(token);
  if (!d || d.t !== 'portal') return null;
  return { customer_id: d.c, account_id: d.a, expires_at: d.e };
}

module.exports = { create, verify, createPortal, verifyPortal, DEFAULT_DAYS };
