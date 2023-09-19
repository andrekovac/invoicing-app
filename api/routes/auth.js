const express = require('express');
const db = require('../db');
const auth = require('../lib/auth');
const session = require('../lib/session');
const validate = require('../lib/validate');

const router = express.Router();

router.post('/login', function (req, res, next) {
  var email = String((req.body && req.body.email) || '').trim().toLowerCase();
  var password = String((req.body && req.body.password) || '');
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort angeben' });

  if (auth.isLocked(email)) {
    return res.status(429).json({ error: 'Zu viele Versuche, bitte in ' + auth.LOCK_MINUTES + ' Minuten noch einmal' });
  }
  if (Math.random() < 0.01) auth.pruneLogins(30);

  var user = db.open().prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!user) {
    auth.recordLogin(email, req.ip, false);
    return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  }

  auth.verifyPassword(password, user.password_hash, function (err, ok) {
    if (err) return next(err);
    auth.recordLogin(email, req.ip, ok);
    if (!ok) return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
    var account = db.open().prepare('SELECT * FROM accounts WHERE id = ?').get(user.account_id);
    if (!account || !account.active) return res.status(403).json({ error: 'Zugang gesperrt' });
    db.open().prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    session.set(res, { uid: user.id });
    res.json(auth.publicUser(user));
  });
});

// new company signs up: account + first user (admin), logged in right away
router.post('/signup', function (req, res, next) {
  var body = req.body || {};
  var company = String(body.company || '').trim();
  var email = String(body.email || '').trim().toLowerCase();
  var password = String(body.password || '');
  if (!company) return res.status(400).json({ error: 'Firmenname fehlt' });
  if (!validate.isEmail(email)) return res.status(400).json({ error: 'E-Mail ungültig' });
  if (password.length < 8) return res.status(400).json({ error: 'Passwort zu kurz (min. 8 Zeichen)' });
  var c = db.open();
  if (c.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email)) {
    return res.status(409).json({ error: 'E-Mail gibt es schon' });
  }
  auth.hashPassword(password, function (err, hash) {
    if (err) return next(err);
    c.exec('BEGIN');
    try {
      var acc = c.prepare('INSERT INTO accounts (name, email, plan) VALUES (?, ?, ?)').run(company, email, body.plan === 'pro' ? 'pro' : 'basic');
      var accountId = Number(acc.lastInsertRowid);
      var info = c.prepare("INSERT INTO users (account_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
        .run(accountId, email, body.name || null, hash);
      c.exec('COMMIT');
    } catch (e) {
      c.exec('ROLLBACK');
      return next(e);
    }
    var user = c.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
    session.set(res, { uid: user.id });
    res.status(201).json(auth.publicUser(user));
  });
});

router.post('/logout', function (req, res) {
  session.clear(res);
  res.status(204).end();
});

router.get('/me', auth.requireLogin, function (req, res) {
  var u = auth.publicUser(req.user);
  var acc = db.open().prepare('SELECT name, plan FROM accounts WHERE id = ?').get(req.accountId) || {};
  u.account_name = acc.name;
  u.plan = acc.plan;
  res.json(u);
});

// change own password
router.post('/password', auth.requireLogin, function (req, res, next) {
  var body = req.body || {};
  if (!body.new_password || String(body.new_password).length < 8) {
    return res.status(400).json({ error: 'Passwort zu kurz (min. 8 Zeichen)' });
  }
  auth.verifyPassword(String(body.old_password || ''), req.user.password_hash, function (err, ok) {
    if (err) return next(err);
    if (!ok) return res.status(400).json({ error: 'altes Passwort falsch' });
    auth.hashPassword(String(body.new_password), function (err2, hash) {
      if (err2) return next(err2);
      db.open().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
      res.status(204).end();
    });
  });
});

module.exports = router;
