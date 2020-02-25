const express = require('express');
const db = require('./db');

const PORT = process.env.PORT || 4730;

const app = express();
app.use(express.json());

// only one account for now (the agency)
app.use(function (req, res, next) {
  req.accountId = 1;
  next();
});

app.get('/api/health', function (req, res) {
  res.json({ ok: true });
});

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
