// exports for the tax advisor:
//   invoicesCsv  one row per invoice (semicolon csv, utf-8 with BOM, opens in Excel)
//   itemsCsv     one row per position
//   customersCsv customer list with the debtor numbers used in the booking export
//   datevLike    the old booking export (like the desktop program wrote it): fixed columns,
//                windows-1252, revenue account and tax key per invoice. not the official
//                DATEV format, our tax advisor imports it with his own mapping
const db = require('../db');
const csv = require('../lib/csv');
const money = require('../lib/money');
const pricing = require('../lib/pricing');
const payments = require('./payments');

const STATUS_DE = { draft: 'Entwurf', issued: 'offen', paid: 'bezahlt', cancelled: 'storniert' };

// SKR03 revenue accounts and the tax keys of the old export, by tax rate
const ACCOUNTS = {
  19: { account: '8400', key: '3' },
  7: { account: '8300', key: '2' },
  0: { account: '8337', key: '' }
};
const DEBTOR_BASE = 10000;

function conn() {
  return db.open();
}

// 1234.5 -> "1234,50" (no thousands separator, the import does not like them)
function num(n) {
  if (n === null || n === undefined || n === '') return '';
  return money.round2(n).toFixed(2).replace('.', ',');
}

function dateDe(s) {
  if (!s) return '';
  var p = String(s).slice(0, 10).split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}

function debtorNo(customerId) {
  return String(DEBTOR_BASE + Number(customerId));
}

function rangeSql(opts, args, col) {
  var sql = '';
  if (opts.from) {
    sql += ' AND ' + col + ' >= ?';
    args.push(opts.from);
  }
  if (opts.to) {
    sql += ' AND ' + col + ' <= ?';
    args.push(opts.to);
  }
  return sql;
}

// issued, paid and (if asked) cancelled invoices of the period, by issue date
function invoiceRows(accountId, opts) {
  opts = opts || {};
  var args = [accountId];
  var statuses = opts.with_cancelled ? "('issued', 'paid', 'cancelled')" : "('issued', 'paid')";
  var sql = 'SELECT i.*, c.name AS customer_name, c.vat_id AS customer_vat_id, c.country AS customer_country FROM invoices i ' +
    'JOIN customers c ON c.id = i.customer_id WHERE i.account_id = ? AND i.status IN ' + statuses +
    rangeSql(opts, args, 'i.issue_date') + ' ORDER BY i.issue_date, i.number';
  var stmt = conn().prepare(sql);
  return stmt.all.apply(stmt, args);
}

var INVOICE_HEAD = ['Rechnungsnummer', 'Datum', 'Fällig', 'Kunde', 'Debitor', 'USt-IdNr', 'Land', 'Status',
  'Netto', 'USt-Satz', 'USt', 'Brutto', 'Bezahlt', 'Offen', 'Bezahlt am'];

function invoicesCsv(accountId, opts) {
  var rows = invoiceRows(accountId, opts).map(function (inv) {
    var paid = payments.paidAmount(inv.id);
    return [
      inv.number,
      dateDe(inv.issue_date),
      dateDe(inv.due_date),
      inv.customer_name,
      debtorNo(inv.customer_id),
      inv.customer_vat_id || '',
      inv.customer_country || '',
      STATUS_DE[inv.status] || inv.status,
      num(inv.total_net),
      inv.tax_rate,
      num(inv.total_tax),
      num(inv.total_gross),
      num(paid),
      inv.status === 'issued' ? num(inv.total_gross - paid) : num(0),
      dateDe(inv.paid_at)
    ];
  });
  return '﻿' + csv.stringify([INVOICE_HEAD].concat(rows));
}

var ITEM_HEAD = ['Rechnungsnummer', 'Datum', 'Kunde', 'Pos', 'Text', 'Menge', 'Einzelpreis', 'Netto', 'USt-Satz', 'Brutto'];

function itemsCsv(accountId, opts) {
  var out = [ITEM_HEAD];
  var items = conn().prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id');
  invoiceRows(accountId, opts).forEach(function (inv) {
    items.all(inv.id).forEach(function (it) {
      var net = pricing.lineTotal(it.quantity, it.unit_price);
      out.push([
        inv.number,
        dateDe(inv.issue_date),
        inv.customer_name,
        it.position,
        it.description,
        String(it.quantity).replace('.', ','),
        String(it.unit_price).replace('.', ','),
        num(net),
        inv.tax_rate,
        num(pricing.gross(net, inv.tax_rate))
      ]);
    });
  });
  return '﻿' + csv.stringify(out);
}

var CUSTOMER_HEAD = ['Debitor', 'Name', 'Ansprechpartner', 'Straße', 'PLZ', 'Ort', 'Land', 'USt-IdNr', 'E-Mail', 'Alt-Nr.'];

function customersCsv(accountId) {
  var rows = conn().prepare('SELECT * FROM customers WHERE account_id = ? ORDER BY id').all(accountId).map(function (c) {
    return [debtorNo(c.id), c.name, c.contact_name || '', c.street || '', c.zip || '', c.city || '', c.country || '', c.vat_id || '', c.email || '', c.legacy_no || ''];
  });
  return '﻿' + csv.stringify([CUSTOMER_HEAD].concat(rows));
}

// ---- old booking export ----

// the desktop program had only the decimal rate, the tax advisor's mapping is built on it
function legacyRate(inv) {
  if (inv.legacy_tax_rate === null || inv.legacy_tax_rate === undefined) return inv.tax_rate;
  return Math.round(inv.legacy_tax_rate * 100);
}

// "05.06.2021" -> "0506" (day and month, the year comes from the header)
function ddmm(s) {
  return s ? s.slice(8, 10) + s.slice(5, 7) : '';
}

var DATEV_HEAD = ['Umsatz', 'Soll/Haben', 'WKZ', 'Konto', 'Gegenkonto', 'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Belegfeld 2', 'Buchungstext', 'USt-Satz'];

function datevRows(accountId, opts) {
  opts = Object.assign({}, opts, { with_cancelled: true });
  var out = [];
  invoiceRows(accountId, opts).forEach(function (inv) {
    var rate = legacyRate(inv);
    var acc = ACCOUNTS[rate] || ACCOUNTS[19];
    var text = String(inv.customer_name || '').slice(0, 60);
    out.push({
      invoice: inv,
      rate: rate,
      fields: [num(inv.total_gross), 'S', 'EUR', debtorNo(inv.customer_id), acc.account, acc.key, ddmm(inv.issue_date),
        inv.number, dateDe(inv.due_date).replace(/\./g, ''), text, String(rate)]
    });
    // cancelled: the booking and the reversal, so the advisor sees both
    if (inv.status === 'cancelled') {
      out.push({
        invoice: inv,
        rate: rate,
        fields: [num(inv.total_gross), 'H', 'EUR', debtorNo(inv.customer_id), acc.account, acc.key, ddmm(inv.updated_at || inv.issue_date),
          inv.number, '', ('Storno ' + text).slice(0, 60), String(rate)]
      });
    }
  });
  return out;
}

function datevLike(accountId, opts) {
  opts = opts || {};
  var account = conn().prepare('SELECT name, tax_number FROM accounts WHERE id = ?').get(accountId) || {};
  var rows = datevRows(accountId, opts);
  var head = ['Buchungsstapel', 'Rechnungen', account.name || '', account.tax_number || '',
    (opts.from || '').replace(/-/g, ''), (opts.to || '').replace(/-/g, ''), String(rows.length)];
  var text = csv.stringify([head, DATEV_HEAD].concat(rows.map(function (r) { return r.fields; })));
  // the old import wants windows-1252. latin1 is the same for everything we write except €
  return Buffer.from(text.replace(/€/g, 'EUR'), 'latin1');
}

// totals per tax rate of the booking export, shown on the export page before the download
function datevSummary(accountId, opts) {
  var sums = {};
  datevRows(accountId, opts).forEach(function (r) {
    var k = r.rate;
    sums[k] = sums[k] || { tax_rate: k, account: (ACCOUNTS[k] || ACCOUNTS[19]).account, key: (ACCOUNTS[k] || ACCOUNTS[19]).key, bookings: 0, gross: 0 };
    sums[k].bookings += 1;
    sums[k].gross = money.round2(sums[k].gross + (r.fields[1] === 'H' ? -r.invoice.total_gross : r.invoice.total_gross));
  });
  return Object.keys(sums).sort(function (a, b) { return b - a; }).map(function (k) { return sums[k]; });
}

module.exports = {
  ACCOUNTS: ACCOUNTS,
  debtorNo: debtorNo,
  invoicesCsv: invoicesCsv,
  itemsCsv: itemsCsv,
  customersCsv: customersCsv,
  datevLike: datevLike,
  datevSummary: datevSummary,
  legacyRate: legacyRate
};
