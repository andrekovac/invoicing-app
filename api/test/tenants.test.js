// several accounts in one db: a new company must not see the agency data
process.env.APP_DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const app = require('../server');

var server;
var base;
var cookie = '';

function call(method, url, body) {
  var opts = { method: method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (cookie) opts.headers.Cookie = cookie;
  return fetch(base + url, opts).then(function (res) {
    var setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    var type = res.headers.get('content-type') || '';
    var p = type.indexOf('json') !== -1 ? res.json() : res.text();
    return p.then(function (data) {
      return { status: res.status, body: data };
    });
  });
}

test.before(function (t, done) {
  db.open();
  require('../seed/seed').seed();
  server = app.listen(0, function () {
    base = 'http://127.0.0.1:' + server.address().port;
    done();
  });
});

test.after(function () {
  server.close();
  db.close();
});

test('signup creates account and admin', async function () {
  var res = await call('POST', '/api/v1/auth/signup', {
    company: 'Malerbetrieb Kern', name: 'Ute Kern', email: 'ute@maler-kern.example', password: 'geheim123'
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.role, 'admin');
  var me = await call('GET', '/api/v1/auth/me');
  assert.strictEqual(me.body.account_name, 'Malerbetrieb Kern');
});

test('signup with same email again', async function () {
  var res = await call('POST', '/api/v1/auth/signup', { company: 'X', email: 'ute@maler-kern.example', password: 'geheim123' });
  assert.strictEqual(res.status, 409);
});

test('new account sees only own customers', async function () {
  var list = await call('GET', '/api/v1/customers');
  assert.strictEqual(list.body.length, 0);
  var other = await call('GET', '/api/v1/customers/1');
  assert.strictEqual(other.status, 404);
  var invs = await call('GET', '/api/v1/invoices');
  assert.strictEqual(invs.body.length, 0);
});

test('new account starts its own numbers', async function () {
  var c = await call('POST', '/api/v1/customers', { name: 'Familie Roth', city: 'Fürth' });
  var inv = await call('POST', '/api/v1/invoices', {
    customer_id: c.body.id,
    items: [{ description: 'Wohnzimmer streichen', quantity: 1, unit_price: 840 }]
  });
  assert.strictEqual(inv.status, 201);
  var issued = await call('POST', '/api/v1/invoices/' + inv.body.id + '/issue');
  assert.match(issued.body.number, /^RE-\d{4}-0001$/);
});

test('invoice for a customer of another account', async function () {
  var res = await call('POST', '/api/v1/invoices', { customer_id: 1, items: [] });
  assert.strictEqual(res.status, 400);
});

test('imported account', async function () {
  cookie = '';
  var res = await call('POST', '/api/v1/auth/login', { email: 'anna@druckerei-albers.example', password: 'rechnungen' });
  assert.strictEqual(res.status, 200);
  var list = await call('GET', '/api/v1/customers');
  assert.strictEqual(list.body.length, 14);
  var inv = await call('GET', '/api/v1/invoices/by-number/RE-2021-0087');
  assert.strictEqual(inv.body.customer.name, 'Krause GmbH');
});
