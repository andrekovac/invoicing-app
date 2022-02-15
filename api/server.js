const path = require('path');
const express = require('express');
const db = require('./db');
const session = require('./lib/session');

const PORT = process.env.PORT || 4730;

const app = express();
app.use(express.json({ limit: '1mb' }));

// request log
app.use(function (req, res, next) {
  if (process.env.APP_DB_FILE === ':memory:') return next();
  var start = Date.now();
  res.on('finish', function () {
    console.log(req.method + ' ' + req.originalUrl + ' ' + res.statusCode + ' ' + (Date.now() - start) + 'ms');
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
app.use('/api/v1/admin', require('./routes/admin'));

app.use('/api', function (req, res) {
  res.status(404).json({ error: 'not found' });
});

app.use(function (err, req, res, next) {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'server error' });
});

if (require.main === module) {
  db.open();
  // fresh checkout: no db file yet, fill it with demo data
  if (db.wasCreated()) require('./seed/seed').seed();
  app.listen(PORT, function () {
    console.log('api on http://localhost:' + PORT);
  });
}

module.exports = app;
