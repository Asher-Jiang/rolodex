import type { RolodexDatabase } from './db.js';
import { markOverrides } from './overrides.js';
import { mergePeople, updatePersonField } from './people.js';

export function listConflicts(db: RolodexDatabase, status = 'pending') {
  return db.prepare(`
    SELECT c.id, c.source, c.conflict_type AS conflictType, c.incoming_name AS incomingName,
      c.incoming_person_id AS incomingPersonId, incoming.full_name AS incomingPersonName,
      c.possible_person_id AS possiblePersonId, possible.full_name AS possiblePersonName,
      c.field, c.incoming_value AS incomingValue, c.existing_value AS existingValue,
      c.status, c.resolution, c.created_at AS createdAt
    FROM sync_conflicts c
    LEFT JOIN people incoming ON incoming.id = c.incoming_person_id
    LEFT JOIN people possible ON possible.id = c.possible_person_id
    WHERE c.status = ?
    ORDER BY c.created_at DESC, c.id DESC
  `).all(status);
}

export function resolveConflict(db: RolodexDatabase, conflictId: number, action: string): void {
  const conflict = db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(conflictId) as {
    id: number;
    conflict_type: string;
    incoming_person_id: number | null;
    possible_person_id: number | null;
    field: string | null;
    incoming_value: string | null;
  } | undefined;
  if (!conflict) throw new Error('Conflict not found.');

  db.transaction(() => {
    if (action === 'merge') {
      if (conflict.conflict_type !== 'possible_duplicate' || !conflict.incoming_person_id || !conflict.possible_person_id) {
        throw new Error('This conflict cannot be merged.');
      }
      mergePeople(db, conflict.incoming_person_id, conflict.possible_person_id);
    } else if (action === 'accept_incoming') {
      if (!conflict.possible_person_id || !conflict.field) throw new Error('This conflict has no field to accept.');
      updatePersonField(db, conflict.possible_person_id, conflict.field, conflict.incoming_value);
      markOverrides(db, conflict.possible_person_id, [conflict.field], 'review');
    } else if (!['keep_existing', 'keep_separate', 'ignore'].includes(action)) {
      throw new Error('Unknown conflict action.');
    }
    if (['keep_existing', 'ignore'].includes(action) && conflict.possible_person_id && conflict.field) {
      markOverrides(db, conflict.possible_person_id, [conflict.field], 'review');
    }
    db.prepare(`
      UPDATE sync_conflicts SET status = 'resolved', resolution = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(action, conflictId);
  })();
}
