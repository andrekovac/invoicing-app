// feature flags from the feature_flags table.
//   flags.isOn(accountId, 'NEW_PDF_LAYOUT')
// lookup order: row for the account, row for account 0 (all accounts), default below.
// FLAGS_ON=NAME1,NAME2 in the environment switches flags on everywhere (local testing)
const db = require('../db');

const KNOWN = {
  NEW_PDF_LAYOUT: { default: false, label: 'Neues PDF-Layout (Logo-Zeile, Spalten)' }
};

function envOn() {
  return String(process.env.FLAGS_ON || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function isKnown(name) {
  return Object.prototype.hasOwnProperty.call(KNOWN, name);
}

function isOn(accountId, name) {
  if (envOn().indexOf(name) !== -1) return true;
  var rows = db.open().prepare('SELECT account_id, enabled FROM feature_flags WHERE name = ? AND account_id IN (?, 0)').all(name, Number(accountId) || 0);
  var own = rows.find(function (r) { return r.account_id === Number(accountId); });
  if (own) return !!own.enabled;
  var all = rows.find(function (r) { return r.account_id === 0; });
  if (all) return !!all.enabled;
  return isKnown(name) ? KNOWN[name].default : false;
}

// all known flags with their value for one account
function list(accountId) {
  return Object.keys(KNOWN).sort().map(function (name) {
    var own = db.open().prepare('SELECT enabled, updated_at FROM feature_flags WHERE name = ? AND account_id = ?').get(name, accountId);
    return {
      name: name,
      label: KNOWN[name].label,
      enabled: isOn(accountId, name),
      default: KNOWN[name].default,
      overridden: !!own,
      updated_at: own ? own.updated_at : null
    };
  });
}

function set(accountId, name, enabled, userId) {
  if (!isKnown(name)) {
    var err = new Error('unbekanntes Flag ' + name);
    err.status = 400;
    throw err;
  }
  db.open().prepare('INSERT INTO feature_flags (name, account_id, enabled, updated_by, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\')) ' +
    'ON CONFLICT (name, account_id) DO UPDATE SET enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
    .run(name, Number(accountId) || 0, enabled ? 1 : 0, userId || null);
  return isOn(accountId, name);
}

// back to the default
function reset(accountId, name) {
  db.open().prepare('DELETE FROM feature_flags WHERE name = ? AND account_id = ?').run(name, Number(accountId) || 0);
}

module.exports = { KNOWN: KNOWN, isOn: isOn, list: list, set: set, reset: reset, isKnown: isKnown };
