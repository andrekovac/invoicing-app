// yearly check of the invoice numbers: gaps and doubles per account
//   node scripts/check-numbers.js            all accounts
//   node scripts/check-numbers.js 2 2023     account 2, only 2023
// exit code 1 when something is missing, so it can run in a cron job
const db = require('../db');
const invoiceNumber = require('../lib/invoice-number');

function check(accountId, year) {
  const rows = db.open().prepare('SELECT number FROM invoices WHERE account_id = ? AND number IS NOT NULL').all(accountId);
  return invoiceNumber.gaps(rows.map(r => r.number)).filter(y => !year || y.year === year);
}

function main(argv) {
  const conn = db.open();
  const accountId = argv[0] ? Number(argv[0]) : null;
  const year = argv[1] ? Number(argv[1]) : null;
  const accounts = accountId
    ? conn.prepare('SELECT id, name FROM accounts WHERE id = ?').all(accountId)
    : conn.prepare('SELECT id, name FROM accounts ORDER BY id').all();
  let problems = 0;
  accounts.forEach(acc => {
    check(acc.id, year).forEach(y => {
      const status = y.missing.length || y.duplicates.length ? 'CHECK' : 'ok';
      console.log(`[numbers] ${acc.name} ${y.year}: ${y.count} numbers ${y.first} .. ${y.last} ${status}`);
      if (y.missing.length) console.log('  missing: ' + y.missing.join(', '));
      if (y.duplicates.length) console.log('  double: ' + y.duplicates.join(', '));
      problems += y.missing.length + y.duplicates.length;
    });
  });
  db.close();
  return problems;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2)) ? 1 : 0;
}

module.exports = { check, main };
