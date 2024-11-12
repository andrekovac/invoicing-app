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

// search box of the customer search page: part of the name, any case.
// with invoice count, open amount and the date of the last invoice
var SEARCH_LIMIT = 50;

function search(accountId, q, opts) {
  opts = opts || {};
  var limit = Math.min(Number(opts.limit) || SEARCH_LIMIT, SEARCH_LIMIT);
  var sql = 'SELECT c.id, c.name, c.contact_name, c.zip, c.city, c.country, c.email, c.legacy_no, c.default_tax_rate, ' +
    '(SELECT count(*) FROM invoices i WHERE i.customer_id = c.id) AS invoice_count, ' +
    "(SELECT max(i.issue_date) FROM invoices i WHERE i.customer_id = c.id AND i.status <> 'draft') AS last_invoice_date, " +
    "(SELECT coalesce(sum(i.total_gross), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'issued') - " +
    "(SELECT coalesce(sum(p.amount), 0) FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.customer_id = c.id AND i.status = 'issued') AS open_amount " +
    'FROM customers c WHERE c.account_id = ? AND lower(c.name) LIKE lower(?)';
  var args = [accountId, '%' + String(q || '').trim() + '%'];
  if (opts.with_open) sql += " AND EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id AND i.status = 'issued')";
  sql += ' ORDER BY c.name LIMIT ?';
  args.push(limit);
  var stmt = db.open().prepare(sql);
  return stmt.all.apply(stmt, args).map(function (r) {
    r.open_amount = Math.round(r.open_amount * 100) / 100;
    return r;
  });
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

// statement of account ("Kontoauszug") for one customer: invoices (debit) and payments
// (credit) in date order with the running balance. opening balance = everything before `from`
function statement(customerId, from, to) {
  var c = db.open();
  var customer = findById(customerId);
  if (!customer) return null;
  from = from || '2000-01-01';
  to = to || new Date().toISOString().slice(0, 10);
  var inv = c.prepare("SELECT id, number, issue_date, due_date, status, total_gross FROM invoices WHERE customer_id = ? AND status IN ('issued', 'paid') ORDER BY issue_date, id").all(customerId);
  var pay = c.prepare("SELECT p.id, p.amount, p.paid_at, p.method, p.reference, i.number FROM payments p JOIN invoices i ON i.id = p.invoice_id " +
    "WHERE i.customer_id = ? AND i.status IN ('issued', 'paid') ORDER BY p.paid_at, p.id").all(customerId);

  var opening = 0;
  var lines = [];
  inv.forEach(function (i) {
    if (i.issue_date < from) opening += i.total_gross;
    else if (i.issue_date <= to) lines.push({ date: i.issue_date, type: 'invoice', text: 'Rechnung ' + i.number, number: i.number, invoice_id: i.id, debit: i.total_gross, credit: 0, due_date: i.due_date });
  });
  pay.forEach(function (p) {
    if (p.paid_at < from) opening -= p.amount;
    else if (p.paid_at <= to) {
      lines.push({ date: p.paid_at, type: 'payment', text: (p.method === 'card' ? 'Kartenzahlung ' : 'Zahlung ') + p.number + (p.reference && p.reference !== p.number ? ' (' + p.reference + ')' : ''), number: p.number, debit: 0, credit: p.amount });
    }
  });
  // same day: invoice before payment
  lines.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.type === b.type ? 0 : a.type === 'invoice' ? -1 : 1;
  });
  var balance = Math.round(opening * 100) / 100;
  lines.forEach(function (l) {
    balance = Math.round((balance + l.debit - l.credit) * 100) / 100;
    l.balance = balance;
  });
  return {
    customer: { id: customer.id, name: customer.name, contact_name: customer.contact_name, street: customer.street, zip: customer.zip, city: customer.city, country: customer.country },
    from: from,
    to: to,
    opening_balance: Math.round(opening * 100) / 100,
    debit: Math.round(lines.reduce(function (s, l) { return s + l.debit; }, 0) * 100) / 100,
    credit: Math.round(lines.reduce(function (s, l) { return s + l.credit; }, 0) * 100) / 100,
    closing_balance: balance,
    lines: lines
  };
}

module.exports = {
  statement: statement,
  list: list,
  search: search,
  findById: findById,
  create: create,
  update: update,
  remove: remove,
  compareName: compareName,
  duplicates: duplicates,
  merge: merge,
  FIELDS: FIELDS
};
