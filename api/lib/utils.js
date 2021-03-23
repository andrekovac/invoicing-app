// small helpers

function pad(n, len) {
  var s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

// YYYY-MM-DD of today (local time)
function today() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
}

function addDays(dateStr, days) {
  var d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
}

function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00'));
}

function toInt(v, def) {
  var n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}

module.exports = { pad: pad, today: today, addDays: addDays, isDate: isDate, toInt: toInt };
