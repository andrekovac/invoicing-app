const path = require('path');
const express = require('express');
const db = require('./db');
const session = require('./lib/session');

const PORT = process.env.PORT || 4730;

const app = express();
app.use(express.json());

app.use(session.middleware);

app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/', function (req, res) {
  res.redirect('/admin/');
});

app.get('/api/health', function (req, res) {
  res.json({ ok: true });
});

app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/customers', require('./routes/customers'));
app.use('/api/v1/invoices', require('./routes/invoices'));

app.use('/api', function (req, res) {
  res.status(404).json({ error: 'not found' });
});

app.use(function (err, req, res, next) {
  console.error(err);
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
