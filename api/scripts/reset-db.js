// deletes the sqlite file and creates it again with demo data
const fs = require('fs');
const db = require('../db');

if (db.DB_FILE !== ':memory:') {
  [db.DB_FILE, db.DB_FILE + '-journal', db.DB_FILE + '-wal', db.DB_FILE + '-shm'].forEach(function (f) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}

db.open();
require('../seed/seed').seed();
db.close();
console.log('[db] reset done: ' + db.DB_FILE);
