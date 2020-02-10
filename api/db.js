// sqlite connection + migrations
// one connection for the whole process, node:sqlite is sync so no pool needed
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.APP_DB_FILE || path.join(__dirname, 'data', 'app.db');
const MIGRATIONS = path.join(__dirname, 'migrations');

let conn = null;
let isNew = false;

function open() {
  if (conn) return conn;
  if (DB_FILE !== ':memory:') {
    isNew = !fs.existsSync(DB_FILE);
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  } else {
    isNew = true;
  }
  conn = new DatabaseSync(DB_FILE);
  conn.exec('PRAGMA foreign_keys = ON');
  migrate(conn);
  return conn;
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  var done = db.prepare('SELECT name FROM migrations').all().map(function (r) { return r.name; });
  var files = fs.readdirSync(MIGRATIONS).filter(function (f) { return /\.sql$/.test(f); }).sort();

  files.forEach(function (file) {
    if (done.indexOf(file) !== -1) return;
    var sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      db.exec('COMMIT');
      if (DB_FILE !== ':memory:') console.log('[db] migrated ' + file);
    } catch (err) {
      db.exec('ROLLBACK');
      err.message = 'migration ' + file + ': ' + err.message;
      throw err;
    }
  });
}

function wasCreated() {
  return isNew;
}

function close() {
  if (conn) conn.close();
  conn = null;
}

module.exports = { open: open, close: close, migrate: migrate, wasCreated: wasCreated, DB_FILE: DB_FILE };
