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

// Content-Disposition with a file name the browsers understand: ascii fallback plus the
// utf-8 name (Lieferschein Müller.pdf, Angebot 12€.pdf). a raw € in a header throws in node
function contentDisposition(type, filename) {
  var name = String(filename || 'datei');
  var ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return type + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name);
}

module.exports = { pad: pad, today: today, addDays: addDays, isDate: isDate, toInt: toInt, contentDisposition: contentDisposition };
