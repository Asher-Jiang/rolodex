import type { RolodexDatabase } from './db.js';
import { markOverrides } from './overrides.js';
import type { ContactMethodInput, PersonInput } from './types.js';
import { cleanString, normalizeName, nullable, uniqueStrings } from './utils.js';

const editableColumns: Record<string, string> = {
  company: 'company',
  field: 'field',
  context: 'context',
  notes: 'notes',
  full_name: 'full_name',
  preferred_name: 'preferred_name',
};

export function listPeople(db: RolodexDatabase, query: Record<string, unknown>) {
  const search = cleanString(query.search);
  const company = cleanString(query.company);
  const field = cleanString(query.field);
  const affiliation = cleanString(query.affiliation);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    const like = `%${search}%`;
    conditions.push(`(
      p.full_name LIKE ? COLLATE NOCASE OR p.preferred_name LIKE ? COLLATE NOCASE OR
      p.company LIKE ? COLLATE NOCASE OR p.field LIKE ? COLLATE NOCASE OR p.context LIKE ? COLLATE NOCASE OR
      p.notes LIKE ? COLLATE NOCASE OR
      EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.person_id = p.id AND cm.value LIKE ? COLLATE NOCASE) OR
      EXISTS (SELECT 1 FROM person_affiliations pa JOIN affiliations a ON a.id = pa.affiliation_id WHERE pa.person_id = p.id AND a.name LIKE ? COLLATE NOCASE) OR
      EXISTS (
        SELECT 1 FROM introductions i JOIN people introducer ON introducer.id = i.from_person_id
        WHERE i.to_person_id = p.id AND ('introduced by ' || introducer.full_name) LIKE ? COLLATE NOCASE
      ) OR
      EXISTS (
        SELECT 1 FROM introductions i JOIN people introduced ON introduced.id = i.to_person_id
        WHERE i.from_person_id = p.id AND introduced.full_name LIKE ? COLLATE NOCASE
      )
    )`);
    params.push(like, like, like, like, like, like, like, like, like, like);
  }
  if (company) {
    conditions.push('p.company = ? COLLATE NOCASE');
    params.push(company);
  }
  if (field) {
    conditions.push('p.field = ? COLLATE NOCASE');
    params.push(field);
  }
  if (affiliation) {
    conditions.push(`EXISTS (
      SELECT 1 FROM person_affiliations pa JOIN affiliations a ON a.id = pa.affiliation_id
      WHERE pa.person_id = p.id AND a.name = ? COLLATE NOCASE
    )`);
    params.push(affiliation);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`
    SELECT p.id, p.full_name AS fullName, p.preferred_name AS preferredName,
      p.company, p.field, p.notes, p.source, p.updated_at AS updatedAt,
      (SELECT GROUP_CONCAT(value, ' • ') FROM (
        SELECT cm.value FROM contact_methods cm WHERE cm.person_id = p.id
        ORDER BY CASE cm.type WHEN 'phone' THEN 0 WHEN 'email' THEN 1 ELSE 2 END, cm.id LIMIT 3
      )) AS contactSummary,
      (SELECT GROUP_CONCAT(name, ', ') FROM (
        SELECT a.name FROM person_affiliations pa JOIN affiliations a ON a.id = pa.affiliation_id
        WHERE pa.person_id = p.id ORDER BY a.name
      )) AS affiliations,
      (SELECT GROUP_CONCAT(full_name, ', ') FROM (
        SELECT introducer.full_name FROM introductions i JOIN people introducer ON introducer.id = i.from_person_id
        WHERE i.to_person_id = p.id ORDER BY introducer.full_name
      )) AS introducedBy
    FROM people p
    ${where}
    ORDER BY p.updated_at DESC, p.full_name COLLATE NOCASE
  `).all(...params);
}

export function getPerson(db: RolodexDatabase, id: number) {
  const person = db.prepare(`
    SELECT id, full_name AS fullName, preferred_name AS preferredName, company,
      field, context, notes, source, apple_contact_id AS appleContactId,
      created_at AS createdAt, updated_at AS updatedAt,
      last_synced_from_contacts_at AS lastSyncedFromContactsAt, raw_source_data AS rawSourceData
    FROM people WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined;
  if (!person) return null;

  let parsedRawSourceData: unknown = null;
  try { parsedRawSourceData = person.rawSourceData ? JSON.parse(String(person.rawSourceData)) : null; } catch { parsedRawSourceData = person.rawSourceData; }
  delete person.rawSourceData;
  return {
    ...person,
    rawSourceData: parsedRawSourceData,
    contactMethods: db.prepare(`
      SELECT id, type, value, label, source FROM contact_methods WHERE person_id = ?
      ORDER BY CASE type WHEN 'phone' THEN 0 WHEN 'email' THEN 1 ELSE 2 END, id
    `).all(id),
    affiliations: db.prepare(`
      SELECT a.id, a.name FROM person_affiliations pa JOIN affiliations a ON a.id = pa.affiliation_id
      WHERE pa.person_id = ? ORDER BY a.name
    `).all(id),
    introducedBy: db.prepare(`
      SELECT p.id, p.full_name AS fullName, i.context FROM introductions i JOIN people p ON p.id = i.from_person_id
      WHERE i.to_person_id = ? ORDER BY p.full_name
    `).all(id),
    introducedTo: db.prepare(`
      SELECT p.id, p.full_name AS fullName, i.context FROM introductions i JOIN people p ON p.id = i.to_person_id
      WHERE i.from_person_id = ? ORDER BY p.full_name
    `).all(id),
  };
}

function replaceContactMethods(db: RolodexDatabase, personId: number, methods: ContactMethodInput[]): void {
  db.prepare('DELETE FROM contact_methods WHERE person_id = ?').run(personId);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO contact_methods (person_id, type, value, label, source) VALUES (?, ?, ?, ?, ?)
  `);
  for (const method of methods) {
    const value = cleanString(method.value);
    if (!value) continue;
    insert.run(personId, cleanString(method.type) || 'other', value, nullable(method.label), method.source || 'manual');
  }
}

function normalizedValues(values: string[]): string[] {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean).sort();
}

function sameValues(left: string[], right: string[]): boolean {
  return JSON.stringify(normalizedValues(left)) === JSON.stringify(normalizedValues(right));
}

function contactOverrideFields(before: ContactMethodInput[], after: ContactMethodInput[]): string[] {
  const category = (method: ContactMethodInput) => method.type === 'email' ? 'contact_email' : method.type === 'phone' ? 'contact_phone' : 'contact_other';
  const signature = (method: ContactMethodInput) => `${method.type}:${method.value}:${method.label ?? ''}`;
  const changed: string[] = [];
  for (const field of ['contact_email', 'contact_phone', 'contact_other']) {
    const oldValues = before.filter((method) => category(method) === field).map(signature);
    const newValues = after.filter((method) => category(method) === field).map(signature);
    if (!sameValues(oldValues, newValues)) changed.push(field);
  }
  return changed;
}

export function setAffiliations(db: RolodexDatabase, personId: number, affiliations: string[]): void {
  db.prepare('DELETE FROM person_affiliations WHERE person_id = ?').run(personId);
  const insertAffiliation = db.prepare('INSERT OR IGNORE INTO affiliations (name) VALUES (?)');
  const findAffiliation = db.prepare('SELECT id FROM affiliations WHERE name = ? COLLATE NOCASE');
  const link = db.prepare('INSERT OR IGNORE INTO person_affiliations (person_id, affiliation_id) VALUES (?, ?)');
  for (const name of uniqueStrings(affiliations.map(cleanString))) {
    insertAffiliation.run(name);
    const row = findAffiliation.get(name) as { id: number };
    link.run(personId, row.id);
  }
}

function replaceIntroductions(db: RolodexDatabase, personId: number, introducedToIds: number[], introducedByIds: number[]): void {
  db.prepare('DELETE FROM introductions WHERE from_person_id = ? OR to_person_id = ?').run(personId, personId);
  const insert = db.prepare(`INSERT OR IGNORE INTO introductions (from_person_id, to_person_id, source) VALUES (?, ?, 'manual')`);
  for (const targetId of introducedToIds) if (targetId !== personId) insert.run(personId, targetId);
  for (const sourceId of introducedByIds) if (sourceId !== personId) insert.run(sourceId, personId);
}

function relationIdsFromNames(db: RolodexDatabase, names: string[]): number[] {
  const people = db.prepare('SELECT id, full_name FROM people').all() as Array<{ id: number; full_name: string }>;
  const byName = new Map(people.map((person) => [normalizeName(person.full_name), person.id]));
  const ids: number[] = [];
  for (const name of uniqueStrings(names.map(cleanString))) {
    let id = byName.get(normalizeName(name));
    if (!id) {
      const result = db.prepare(`INSERT INTO people (full_name, source) VALUES (?, 'manual-reference')`).run(name);
      id = Number(result.lastInsertRowid);
      byName.set(normalizeName(name), id);
    }
    ids.push(id);
  }
  return ids;
}

function relationIds(db: RolodexDatabase, input: PersonInput, direction: 'to' | 'by'): number[] {
  const names = direction === 'to' ? input.introducedToNames : input.introducedByNames;
  if (names) return relationIdsFromNames(db, names);
  return direction === 'to' ? (input.introducedToIds ?? []) : (input.introducedByIds ?? []);
}

export function createPerson(db: RolodexDatabase, input: PersonInput): number {
  const fullName = cleanString(input.fullName);
  if (!fullName) throw new Error('Name is required.');
  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO people (full_name, preferred_name, company, field, context, notes, source)
      VALUES (?, ?, ?, ?, ?, ?, 'manual')
    `).run(fullName, nullable(input.preferredName), nullable(input.company), nullable(input.field), nullable(input.context), nullable(input.notes));
    const id = Number(result.lastInsertRowid);
    replaceContactMethods(db, id, input.contactMethods ?? []);
    setAffiliations(db, id, input.affiliations ?? []);
    replaceIntroductions(db, id, relationIds(db, input, 'to'), relationIds(db, input, 'by'));
    const manualFields: string[] = [];
    for (const field of ['company', 'field', 'context', 'notes'] as const) if (cleanString(input[field])) manualFields.push(field);
    if (input.affiliations?.length) manualFields.push('affiliations');
    for (const method of input.contactMethods ?? []) {
      manualFields.push(method.type === 'email' ? 'contact_email' : method.type === 'phone' ? 'contact_phone' : 'contact_other');
    }
    markOverrides(db, id, manualFields);
    return id;
  })();
}

export function updatePerson(db: RolodexDatabase, id: number, input: PersonInput): void {
  const fullName = cleanString(input.fullName);
  if (!fullName) throw new Error('Name is required.');
  db.transaction(() => {
    const before = db.prepare('SELECT company, field, context, notes FROM people WHERE id = ?').get(id) as Record<string, string | null> | undefined;
    if (!before) throw new Error('Person not found.');
    const beforeMethods = db.prepare('SELECT type, value, label, source FROM contact_methods WHERE person_id = ?').all(id) as ContactMethodInput[];
    const beforeAffiliations = (db.prepare(`
      SELECT a.name FROM person_affiliations pa JOIN affiliations a ON a.id = pa.affiliation_id WHERE pa.person_id = ?
    `).all(id) as Array<{ name: string }>).map((row) => row.name);
    const result = db.prepare(`
      UPDATE people SET full_name = ?, preferred_name = ?, company = ?, field = ?, context = ?, notes = ?
      WHERE id = ?
    `).run(fullName, nullable(input.preferredName), nullable(input.company), nullable(input.field), nullable(input.context), nullable(input.notes), id);
    if (!result.changes) throw new Error('Person not found.');
    replaceContactMethods(db, id, input.contactMethods ?? []);
    setAffiliations(db, id, input.affiliations ?? []);
    replaceIntroductions(db, id, relationIds(db, input, 'to'), relationIds(db, input, 'by'));
    const changedFields: string[] = [];
    for (const field of ['company', 'field', 'context', 'notes'] as const) {
      if ((before[field] ?? '').trim() !== cleanString(input[field])) changedFields.push(field);
    }
    if (!sameValues(beforeAffiliations, input.affiliations ?? [])) changedFields.push('affiliations');
    changedFields.push(...contactOverrideFields(beforeMethods, input.contactMethods ?? []));
    markOverrides(db, id, changedFields);
  })();
}

export function updatePersonField(db: RolodexDatabase, id: number, field: string, value: string | null): void {
  const column = editableColumns[field];
  if (!column) throw new Error(`Unsupported conflict field: ${field}`);
  db.prepare(`UPDATE people SET ${column} = ? WHERE id = ?`).run(value, id);
}

export function mergePeople(db: RolodexDatabase, sourceId: number, targetId: number): void {
  if (sourceId === targetId) throw new Error('Cannot merge a person into themselves.');
  db.transaction(() => {
    const source = db.prepare('SELECT * FROM people WHERE id = ?').get(sourceId) as Record<string, unknown> | undefined;
    const target = db.prepare('SELECT * FROM people WHERE id = ?').get(targetId) as Record<string, unknown> | undefined;
    if (!source || !target) throw new Error('Merge person not found.');

    for (const field of ['preferred_name', 'company', 'field', 'context', 'notes', 'apple_contact_id', 'last_synced_from_contacts_at']) {
      if (!target[field] && source[field]) db.prepare(`UPDATE people SET ${field} = ? WHERE id = ?`).run(source[field], targetId);
    }
    db.prepare(`
      INSERT OR IGNORE INTO contact_methods (person_id, type, value, label, source)
      SELECT ?, type, value, label, source FROM contact_methods WHERE person_id = ?
    `).run(targetId, sourceId);
    db.prepare(`
      INSERT OR IGNORE INTO person_affiliations (person_id, affiliation_id)
      SELECT ?, affiliation_id FROM person_affiliations WHERE person_id = ?
    `).run(targetId, sourceId);
    db.prepare(`
      INSERT OR IGNORE INTO introductions (from_person_id, to_person_id, context, source)
      SELECT ?, to_person_id, context, source FROM introductions WHERE from_person_id = ? AND to_person_id != ?
    `).run(targetId, sourceId, targetId);
    db.prepare(`
      INSERT OR IGNORE INTO introductions (from_person_id, to_person_id, context, source)
      SELECT from_person_id, ?, context, source FROM introductions WHERE to_person_id = ? AND from_person_id != ?
    `).run(targetId, sourceId, targetId);
    db.prepare('UPDATE import_rows SET matched_person_id = ? WHERE matched_person_id = ?').run(targetId, sourceId);
    db.prepare('UPDATE sync_conflicts SET incoming_person_id = ? WHERE incoming_person_id = ?').run(targetId, sourceId);
    db.prepare('UPDATE sync_conflicts SET possible_person_id = ? WHERE possible_person_id = ?').run(targetId, sourceId);
    db.prepare('DELETE FROM people WHERE id = ?').run(sourceId);
  })();
}

export function getFilters(db: RolodexDatabase) {
  const values = (column: 'company' | 'field') => (db.prepare(`
    SELECT DISTINCT ${column} AS value FROM people WHERE ${column} IS NOT NULL AND TRIM(${column}) != '' ORDER BY ${column} COLLATE NOCASE
  `).all() as Array<{ value: string }>).map((row) => row.value);
  return {
    companies: values('company'),
    fields: values('field'),
    affiliations: (db.prepare('SELECT name FROM affiliations ORDER BY name COLLATE NOCASE').all() as Array<{ name: string }>).map((row) => row.name),
  };
}
