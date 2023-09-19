// password hashing (scrypt) and the login middlewares
const crypto = require('crypto');
const db = require('../db');

const KEYLEN = 64;

function hashPassword(password, cb) {
  var salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(password, salt, KEYLEN, function (err, key) {
    if (err) return cb(err);
    cb(null, 'scrypt$' + salt + '$' + key.toString('hex'));
  });
}

// for the seed script
function hashPasswordSync(password) {
  var salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, KEYLEN).toString('hex');
}

function verifyPassword(password, stored, cb) {
  var parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return cb(null, false);
  crypto.scrypt(password, parts[1], KEYLEN, function (err, key) {
    if (err) return cb(err);
    var expected = Buffer.from(parts[2], 'hex');
    cb(null, expected.length === key.length && crypto.timingSafeEqual(expected, key));
  });
}

// too many wrong passwords: lock the email for a while
const MAX_FAILED = Number(process.env.LOGIN_MAX_FAILED || 5);
const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);

function sqlTime(d) {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function recordLogin(email, ip, ok) {
  db.open().prepare('INSERT INTO login_attempts (email, ip, ok, created_at) VALUES (?, ?, ?, ?)')
    .run(email, ip || null, ok ? 1 : 0, sqlTime(new Date()));
}

// failed tries since the last good login, inside the lock window
function failedLogins(email, now) {
  var since = sqlTime(new Date((now || Date.now()) - LOCK_MINUTES * 60 * 1000));
  var c = db.open();
  var lastOk = c.prepare('SELECT coalesce(max(id), 0) AS id FROM login_attempts WHERE email = ? AND ok = 1').get(email).id;
  return c.prepare('SELECT count(*) AS n FROM login_attempts WHERE email = ? AND ok = 0 AND created_at > ? AND id > ?')
    .get(email, since, lastOk).n;
}

function isLocked(email, now) {
  return failedLogins(email, now) >= MAX_FAILED;
}

// old rows are only noise, called from the login route now and then
function pruneLogins(days) {
  var before = sqlTime(new Date(Date.now() - (days || 30) * 24 * 3600 * 1000));
  return db.open().prepare('DELETE FROM login_attempts WHERE created_at < ?').run(before).changes;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, account_id: u.account_id, email: u.email, name: u.name, role: u.role };
}

function requireLogin(req, res, next) {
  if (!req.session || !req.session.uid) {
    return res.status(401).json({ error: 'nicht angemeldet' });
  }
  var user = db.open().prepare('SELECT * FROM users WHERE id = ?').get(req.session.uid);
  if (!user) return res.status(401).json({ error: 'nicht angemeldet' });
  req.user = user;
  req.accountId = user.account_id;
  next();
}

function requireAdmin(req, res, next) {
  requireLogin(req, res, function () {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'keine Berechtigung' });
    next();
  });
}

module.exports = {
  hashPassword: hashPassword,
  hashPasswordSync: hashPasswordSync,
  verifyPassword: verifyPassword,
  publicUser: publicUser,
  recordLogin: recordLogin,
  failedLogins: failedLogins,
  isLocked: isLocked,
  pruneLogins: pruneLogins,
  MAX_FAILED: MAX_FAILED,
  LOCK_MINUTES: LOCK_MINUTES,
  requireLogin: requireLogin,
  requireAdmin: requireAdmin
};
