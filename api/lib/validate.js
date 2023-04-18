// input checks shared by the routes. each check returns a value or a problem,
// check() collects the problems of a whole body: [{ field, message }]
const utils = require('./utils');

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function isEmail(s) {
  return typeof s === 'string' && s.length <= 254 && EMAIL.test(s);
}

function isDate(s) {
  return utils.isDate(s);
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

// integer from a query string or body, def when empty, NaN when wrong or out of range
function int(v, opts) {
  opts = opts || {};
  if (isBlank(v)) return opts.def !== undefined ? opts.def : NaN;
  if (!/^-?\d+$/.test(String(v).trim())) return NaN;
  const n = parseInt(v, 10);
  if (opts.min !== undefined && n < opts.min) return NaN;
  if (opts.max !== undefined && n > opts.max) return NaN;
  return n;
}

function oneOf(v, list, def) {
  if (isBlank(v)) return def;
  return list.indexOf(v) !== -1 ? v : undefined;
}

function text(v, max) {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  return max && s.length > max ? undefined : s;
}

// rules: { email: { email: true }, name: { required: true, max: 200 }, due_date: { date: true } }
function check(body, rules) {
  body = body || {};
  const problems = [];
  Object.keys(rules).forEach(function (field) {
    const r = rules[field];
    const v = body[field];
    if (isBlank(v)) {
      if (r.required) problems.push({ field: field, message: r.label ? r.label + ' fehlt' : 'fehlt' });
      return;
    }
    if (r.max && String(v).length > r.max) problems.push({ field: field, message: 'zu lang (max. ' + r.max + ' Zeichen)' });
    if (r.email && !isEmail(String(v).trim())) problems.push({ field: field, message: 'E-Mail ungültig' });
    if (r.date && !isDate(v)) problems.push({ field: field, message: 'Datum ungültig' });
    if (r.int && isNaN(int(v, r.int === true ? {} : r.int))) problems.push({ field: field, message: 'Zahl ungültig' });
    if (r.in && r.in.indexOf(v) === -1) problems.push({ field: field, message: 'Wert ungültig' });
  });
  return problems;
}

module.exports = { EMAIL, isEmail, isDate, isBlank, int, oneOf, text, check };
