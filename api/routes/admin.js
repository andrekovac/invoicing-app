// account settings + users. admin only
const express = require('express');
const db = require('../db');
const auth = require('../lib/auth');
const invoiceNumber = require('../lib/invoice-number');

const router = express.Router();
router.use(auth.requireAdmin);

const ACCOUNT_FIELDS = ['name', 'street', 'zip', 'city', 'iban', 'tax_number', 'email'];

router.get('/account', function (req, res) {
  res.json(db.open().prepare('SELECT * FROM accounts WHERE id = ?').get(req.accountId));
});

router.put('/account', function (req, res) {
  var body = req.body || {};
  if (body.name !== undefined && !String(body.name).trim()) return res.status(400).json({ error: 'Name fehlt' });
  var sets = [];
  var vals = [];
  ACCOUNT_FIELDS.forEach(function (f) {
    if (body[f] !== undefined) {
      sets.push(f + ' = ?');
      vals.push(body[f] === '' ? null : String(body[f]).trim());
    }
  });
  if (sets.length) {
    vals.push(req.accountId);
    var stmt = db.open().prepare('UPDATE accounts SET ' + sets.join(', ') + ' WHERE id = ?');
    stmt.run.apply(stmt, vals);
  }
  res.json(db.open().prepare('SELECT * FROM accounts WHERE id = ?').get(req.accountId));
});

// mails written by the api (invoice, reminder, ...)
router.get('/outbox', function (req, res) {
  res.json(require('../lib/mailer').list(req.accountId, Number(req.query.limit) || 100));
});

// imports from the old desktop program
router.get('/imports', function (req, res) {
  res.json(db.open().prepare('SELECT * FROM imports WHERE account_id = ? ORDER BY id DESC').all(req.accountId));
});

// missing or double invoice numbers per year (imported numbers from the desktop program count too)
router.get('/number-check', function (req, res) {
  var rows = db.open().prepare("SELECT number FROM invoices WHERE account_id = ? AND number IS NOT NULL").all(req.accountId);
  var year = req.query.year ? Number(req.query.year) : null;
  var result = invoiceNumber.gaps(rows.map(function (r) { return r.number; }));
  res.json(year ? result.filter(function (y) { return y.year === year; }) : result);
});

router.get('/users', function (req, res) {
  var rows = db.open().prepare('SELECT * FROM users WHERE account_id = ? ORDER BY name').all(req.accountId);
  res.json(rows.map(auth.publicUser));
});

router.post('/users', function (req, res, next) {
  var body = req.body || {};
  var email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return res.status(400).json({ error: 'E-Mail ungültig' });
  if (!body.password || String(body.password).length < 8) return res.status(400).json({ error: 'Passwort zu kurz (min. 8 Zeichen)' });
  if (db.open().prepare('SELECT id FROM users WHERE lower(email) = ?').get(email)) {
    return res.status(409).json({ error: 'E-Mail gibt es schon' });
  }
  var role = body.role === 'admin' ? 'admin' : 'user';
  auth.hashPassword(String(body.password), function (err, hash) {
    if (err) return next(err);
    var info = db.open().prepare('INSERT INTO users (account_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run(req.accountId, email, body.name || null, hash, role);
    var user = db.open().prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json(auth.publicUser(user));
  });
});

router.put('/users/:id', function (req, res, next) {
  var id = Number(req.params.id);
  var user = db.open().prepare('SELECT * FROM users WHERE id = ? AND account_id = ?').get(id, req.accountId);
  if (!user) return res.status(404).json({ error: 'not found' });
  var body = req.body || {};
  if (body.role && id === req.user.id && body.role !== 'admin') {
    return res.status(400).json({ error: 'eigene Admin-Rechte kann man nicht entfernen' });
  }
  db.open().prepare('UPDATE users SET name = ?, role = ? WHERE id = ?')
    .run(body.name !== undefined ? body.name : user.name, body.role === 'admin' || body.role === 'user' ? body.role : user.role, id);

  if (!body.password) {
    return res.json(auth.publicUser(db.open().prepare('SELECT * FROM users WHERE id = ?').get(id)));
  }
  if (String(body.password).length < 8) return res.status(400).json({ error: 'Passwort zu kurz (min. 8 Zeichen)' });
  auth.hashPassword(String(body.password), function (err, hash) {
    if (err) return next(err);
    db.open().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    res.json(auth.publicUser(db.open().prepare('SELECT * FROM users WHERE id = ?').get(id)));
  });
});

router.delete('/users/:id', function (req, res) {
  var id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'man kann sich nicht selbst löschen' });
  var info = db.open().prepare('DELETE FROM users WHERE id = ? AND account_id = ?').run(id, req.accountId);
  if (!info.changes) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

module.exports = router;
