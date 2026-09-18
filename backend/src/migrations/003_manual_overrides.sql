CREATE TABLE person_field_overrides (
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'dashboard',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (person_id, field)
);

CREATE INDEX idx_person_field_overrides_person ON person_field_overrides(person_id);
