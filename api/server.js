const path = require('path');
const url = require('url');
const express = require('express');
const db = require('./db');
const session = require('./lib/session');
const log = require('./lib/logger')('http');
const errorLog = require('./lib/logger')('error');

const PORT = process.env.PORT || 4730;

const app = express();
// behind the nginx on the same machine: req.ip is the client, not 127.0.0.1 (login lock)
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));

// request log
app.use(function (req, res, next) {
  if (process.env.APP_DB_FILE === ':memory:') return next();
  var start = Date.now();
  res.on('finish', function () {
    log.info(req.method + ' ' + req.originalUrl + ' ' + res.statusCode + ' ' + (Date.now() - start) + 'ms');
  });
  next();
});

app.use(session.middleware);

// the first admin page. stays until the new web app can do everything
app.use('/admin-old', express.static(path.join(__dirname, 'legacy', 'admin-old')));
app.get(['/', '/admin', '/admin/'], function (req, res) {
  res.redirect('/admin-old/');
});

app.get('/api/health', function (req, res) {
  res.json({ ok: true });
});

app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/customers', require('./routes/customers'));
app.use('/api/v1/invoices', require('./routes/invoices'));
app.use('/api/v1/payments', require('./routes/payments'));
app.use('/api/v1/portal', require('./routes/portal'));
app.use('/api/v1/reports', require('./routes/reports'));
app.use('/api/v1/admin', require('./routes/admin'));

// v2 is typescript (node strips the types) and an es module, so it is loaded async.
// requests that come in before it is loaded wait for it
const v2 = import(url.pathToFileURL(path.join(__dirname, 'src', 'v2', 'app.ts')).href).catch(function (err) {
  errorLog.error('api v2 not loaded', err);
  return null;
});
app.use('/api/v2', function (req, res, next) {
  v2.then(function (mod) {
    if (!mod) return res.status(503).json({ errors: [{ message: 'v2 not available' }] });
    mod.router(req, res, next);
  });
});

app.use('/api', function (req, res) {
  res.status(404).json({ error: 'not found' });
});

app.use(function (err, req, res, next) {
  if (!err.status || err.status >= 500) errorLog.error(req.method + ' ' + req.originalUrl, err);
  res.status(err.status || 500).json({ error: err.message || 'server error' });
});

if (require.main === module) {
  db.open();
  // fresh checkout: no db file yet, fill it with demo data
  if (db.wasCreated()) require('./seed/seed').seed();
  if (process.env.OVERDUE_JOB !== 'off') require('./jobs/overdue').start();
  app.listen(PORT, function () {
    require('./lib/logger')('api').info('listening on http://localhost:' + PORT);
  });
}

module.exports = app;
