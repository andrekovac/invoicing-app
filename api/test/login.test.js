// login, lock after too many wrong passwords
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

function login(email, password) {
  return helpers.client(srv.base).call('POST', '/api/v1/auth/login', { email: email, password: password });
}

test('email is not case sensitive', async function () {
  const res = await login('Jonas@Agentur-Brandt.example', 'rechnungen');
  assert.strictEqual(res.status, 200);
});

test('locked after too many wrong passwords', async function () {
  const email = 'buero@agentur-brandt.example';
  for (let i = 0; i < auth.MAX_FAILED; i++) {
    const res = await login(email, 'falsch' + i);
    assert.strictEqual(res.status, 401);
  }
  const locked = await login(email, 'rechnungen');
  assert.strictEqual(locked.status, 429);
  assert.match(locked.body.error, /Zu viele Versuche/);
});

test('lock ends after the window', function () {
  const email = 'buero@agentur-brandt.example';
  const later = Date.now() + (auth.LOCK_MINUTES + 1) * 60 * 1000;
  assert.strictEqual(auth.isLocked(email, later), false);
});

test('unknown emails are counted too', async function () {
  for (let i = 0; i < auth.MAX_FAILED; i++) await login('niemand@example.com', 'x');
  const res = await login('niemand@example.com', 'x');
  assert.strictEqual(res.status, 429);
});

test('a good login resets the count', async function () {
  const email = 'anna@druckerei-albers.example';
  for (let i = 0; i < auth.MAX_FAILED - 1; i++) await login(email, 'falsch');
  assert.strictEqual((await login(email, 'rechnungen')).status, 200);
  assert.strictEqual(auth.failedLogins(email), 0);
  assert.strictEqual((await login(email, 'falsch')).status, 401);
  assert.strictEqual(auth.failedLogins(email), 1);
  assert.strictEqual((await login(email, 'rechnungen')).status, 200);
});

test('old attempts are removed', function () {
  db.open().prepare("INSERT INTO login_attempts (email, ok, created_at) VALUES ('alt@example.com', 0, '2020-01-01 10:00:00')").run();
  assert.ok(auth.pruneLogins(30) >= 1);
});
