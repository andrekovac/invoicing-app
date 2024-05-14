-- feature flags. account_id 0 = default for all accounts, a row per account overrides it
CREATE TABLE feature_flags (
  name TEXT NOT NULL,
  account_id INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (name, account_id)
);
