// customer portal: open invoices, cart, pay several at once
process.env.APP_DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const app = require('../server');
const invoices = require('../services/invoices');
const customers = require('../services/customers');
const links = require('../services/payment-links');

var server;
var base;
var token;
var ids = [];

function call(method, url, body) {
  var opts = { method: method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch(base + url, opts).then(function (res) {
    return res.json().then(function (data) {
      return { status: res.status, body: data };
    });
  });
}

test.before(function (t, done) {
  db.open();
  require('../seed/seed').seed();
  var c = customers.create(1, { name: 'Portal Kunde GmbH', city: 'Bonn', country: 'Deutschland', email: 'portal@example.com' });
  [80, 120, 30].forEach(function (price) {
    var inv = invoices.create(1, { customer_id: c.id, items: [{ description: 'Wartung', quantity: 1, unit_price: price }] });
    ids.push(invoices.issue(inv.id).id);
  });
  token = links.createPortal(c).token;
  server = app.listen(0, function () {
    base = 'http://127.0.0.1:' + server.address().port;
    done();
  });
});

test.after(function () {
  server.close();
  db.close();
});

test('portal lists open invoices', async function () {
  var res = await call('GET', '/api/v1/portal/' + token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.customer.name, 'Portal Kunde GmbH');
  assert.strictEqual(res.body.invoices.length, 3);
  assert.strictEqual(res.body.total_open, 273.7);
});

test('cart total', async function () {
  var res = await call('POST', '/api/v1/portal/' + token + '/cart', { invoice_ids: [ids[0], ids[1]] });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 238);
});

test('pay two invoices at once', async function () {
  var res = await call('POST', '/api/v1/portal/' + token + '/pay', {
    invoice_ids: [ids[0], ids[1]],
    card: { number: '4242424242424242', exp_month: 1, exp_year: 2099, cvc: '999' }
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.amount, 238);
  assert.strictEqual(invoices.findById(ids[0]).status, 'paid');
  assert.strictEqual(invoices.findById(ids[1]).status, 'paid');
  var after = await call('GET', '/api/v1/portal/' + token);
  assert.strictEqual(after.body.invoices.length, 1);
});
