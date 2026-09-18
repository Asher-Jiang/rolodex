import type { RolodexDatabase } from './db.js';

export type OverrideField =
  | 'company'
  | 'field'
  | 'context'
  | 'notes'
  | 'affiliations'
  | 'contact_email'
  | 'contact_phone'
  | 'contact_other';

export function getOverrides(db: RolodexDatabase, personId: number): Set<string> {
  return new Set((db.prepare('SELECT field FROM person_field_overrides WHERE person_id = ?').all(personId) as Array<{ field: string }>).map((row) => row.field));
}

export function markOverrides(db: RolodexDatabase, personId: number, fields: Iterable<string>, source = 'dashboard'): void {
  const upsert = db.prepare(`
    INSERT INTO person_field_overrides (person_id, field, source) VALUES (?, ?, ?)
    ON CONFLICT(person_id, field) DO UPDATE SET source = excluded.source, updated_at = CURRENT_TIMESTAMP
  `);
  for (const field of new Set(fields)) upsert.run(personId, field, source);
}
