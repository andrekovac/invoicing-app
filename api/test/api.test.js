// api tests against an in-memory db with the demo data
process.env.APP_DB_FILE = ':memory:';

const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const app = require('../server');

var server;
var base;
var cookie = '';

function call(method, url, body, noCookie) {
  var opts = { method: method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (cookie && !noCookie) opts.headers.Cookie = cookie;
  return fetch(base + url, opts).then(function (res) {
    var setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    var type = res.headers.get('content-type') || '';
    var p = type.indexOf('json') !== -1 ? res.json() : res.text();
    return p.then(function (data) {
      return { status: res.status, body: data, headers: res.headers };
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

test('health', async function () {
  var res = await call('GET', '/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.ok, true);
});

test('invoices need a login', async function () {
  var res = await call('GET', '/api/v1/invoices');
  assert.strictEqual(res.status, 401);
});

test('login with wrong password', async function () {
  var res = await call('POST', '/api/v1/auth/login', { email: 'jonas@agentur-brandt.example', password: 'falsch' });
  assert.strictEqual(res.status, 401);
});

test('login', async function () {
  var res = await call('POST', '/api/v1/auth/login', { email: 'jonas@agentur-brandt.example', password: 'rechnungen' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.role, 'admin');
  assert.ok(cookie.indexOf('rsid=') === 0);

  var me = await call('GET', '/api/v1/auth/me');
  assert.strictEqual(me.body.email, 'jonas@agentur-brandt.example');
});

test('list invoices', async function () {
  var res = await call('GET', '/api/v1/invoices');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.length >= 10);
  assert.ok(res.body[0].customer_name);
});

test('filter by status', async function () {
  var res = await call('GET', '/api/v1/invoices?status=draft');
  assert.ok(res.body.length > 0);
  res.body.forEach(function (inv) { assert.strictEqual(inv.status, 'draft'); });
});

test('create customer and invoice, issue it', async function () {
  var c = await call('POST', '/api/v1/customers', { name: 'Testkunde GmbH', city: 'Köln' });
  assert.strictEqual(c.status, 201);

  var inv = await call('POST', '/api/v1/invoices', {
    customer_id: c.body.id,
    vat_rate: 0.19,
    items: [
      { description: 'Beratung', quantity: 2, unit_price: '100,00' },
      { description: 'Material', quantity: 1, unit_price: 50 }
    ]
  });
  assert.strictEqual(inv.status, 201);
  assert.strictEqual(inv.body.status, 'draft');
  assert.strictEqual(inv.body.total_net, 250);
  assert.strictEqual(inv.body.total_tax, 47.5);
  assert.strictEqual(inv.body.total_gross, 297.5);

  var issued = await call('POST', '/api/v1/invoices/' + inv.body.id + '/issue');
  assert.strictEqual(issued.status, 200);
  assert.match(issued.body.number, /^RE-\d{4}-\d{4}$/);
  assert.ok(issued.body.due_date);

  var again = await call('PUT', '/api/v1/invoices/' + inv.body.id, { items: [] });
  assert.strictEqual(again.status, 409);
});

test('invoice needs a customer', async function () {
  var res = await call('POST', '/api/v1/invoices', { items: [] });
  assert.strictEqual(res.status, 400);
});

test('bad item price', async function () {
  var res = await call('POST', '/api/v1/invoices', {
    customer_id: 1,
    items: [{ description: 'x', quantity: 1, unit_price: 'abc' }]
  });
  assert.strictEqual(res.status, 400);
});

test('preview with discount', async function () {
  var res = await call('POST', '/api/v1/invoices/preview', {
    vat_rate: 0.07,
    discount_percent: 10,
    items: [{ description: 'Buch', quantity: 2, unit_price: 50 }]
  });
  assert.strictEqual(res.body.total_net, 90);
  assert.strictEqual(res.body.total_tax, 6.3);
  assert.strictEqual(res.body.total_gross, 96.3);
});

test('find by number', async function () {
  var res = await call('GET', '/api/v1/invoices/by-number/RE-2020-0001');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.number, 'RE-2020-0001');
  assert.ok(res.body.items.length > 0);
});

test('pdf', async function () {
  var res = await call('GET', '/api/v1/invoices/1/pdf');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
  assert.ok(res.body.indexOf('%PDF-1.4') === 0);
});

test('pdf as text', async function () {
  var res = await call('GET', '/api/v1/invoices/1/pdf?format=txt');
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /RECHNUNG RE-2020-0001/);
  assert.match(res.body, /Gesamt\s+2\.177,70 €/);
});

test('mark paid', async function () {
  var list = await call('GET', '/api/v1/invoices?status=issued');
  var id = list.body[0].id;
  var res = await call('POST', '/api/v1/invoices/' + id + '/paid', { paid_at: '2021-01-20' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'paid');
  assert.strictEqual(res.body.paid_at, '2021-01-20');
});

test('users need admin', async function () {
  var res = await call('GET', '/api/v1/admin/users');
  assert.strictEqual(res.status, 200);
  await call('POST', '/api/v1/auth/logout');
  cookie = '';
  await call('POST', '/api/v1/auth/login', { email: 'buero@agentur-brandt.example', password: 'rechnungen' });
  var res2 = await call('GET', '/api/v1/admin/users');
  assert.strictEqual(res2.status, 403);
});
