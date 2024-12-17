// numbers for the reports page. amounts are the stored invoice totals (what was billed),
// payments by their paid_at date. cancelled invoices never count
const db = require('../db');
const money = require('../lib/money');
const pricing = require('../lib/pricing');
const utils = require('../lib/utils');
const payments = require('./payments');
const invoices = require('./invoices');

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function conn() {
  return db.open();
}

function emptyMonths(year) {
  var out = [];
  for (var m = 1; m <= 12; m++) {
    out.push({
      month: year + '-' + utils.pad(m, 2),
      label: MONTHS[m - 1],
      count: 0,
      net: 0,
      tax: 0,
      gross: 0,
      paid: 0,
      drafts_gross: 0
    });
  }
  return out;
}

// revenue per month of one year: billed (issue date) and received (payment date).
// drafts with a date in that month are shown as "planned"
function revenuePerMonth(accountId, year) {
  year = Number(year) || Number(utils.today().slice(0, 4));
  var months = emptyMonths(year);
  var from = year + '-01-01';
  var to = year + '-12-31';

  conn().prepare("SELECT substr(issue_date, 6, 2) AS m, count(*) AS n, sum(total_net) AS net, sum(total_tax) AS tax, sum(total_gross) AS gross " +
    "FROM invoices WHERE account_id = ? AND status IN ('issued', 'paid') AND issue_date BETWEEN ? AND ? GROUP BY m")
    .all(accountId, from, to)
    .forEach(function (r) {
      var row = months[Number(r.m) - 1];
      row.count = r.n;
      row.net = money.round2(r.net);
      row.tax = money.round2(r.tax);
      row.gross = money.round2(r.gross);
    });

  conn().prepare("SELECT substr(p.paid_at, 6, 2) AS m, sum(p.amount) AS paid FROM payments p JOIN invoices i ON i.id = p.invoice_id " +
    "WHERE p.account_id = ? AND i.status <> 'cancelled' AND p.paid_at BETWEEN ? AND ? GROUP BY m")
    .all(accountId, from, to)
    .forEach(function (r) {
      months[Number(r.m) - 1].paid = money.round2(r.paid);
    });

  // drafts: stored totals are not reliable while items are edited one by one, so compute them
  conn().prepare("SELECT id, issue_date, tax_rate, discount_percent FROM invoices WHERE account_id = ? AND status = 'draft' AND issue_date BETWEEN ? AND ?")
    .all(accountId, from, to)
    .forEach(function (d) {
      var net = pricing.sumItems(invoices.itemsFor(d.id));
      if (d.discount_percent) net = net * (1 - d.discount_percent / 100);
      var row = months[Number(d.issue_date.slice(5, 7)) - 1];
      row.drafts_gross = money.round2(row.drafts_gross + pricing.gross(net, d.tax_rate));
    });

  var total = months.reduce(function (t, m) {
    t.count += m.count;
    t.net += m.net;
    t.tax += m.tax;
    t.gross += m.gross;
    t.paid += m.paid;
    return t;
  }, { count: 0, net: 0, tax: 0, gross: 0, paid: 0 });
  ['net', 'tax', 'gross', 'paid'].forEach(function (k) { total[k] = money.round2(total[k]); });

  return { year: year, months: months, total: total };
}

// open invoices with how long they are overdue, in buckets like the tax advisor wants them
var BUCKETS = [
  { key: 'not_due', label: 'nicht fällig', max: 0 },
  { key: 'd30', label: '1 - 30 Tage', max: 30 },
  { key: 'd60', label: '31 - 60 Tage', max: 60 },
  { key: 'd90', label: '61 - 90 Tage', max: 90 },
  { key: 'older', label: 'über 90 Tage', max: Infinity }
];

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

function openItems(accountId, asOf) {
  asOf = asOf || utils.today();
  var rows = conn().prepare("SELECT i.*, c.name AS customer_name, c.email AS customer_email FROM invoices i " +
    "JOIN customers c ON c.id = i.customer_id WHERE i.account_id = ? AND i.status = 'issued' ORDER BY i.due_date, i.id").all(accountId);
  var buckets = BUCKETS.map(function (b) { return { key: b.key, label: b.label, count: 0, open: 0 }; });
  var items = rows.map(function (inv) {
    var open = payments.openAmount(inv);
    var days = inv.due_date ? daysBetween(inv.due_date, asOf) : 0;
    var overdue = payments.isOverdue(inv);
    var b = BUCKETS.findIndex(function (x) { return (overdue ? Math.max(days, 1) : 0) <= x.max; });
    buckets[b].count += 1;
    buckets[b].open = money.round2(buckets[b].open + open);
    return {
      id: inv.id,
      number: inv.number,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name,
      customer_email: inv.customer_email,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      total_gross: inv.total_gross,
      open: open,
      overdue: overdue,
      days_overdue: overdue ? Math.max(days, 0) : 0,
      bucket: BUCKETS[b].key
    };
  });
  return {
    as_of: asOf,
    count: items.length,
    open: money.round2(items.reduce(function (s, i) { return s + i.open; }, 0)),
    buckets: buckets,
    items: items
  };
}

// customers with the most revenue in a year (gross of issued and paid invoices)
function topCustomers(accountId, year, limit) {
  year = Number(year) || Number(utils.today().slice(0, 4));
  limit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  var rows = conn().prepare("SELECT c.id, c.name, c.city, count(i.id) AS invoices, sum(i.total_net) AS net, sum(i.total_gross) AS gross " +
    "FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.account_id = ? AND i.status IN ('issued', 'paid') " +
    'AND substr(i.issue_date, 1, 4) = ? GROUP BY c.id ORDER BY gross DESC LIMIT ?').all(accountId, String(year), limit);
  var all = conn().prepare("SELECT coalesce(sum(total_gross), 0) AS gross FROM invoices WHERE account_id = ? AND status IN ('issued', 'paid') AND substr(issue_date, 1, 4) = ?")
    .get(accountId, String(year)).gross;
  return {
    year: year,
    total_gross: money.round2(all),
    customers: rows.map(function (r, i) {
      return {
        rank: i + 1,
        id: r.id,
        name: r.name,
        city: r.city,
        invoices: r.invoices,
        net: money.round2(r.net),
        gross: money.round2(r.gross),
        share: all ? Math.round(r.gross / all * 1000) / 10 : 0
      };
    })
  };
}

// net and tax per tax rate, for one quarter or the whole year (for the advance return)
function taxPerRate(accountId, year, quarter) {
  year = Number(year) || Number(utils.today().slice(0, 4));
  var from = year + '-01-01';
  var to = year + '-12-31';
  if (quarter) {
    var q = Number(quarter);
    from = year + '-' + utils.pad((q - 1) * 3 + 1, 2) + '-01';
    to = year + '-' + utils.pad(q * 3, 2) + '-' + new Date(year, q * 3, 0).getDate();
  }
  var rows = conn().prepare("SELECT tax_rate, count(*) AS n, sum(total_net) AS net, sum(total_tax) AS tax, sum(total_gross) AS gross FROM invoices " +
    "WHERE account_id = ? AND status IN ('issued', 'paid') AND issue_date BETWEEN ? AND ? GROUP BY tax_rate ORDER BY tax_rate DESC")
    .all(accountId, from, to);
  return {
    year: year,
    quarter: quarter ? Number(quarter) : null,
    from: from,
    to: to,
    rates: rows.map(function (r) {
      return { tax_rate: r.tax_rate, count: r.n, net: money.round2(r.net), tax: money.round2(r.tax), gross: money.round2(r.gross) };
    })
  };
}

// recurring invoices coming in the next `months` months (dashboard)
function recurringForecast(accountId, months) {
  var recurring = require('./recurring');
  months = Math.min(Math.max(Number(months) || 3, 1), 12);
  var until = recurring.addMonths(utils.today(), months, 31);
  var out = [];
  conn().prepare('SELECT * FROM recurring_invoices WHERE account_id = ? AND active = 1 AND next_date IS NOT NULL AND next_date <= ? ORDER BY next_date')
    .all(accountId, until)
    .forEach(function (rec) {
      var next = recurring.preview(rec);
      if (!next) return;
      var customer = conn().prepare('SELECT name FROM customers WHERE id = ?').get(rec.customer_id) || {};
      var date = rec.next_date;
      while (date && date <= until && (!rec.end_date || date <= rec.end_date)) {
        out.push({
          recurring_id: rec.id,
          title: rec.title,
          customer_name: customer.name,
          date: date,
          total_net: next.total_net,
          total_gross: money.round2(pricing.gross(next.total_net, next.tax_rate))
        });
        date = recurring.addMonths(date, rec.interval_months, rec.day_of_month);
      }
    });
  out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return {
    until: until,
    count: out.length,
    total_gross: money.round2(out.reduce(function (s, r) { return s + r.total_gross; }, 0)),
    invoices: out
  };
}

module.exports = {
  recurringForecast: recurringForecast,
  MONTHS: MONTHS,
  BUCKETS: BUCKETS,
  revenuePerMonth: revenuePerMonth,
  openItems: openItems,
  topCustomers: topCustomers,
  taxPerRate: taxPerRate
};
