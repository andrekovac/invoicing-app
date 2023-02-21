// small logger. same "[scope] text" lines as before, so grep on the server logs still works.
//   const log = require('../lib/logger')('payments');
//   log.info('charge ok', { invoice: 'RE-2023-0012', amount: 119 });
//   -> [payments] charge ok invoice=RE-2023-0012 amount=119
// LOG_LEVEL=verbose|info|warn|error|silent (default info), LOG_FORMAT=json for one json object per line

const LEVELS = { verbose: 10, info: 20, warn: 30, error: 40, silent: 100 };

function currentLevel() {
  const name = String(process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[name] !== undefined ? LEVELS[name] : LEVELS.info;
}

function formatValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return /[\s"=]/.test(s) ? JSON.stringify(s) : s;
}

function formatFields(fields) {
  if (!fields) return '';
  return Object.keys(fields)
    .filter(function (k) { return fields[k] !== undefined; })
    .map(function (k) { return k + '=' + formatValue(fields[k]); })
    .join(' ');
}

function line(scope, level, msg, fields) {
  if (process.env.LOG_FORMAT === 'json') {
    const out = { time: new Date().toISOString(), level: level, scope: scope, msg: msg };
    if (fields) Object.keys(fields).forEach(function (k) { out[k] = fields[k]; });
    return JSON.stringify(out);
  }
  const rest = formatFields(fields);
  return '[' + scope + '] ' + msg + (rest ? ' ' + rest : '');
}

function create(scope) {
  function write(level, msg, fields) {
    if (LEVELS[level] < currentLevel()) return;
    let err = null;
    if (fields instanceof Error) {
      err = fields;
      fields = null;
    } else if (fields && fields.err instanceof Error) {
      err = fields.err;
      fields = Object.assign({}, fields);
      delete fields.err;
    }
    const text = line(scope, level, msg, fields);
    if (level === 'error' || level === 'warn') {
      console.error(text);
      if (err && process.env.LOG_FORMAT !== 'json') console.error(err.stack || err);
    } else {
      console.log(text);
    }
  }
  return {
    scope: scope,
    verbose: function (msg, fields) { write('verbose', msg, fields); },
    info: function (msg, fields) { write('info', msg, fields); },
    warn: function (msg, fields) { write('warn', msg, fields); },
    error: function (msg, fields) { write('error', msg, fields); },
    child: function (sub) { return create(scope + ':' + sub); }
  };
}

module.exports = create;
module.exports.LEVELS = LEVELS;
module.exports.formatFields = formatFields;
module.exports.line = line;
