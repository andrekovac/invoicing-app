// recurring invoices by hand, e.g. after the server was down for some days
//   node scripts/run-recurring.js                     all accounts, until today
//   node scripts/run-recurring.js 2025-01-31          until that day
//   node scripts/run-recurring.js 2025-01-31 --dry    only show what would be made
//   node scripts/run-recurring.js 2025-01-31 2        only account 2
const db = require('../db');
const utils = require('../lib/utils');
const recurring = require('../services/recurring');

// the dates a series would get until `until`, without making anything
function plan(rec, until) {
  const dates = [];
  let next = rec.next_date;
  while (next && next <= until && dates.length < 24) {
    if (rec.end_date && next > rec.end_date) break;
    dates.push(next);
    next = recurring.addMonths(next, rec.interval_months, rec.day_of_month);
  }
  return dates;
}

function main(argv) {
  const dry = argv.indexOf('--dry') !== -1;
  const args = argv.filter(a => a !== '--dry');
  const until = args[0] || utils.today();
  const accountId = args[1] ? Number(args[1]) : null;
  if (!utils.isDate(until)) {
    console.error('usage: run-recurring.js [YYYY-MM-DD] [account id] [--dry]');
    return 2;
  }
  const conn = db.open();
  if (dry) {
    let sql = 'SELECT r.*, c.name AS customer_name FROM recurring_invoices r JOIN customers c ON c.id = r.customer_id WHERE r.active = 1 AND r.next_date <= ?';
    const params = [until];
    if (accountId) {
      sql += ' AND r.account_id = ?';
      params.push(accountId);
    }
    let n = 0;
    conn.prepare(sql).all(...params).forEach(rec => {
      const dates = plan(rec, until);
      n += dates.length;
      console.log(`[recurring] ${rec.id} ${rec.customer_name} (${rec.title || '-'}): ${dates.join(', ') || 'nothing'}`);
    });
    console.log(`[recurring] would make ${n} invoices until ${until}`);
    db.close();
    return 0;
  }
  const created = recurring.runDue(accountId, until);
  created.forEach(c => console.log(`[recurring] ${c.recurring_id} ${c.date} -> ${c.number || 'draft ' + c.invoice_id}`));
  console.log(`[recurring] ${created.length} invoices made until ${until}`);
  db.close();
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, plan };
