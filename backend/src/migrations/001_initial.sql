CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apple_contact_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  preferred_name TEXT,
  company TEXT,
  title TEXT,
  field TEXT,
  context TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  raw_source_data TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_synced_from_contacts_at TEXT
);

CREATE INDEX idx_people_name ON people(full_name COLLATE NOCASE);
CREATE INDEX idx_people_company ON people(company COLLATE NOCASE);
CREATE INDEX idx_people_field ON people(field COLLATE NOCASE);

CREATE TABLE contact_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(person_id, type, value COLLATE NOCASE)
);

CREATE INDEX idx_contact_methods_value ON contact_methods(value COLLATE NOCASE);

CREATE TABLE organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL DEFAULT 'other',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE person_organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'affiliated_with',
  title TEXT,
  start_date TEXT,
  end_date TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  UNIQUE(person_id, organization_id, relationship_type)
);

CREATE TABLE introductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  to_person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  context TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_person_id, to_person_id)
);

CREATE TABLE affiliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE person_affiliations (
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  affiliation_id INTEGER NOT NULL REFERENCES affiliations(id) ON DELETE CASCADE,
  PRIMARY KEY(person_id, affiliation_id)
);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  summary TEXT
);

CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  conflict_type TEXT NOT NULL DEFAULT 'field',
  incoming_name TEXT NOT NULL,
  incoming_person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  possible_person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  field TEXT,
  incoming_value TEXT,
  existing_value TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolution TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX idx_sync_conflicts_status ON sync_conflicts(status);

CREATE TABLE import_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  source_file TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  matched_person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sync_run_id, source_file, row_number)
);

CREATE TRIGGER people_updated_at
AFTER UPDATE ON people
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE people SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER contact_methods_updated_at
AFTER UPDATE ON contact_methods
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE contact_methods SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
