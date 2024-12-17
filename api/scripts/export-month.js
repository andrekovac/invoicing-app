// monthly files for the tax advisor, written to a folder (cron on the first of the month)
//   node scripts/export-month.js 2 2024-11 ./export
// writes rechnungen_2024-11.csv, positionen_2024-11.csv, buchungen_2024-11.csv
const fs = require('fs');
const path = require('path');
const db = require('../db');
const exp = require('../services/export');
const log = require('../lib/logger')('export');

function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!m) return null;
  const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return { from: month + '-01', to: month + '-' + String(last).padStart(2, '0') };
}

// the month before today: "2024-11" when it is December
function lastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function write(dir, accountId, month) {
  const range = monthRange(month);
  if (!range) throw new Error('month must be YYYY-MM');
  fs.mkdirSync(dir, { recursive: true });
  const files = [
    ['rechnungen_' + month + '.csv', exp.invoicesCsv(accountId, range)],
    ['positionen_' + month + '.csv', exp.itemsCsv(accountId, range)],
    ['buchungen_' + month + '.csv', exp.datevLike(accountId, range)]
  ];
  files.forEach(f => fs.writeFileSync(path.join(dir, f[0]), f[1]));
  return files.map(f => path.join(dir, f[0]));
}

function main(argv) {
  const accountId = Number(argv[0]);
  if (!accountId) {
    console.error('usage: export-month.js <account id> [YYYY-MM] [folder]');
    return 2;
  }
  const month = argv[1] || lastMonth();
  const dir = argv[2] || path.join(__dirname, '..', 'data', 'export');
  db.open();
  const written = write(dir, accountId, month);
  written.forEach(f => log.info('written', { file: f }));
  db.close();
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, write, monthRange };
