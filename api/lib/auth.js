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
  requireLogin: requireLogin,
  requireAdmin: requireAdmin
};
