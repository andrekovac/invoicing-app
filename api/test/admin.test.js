// admin routes: account, users, number check
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');

let srv;
let admin;
let user;

test.before(async function () {
  srv = await helpers.startServer();
  admin = helpers.client(srv.base);
  user = helpers.client(srv.base);
  await admin.login('brandt');
  await user.login('brandtUser');
});

test.after(function () {
  srv.stop();
});

test('only admins', async function () {
  assert.strictEqual((await user.get('/api/v1/admin/account')).status, 403);
  assert.strictEqual((await user.get('/api/v1/admin/number-check')).status, 403);
});

test('account data', async function () {
  const res = await admin.get('/api/v1/admin/account');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.name, 'Agentur Brandt');
});

test('numbers of the demo account have no gaps', async function () {
  const res = await admin.get('/api/v1/admin/number-check');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.length >= 2);
  res.body.forEach(function (y) {
    assert.deepStrictEqual(y.missing, []);
    assert.deepStrictEqual(y.duplicates, []);
  });
});

test('number check for one year', async function () {
  const res = await admin.get('/api/v1/admin/number-check?year=2020');
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].first, 'RE-2020-0001');
  assert.strictEqual(res.body[0].count, 10);
});

test('users of the account', async function () {
  const res = await admin.get('/api/v1/admin/users');
  assert.strictEqual(res.status, 200);
  const emails = res.body.map(function (u) { return u.email; }).sort();
  assert.deepStrictEqual(emails, ['buero@agentur-brandt.example', 'jonas@agentur-brandt.example']);
  res.body.forEach(function (u) { assert.ok(!('password_hash' in u)); });
});
