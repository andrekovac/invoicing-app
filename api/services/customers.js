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

// name for comparing: case, legal form and punctuation do not count
// "Krause GmbH", "KRAUSE G.m.b.H.", "Krause" -> "krause"
var LEGAL_FORMS = ['gmbh & co. kg', 'gmbh & co kg', 'gmbh', 'g.m.b.h.', 'mbh', 'ag', 'kg', 'ohg', 'gbr', 'e.k.', 'e.v.', 'ug', '& co.', '& co'];

function compareName(name) {
  var s = String(name || '').toLowerCase().trim();
  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < LEGAL_FORMS.length; i++) {
      var f = LEGAL_FORMS[i];
      if (s.length > f.length && s.slice(-f.length) === f) {
        s = s.slice(0, -f.length).trim();
        changed = true;
      }
    }
  }
  return s.replace(/[.,;:'"()\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// groups of customers that look like the same company (two imports, typed twice)
function duplicates(accountId) {
  var groups = {};
  db.open().prepare('SELECT id, name, city, email, legacy_no FROM customers WHERE account_id = ? ORDER BY id').all(accountId)
    .forEach(function (c) {
      var key = compareName(c.name);
      if (!key) return;
      (groups[key] = groups[key] || []).push(c);
    });
  return Object.keys(groups)
    .filter(function (k) { return groups[k].length > 1; })
    .sort()
    .map(function (k) { return { key: k, customers: groups[k] }; });
}

// move everything from `dropId` to `keepId` and delete `dropId`.
// empty fields of the kept customer are filled from the other one
function merge(keepId, dropId) {
  var keep = findById(keepId);
  var drop = findById(dropId);
  if (!keep || !drop || keep.account_id !== drop.account_id || keep.id === drop.id) {
    var err = new Error('Kunden können nicht zusammengeführt werden');
    err.status = 400;
    throw err;
  }
  var c = db.open();
  var fill = {};
  FIELDS.forEach(function (f) {
    if ((keep[f] === null || keep[f] === '') && drop[f] !== null && drop[f] !== '') fill[f] = drop[f];
  });
  c.exec('BEGIN');
  try {
    var moved = c.prepare('UPDATE invoices SET customer_id = ? WHERE customer_id = ?').run(keep.id, drop.id).changes;
    if (!keep.legacy_no && drop.legacy_no) c.prepare('UPDATE customers SET legacy_no = ? WHERE id = ?').run(drop.legacy_no, keep.id);
    c.prepare('DELETE FROM customers WHERE id = ?').run(drop.id);
    update(keep.id, fill);
    c.exec('COMMIT');
    return { customer: findById(keep.id), invoices_moved: moved, fields_filled: Object.keys(fill) };
  } catch (e) {
    c.exec('ROLLBACK');
    throw e;
  }
}

module.exports = {
  list: list,
  findById: findById,
  create: create,
  update: update,
  remove: remove,
  compareName: compareName,
  duplicates: duplicates,
  merge: merge,
  FIELDS: FIELDS
};
