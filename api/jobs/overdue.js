// checks for overdue invoices and writes reminder mails (outbox). started in server.js
const reminders = require('../services/reminders');

const INTERVAL = Number(process.env.OVERDUE_INTERVAL_MIN || 60) * 60 * 1000;
let timer = null;

function tick() {
  let sent = [];
  try {
    sent = reminders.run();
  } catch (err) {
    console.error('[overdue] failed', err);
    return [];
  }
  sent.forEach(s => console.log(`[overdue] reminder to ${s.email} invoice=${s.number}`));
  return sent;
}

function start() {
  if (timer) return;
  timer = setInterval(tick, INTERVAL);
  timer.unref();
  // first run shortly after start, not during the start itself
  setTimeout(tick, 5000).unref();
  console.log('[overdue] job every ' + INTERVAL / 60000 + ' min');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
