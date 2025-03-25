// password hashes: bcrypt for new ones, old scrypt hashes still work and get replaced
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const auth = require('../lib/auth');
const db = require('../db');

let srv;

test.before(async function () {
  srv = await helpers.startServer();
});

test.after(function () {
  srv.stop();
});

function hash(pw) {
  return new Promise(function (resolve, reject) {
    auth.hashPassword(pw, function (err, h) { return err ? reject(err) : resolve(h); });
  });
}

function verify(pw, stored) {
  return new Promise(function (resolve, reject) {
    auth.verifyPassword(pw, stored, function (err, ok) { return err ? reject(err) : resolve(ok); });
  });
}

test('new hashes are bcrypt', async function () {
  const h = await hash('geheim123');
  assert.ok(auth.isBcrypt(h));
  assert.strictEqual(await verify('geheim123', h), true);
  assert.strictEqual(await verify('geheim124', h), false);
});

test('scrypt hashes from before still work', async function () {
  const old = auth.hashPasswordSync('rechnungen');
  assert.ok(old.startsWith('scrypt$'));
  assert.ok(auth.needsRehash(old));
  assert.strictEqual(await verify('rechnungen', old), true);
  assert.strictEqual(await verify('falsch', old), false);
  assert.strictEqual(await verify('rechnungen', 'md5$abc'), false);
});

test('login replaces the old hash', async function () {
  const email = 'buchhaltung@druckerei-albers.example';
  const before = db.open().prepare('SELECT password_hash FROM users WHERE email = ?').get(email).password_hash;
  assert.ok(before.startsWith('scrypt$'));
  const res = await helpers.client(srv.base).call('POST', '/api/v1/auth/login', { email: email, password: 'rechnungen' });
  assert.strictEqual(res.status, 200);
  let after = before;
  for (let i = 0; i < 50 && after === before; i++) {
    await new Promise(function (r) { setTimeout(r, 20); });
    after = db.open().prepare('SELECT password_hash FROM users WHERE email = ?').get(email).password_hash;
  }
  assert.ok(auth.isBcrypt(after));
  const again = await helpers.client(srv.base).call('POST', '/api/v1/auth/login', { email: email, password: 'rechnungen' });
  assert.strictEqual(again.status, 200);
});
