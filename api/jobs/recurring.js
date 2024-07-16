// makes the due recurring invoices once a day (and shortly after the start). started in server.js
const recurring = require('../services/recurring');
const log = require('../lib/logger')('recurring');

const INTERVAL = 6 * 60 * 60 * 1000;
let timer = null;
let lastDay = null;

function tick() {
  const day = new Date().toISOString().slice(0, 10);
  if (day === lastDay) return [];
  let created = [];
  try {
    created = recurring.runDue(null);
  } catch (err) {
    log.error('failed', err);
    return [];
  }
  lastDay = day;
  created.forEach(c => log.info('invoice created', { recurring: c.recurring_id, invoice: c.number || c.invoice_id, date: c.date }));
  return created;
}

function start() {
  if (timer) return;
  timer = setInterval(tick, INTERVAL);
  timer.unref();
  setTimeout(tick, 8000).unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
