const db = require('../db');
const pricing = require('../lib/pricing');
const money = require('../lib/money');
const utils = require('../lib/utils');

function conn() {
  return db.open();
}

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function computeTotals(items, vatRate, discountPercent) {
  var net = pricing.sumItems(items);
  if (discountPercent) net = net * (1 - discountPercent / 100);
  var totalGross = money.round2(pricing.gross(net, vatRate * 100));
  var totalNet = money.round2(net);
  return {
    total_net: totalNet,
    total_tax: money.round2(totalGross - totalNet),
    total_gross: totalGross
  };
}

function findById(id) {
  return conn().prepare('SELECT * FROM invoices WHERE id = ?').get(id);
}

function itemsFor(invoiceId) {
  return conn().prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id').all(invoiceId);
}

// invoice with items and customer, used by the detail page and the pdf
function getById(id) {
  var inv = findById(id);
  if (!inv) return null;
  inv.items = itemsFor(id);
  inv.customer = conn().prepare('SELECT * FROM customers WHERE id = ?').get(inv.customer_id);
  return inv;
}

function list(accountId, opts) {
  opts = opts || {};
  var sql = 'SELECT i.*, c.name AS customer_name FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.account_id = ?';
  var args = [accountId];
  if (opts.status) {
    sql += ' AND i.status = ?';
    args.push(opts.status);
  }
  if (opts.q) {
    sql += ' AND (i.number LIKE ? OR c.name LIKE ?)';
    args.push('%' + opts.q + '%', '%' + opts.q + '%');
  }
  if (opts.customer_id) {
    sql += ' AND i.customer_id = ?';
    args.push(Number(opts.customer_id));
  }
  sql += ' ORDER BY i.id DESC';
  var stmt = conn().prepare(sql);
  return stmt.all.apply(stmt, args);
}

// numbers for the overview: open, overdue, paid this year
function summary(accountId) {
  var c = conn();
  var today = utils.today();
  var open = c.prepare("SELECT count(*) AS n, coalesce(sum(total_gross), 0) AS sum FROM invoices WHERE account_id = ? AND status = 'issued'").get(accountId);
  var overdue = c.prepare("SELECT count(*) AS n, coalesce(sum(total_gross), 0) AS sum FROM invoices WHERE account_id = ? AND status = 'issued' AND due_date < ?").get(accountId, today);
  var paid = c.prepare("SELECT coalesce(sum(total_gross), 0) AS sum FROM invoices WHERE account_id = ? AND status = 'paid' AND substr(paid_at, 1, 4) = ?").get(accountId, today.slice(0, 4));
  var drafts = c.prepare("SELECT id, vat_rate, discount_percent FROM invoices WHERE account_id = ? AND status = 'draft'").all(accountId);
  // drafts are not in the stored totals yet when items were edited by hand, so compute them
  var draftSum = drafts.reduce(function (sum, d) {
    var net = pricing.sumItems(itemsFor(d.id));
    if (d.discount_percent) net = net * (1 - d.discount_percent / 100);
    return sum + pricing.gross(net, d.vat_rate * 100);
  }, 0);
  return {
    open_count: open.n,
    open_gross: money.round2(open.sum),
    overdue_count: overdue.n,
    overdue_gross: money.round2(overdue.sum),
    paid_this_year: money.round2(paid.sum),
    draft_count: drafts.length,
    draft_gross: money.round2(draftSum)
  };
}

function insertItems(invoiceId, items) {
  var stmt = conn().prepare('INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)');
  items.forEach(function (it, i) {
    stmt.run(invoiceId, i + 1, it.description, Number(it.quantity), Number(it.unit_price));
  });
}

function create(accountId, data) {
  var items = data.items || [];
  var vat = data.vat_rate !== undefined ? Number(data.vat_rate) : 0.19;
  var discount = Number(data.discount_percent) || 0;
  var totals = computeTotals(items, vat, discount);
  var c = conn();
  c.exec('BEGIN');
  try {
    var info = c.prepare('INSERT INTO invoices (account_id, customer_id, status, issue_date, due_date, vat_rate, discount_percent, note, total_net, total_tax, total_gross) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(accountId, Number(data.customer_id), 'draft', data.issue_date || null, data.due_date || null, vat, discount,
        data.note || null, totals.total_net, totals.total_tax, totals.total_gross);
    var id = Number(info.lastInsertRowid);
    insertItems(id, items);
    c.exec('COMMIT');
    return getById(id);
  } catch (err) {
    c.exec('ROLLBACK');
    throw err;
  }
}

function update(id, data) {
  var inv = findById(id);
  if (!inv) return null;
  var c = conn();
  // issued invoices keep their totals: the amount went out to the customer already.
  // texts, dates, note and the items (wording) can still be corrected
  var keepTotals = inv.status !== 'draft';
  var vat = data.vat_rate !== undefined && !keepTotals ? Number(data.vat_rate) : inv.vat_rate;
  var discount = data.discount_percent !== undefined && !keepTotals ? (Number(data.discount_percent) || 0) : inv.discount_percent;
  c.exec('BEGIN');
  try {
    if (data.items) {
      c.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
      insertItems(id, data.items);
    }
    var totals = keepTotals
      ? { total_net: inv.total_net, total_tax: inv.total_tax, total_gross: inv.total_gross }
      : computeTotals(itemsFor(id), vat, discount);
    c.prepare('UPDATE invoices SET customer_id = ?, issue_date = ?, due_date = ?, vat_rate = ?, discount_percent = ?, note = ?, total_net = ?, total_tax = ?, total_gross = ?, updated_at = ? WHERE id = ?')
      .run(data.customer_id !== undefined ? Number(data.customer_id) : inv.customer_id,
        data.issue_date !== undefined ? data.issue_date : inv.issue_date,
        data.due_date !== undefined ? data.due_date : inv.due_date,
        vat, discount,
        data.note !== undefined ? data.note : inv.note,
        totals.total_net, totals.total_tax, totals.total_gross, now(), id);
    c.exec('COMMIT');
  } catch (err) {
    c.exec('ROLLBACK');
    throw err;
  }
  return getById(id);
}

// RE-2020-0001, counts per account and year
function nextNumber(accountId, year) {
  var prefix = 'RE-' + year + '-';
  var last = conn().prepare('SELECT number FROM invoices WHERE account_id = ? AND number LIKE ? ORDER BY number DESC LIMIT 1')
    .get(accountId, prefix + '%');
  var n = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  return prefix + utils.pad(n, 4);
}

function findByNumber(accountId, number) {
  return conn().prepare('SELECT * FROM invoices WHERE account_id = ? AND number = ?').get(accountId, number);
}

// draft -> issued. number is given out here, not on create, so drafts don't burn numbers
function issue(id) {
  var inv = findById(id);
  if (!inv) return null;
  if (inv.status !== 'draft') {
    var err = new Error('Rechnung ist schon gestellt');
    err.status = 409;
    throw err;
  }
  var issueDate = inv.issue_date || utils.today();
  var dueDate = inv.due_date || utils.addDays(issueDate, 14);
  var number = nextNumber(inv.account_id, issueDate.slice(0, 4));
  conn().prepare("UPDATE invoices SET status = 'issued', number = ?, issue_date = ?, due_date = ?, updated_at = ? WHERE id = ?")
    .run(number, issueDate, dueDate, now(), id);
  return getById(id);
}

function setStatus(id, status) {
  conn().prepare('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  return getById(id);
}

function markPaid(id, paidAt) {
  conn().prepare("UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?")
    .run(paidAt || utils.today(), now(), id);
  return getById(id);
}

// only the note, works for issued invoices too
function setNote(id, note) {
  conn().prepare('UPDATE invoices SET note = ?, updated_at = ? WHERE id = ?').run(note || null, now(), id);
  return getById(id);
}

// copy as new draft (same customer, items, rate). dates and number are not copied
function duplicate(id) {
  var inv = getById(id);
  if (!inv) return null;
  return create(inv.account_id, {
    customer_id: inv.customer_id,
    vat_rate: inv.vat_rate,
    discount_percent: inv.discount_percent,
    items: inv.items.map(function (it) {
      return { description: it.description, quantity: it.quantity, unit_price: it.unit_price };
    })
  });
}

function addItem(invoiceId, item) {
  var pos = conn().prepare('SELECT coalesce(max(position), 0) AS p FROM invoice_items WHERE invoice_id = ?').get(invoiceId).p;
  conn().prepare('INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)')
    .run(invoiceId, pos + 1, item.description, Number(item.quantity), Number(item.unit_price));
  return update(invoiceId, {});
}

function updateItem(invoiceId, itemId, item) {
  var old = conn().prepare('SELECT * FROM invoice_items WHERE id = ? AND invoice_id = ?').get(itemId, invoiceId);
  if (!old) return null;
  conn().prepare('UPDATE invoice_items SET description = ?, quantity = ?, unit_price = ? WHERE id = ?')
    .run(item.description !== undefined ? item.description : old.description,
      item.quantity !== undefined ? Number(item.quantity) : old.quantity,
      item.unit_price !== undefined ? Number(item.unit_price) : old.unit_price,
      itemId);
  return update(invoiceId, {});
}

function removeItem(invoiceId, itemId) {
  var info = conn().prepare('DELETE FROM invoice_items WHERE id = ? AND invoice_id = ?').run(itemId, invoiceId);
  if (!info.changes) return null;
  return update(invoiceId, {});
}

function years(accountId) {
  return conn().prepare("SELECT DISTINCT substr(issue_date, 1, 4) AS year FROM invoices WHERE account_id = ? AND issue_date IS NOT NULL ORDER BY year DESC")
    .all(accountId).map(function (r) { return r.year; });
}

function remove(id) {
  conn().prepare('DELETE FROM invoices WHERE id = ?').run(id);
}

module.exports = {
  computeTotals: computeTotals,
  findById: findById,
  getById: getById,
  itemsFor: itemsFor,
  list: list,
  summary: summary,
  nextNumber: nextNumber,
  findByNumber: findByNumber,
  issue: issue,
  setStatus: setStatus,
  markPaid: markPaid,
  setNote: setNote,
  create: create,
  update: update,
  duplicate: duplicate,
  addItem: addItem,
  updateItem: updateItem,
  removeItem: removeItem,
  years: years,
  remove: remove
};
