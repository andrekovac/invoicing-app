// small lint for the api, no extra packages:
//   npm run lint          (from the root or from api/)
// errors (exit 1): syntax errors in .js, non-erasable typescript in src/v2 (enum, namespace,
// parameter properties: node only strips types), gaps or doubles in the migration numbers.
// warnings (exit 0): tabs, trailing spaces, console.log in routes/services/lib (use lib/logger)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('module');

const ROOT = path.join(__dirname, '..');
const SKIP = ['node_modules', 'data', '.angular', 'coverage'];
const NO_CONSOLE = ['routes', 'services', 'lib'];
const CONSOLE_OK = ['lib/logger.js'];

const errors = [];
const warnings = [];

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (SKIP.indexOf(e.name) !== -1 || e.name.startsWith('.')) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(js|ts)$/.test(e.name)) out.push(full);
  });
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function checkJs(file, src) {
  // the admin-old files are browser scripts, the rest is commonjs
  const code = rel(file).startsWith('legacy/') ? src : '(function (exports, require, module, __filename, __dirname) {' + src + '\n})';
  try {
    new vm.Script(code.replace(/^#!.*/, ''), { filename: file });
  } catch (err) {
    errors.push(rel(file) + ': ' + err.message);
  }
}

function checkTs(file, src) {
  if (typeof nodeModule.stripTypeScriptTypes !== 'function') return;
  try {
    nodeModule.stripTypeScriptTypes(src, { mode: 'strip' });
  } catch (err) {
    errors.push(rel(file) + ': ' + String(err.message).split('\n')[0]);
  }
}

function checkStyle(file, src) {
  const name = rel(file);
  const lines = src.split(/\r?\n/);
  let tabs = 0;
  let trailing = 0;
  lines.forEach(function (line, i) {
    if (/^\t/.test(line)) tabs++;
    if (/[ \t]+$/.test(line)) trailing++;
    if (NO_CONSOLE.indexOf(name.split('/')[0]) !== -1 && CONSOLE_OK.indexOf(name) === -1 && /\bconsole\.log\(/.test(line)) {
      warnings.push(name + ':' + (i + 1) + ' console.log, use lib/logger');
    }
  });
  if (tabs) warnings.push(name + ': ' + tabs + ' lines start with a tab');
  if (trailing) warnings.push(name + ': ' + trailing + ' lines with trailing spaces');
}

function checkMigrations() {
  const files = fs.readdirSync(path.join(ROOT, 'migrations')).filter(function (f) { return /\.sql$/.test(f); }).sort();
  files.forEach(function (f, i) {
    const m = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(f);
    if (!m) return errors.push('migrations/' + f + ': name must be NNN_some_name.sql');
    if (Number(m[1]) !== i + 1) errors.push('migrations/' + f + ': expected number ' + String(i + 1).padStart(3, '0'));
  });
  return files.length;
}

const files = walk(ROOT, []);
files.forEach(function (file) {
  const src = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.ts')) checkTs(file, src);
  else checkJs(file, src);
  checkStyle(file, src);
});
const migrations = checkMigrations();

warnings.forEach(function (w) { console.log('warn  ' + w); });
errors.forEach(function (e) { console.log('error ' + e); });
console.log('[lint] ' + files.length + ' files, ' + migrations + ' migrations, ' + errors.length + ' errors, ' + warnings.length + ' warnings');
process.exitCode = errors.length ? 1 : 0;
