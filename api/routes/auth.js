const express = require('express');
const db = require('../db');
const auth = require('../lib/auth');
const session = require('../lib/session');

const router = express.Router();

router.post('/login', function (req, res, next) {
  var email = String((req.body && req.body.email) || '').trim().toLowerCase();
  var password = String((req.body && req.body.password) || '');
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort angeben' });

  var user = db.open().prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!user) return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });

  auth.verifyPassword(password, user.password_hash, function (err, ok) {
    if (err) return next(err);
    if (!ok) return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
    session.set(res, { uid: user.id });
    res.json(auth.publicUser(user));
  });
});

router.post('/logout', function (req, res) {
  session.clear(res);
  res.status(204).end();
});

router.get('/me', auth.requireLogin, function (req, res) {
  res.json(auth.publicUser(req.user));
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
