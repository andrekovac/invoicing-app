const db = require('../db');

const FIELDS = ['name', 'contact_name', 'street', 'zip', 'city', 'country', 'email', 'phone', 'vat_id', 'default_tax_rate'];

function list(accountId, q) {
  // open_amount: issued invoices minus partial payments
  var sql = 'SELECT customers.*, ' +
    "(SELECT coalesce(sum(i.total_gross), 0) FROM invoices i WHERE i.customer_id = customers.id AND i.status = 'issued') - " +
    "(SELECT coalesce(sum(p.amount), 0) FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.customer_id = customers.id AND i.status = 'issued') AS open_amount " +
    'FROM customers WHERE account_id = ?';
  var args = [accountId];
  if (q) {
    sql += ' AND (name LIKE ? OR city LIKE ? OR contact_name LIKE ?)';
    args.push('%' + q + '%', '%' + q + '%', '%' + q + '%');
  }
  sql += ' ORDER BY name';
  return db.open().prepare(sql).all.apply(db.open().prepare(sql), args);
}

function findById(id) {
  return db.open().prepare('SELECT * FROM customers WHERE id = ?').get(id);
}

function create(accountId, data) {
  var cols = ['account_id'];
  var vals = [accountId];
  FIELDS.forEach(function (f) {
    if (data[f] !== undefined) {
      cols.push(f);
      vals.push(data[f]);
    }
  });
  var sql = 'INSERT INTO customers (' + cols.join(', ') + ') VALUES (' + cols.map(function () { return '?'; }).join(', ') + ')';
  var info = db.open().prepare(sql).run.apply(db.open().prepare(sql), vals);
  return findById(Number(info.lastInsertRowid));
}

function update(id, data) {
  var sets = [];
  var vals = [];
  FIELDS.forEach(function (f) {
    if (data[f] !== undefined) {
      sets.push(f + ' = ?');
      vals.push(data[f]);
    }
  });
  if (sets.length) {
    vals.push(id);
    var stmt = db.open().prepare('UPDATE customers SET ' + sets.join(', ') + ' WHERE id = ?');
    stmt.run.apply(stmt, vals);
  }
  return findById(id);
}

function remove(id) {
  var used = db.open().prepare('SELECT count(*) AS n FROM invoices WHERE customer_id = ?').get(id);
  if (used.n > 0) {
    var err = new Error('Kunde hat noch Rechnungen');
    err.status = 409;
    throw err;
  }
  db.open().prepare('DELETE FROM customers WHERE id = ?').run(id);
}

module.exports = { list: list, findById: findById, create: create, update: update, remove: remove, FIELDS: FIELDS };
