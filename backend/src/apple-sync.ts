import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeOrganization, fieldFromRole, parseContactNotes, type MetadataCatalog } from './contact-metadata.js';
import type { RolodexDatabase } from './db.js';
import { getOverrides } from './overrides.js';
import type { AppleContact } from './types.js';
import { diceSimilarity, normalizeContactLabel, normalizeEmail, normalizeName, normalizePhone } from './utils.js';

export type SyncSummary = {
  total: number;
  created: number;
  matched: number;
  updated: number;
  conflicts: number;
  runId: number;
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function readAppleContacts(): Promise<AppleContact[]> {
  const scriptPath = path.resolve(moduleDir, '../../scripts/apple-contacts.js');
  return new Promise((resolve, reject) => {
    const child = spawn('osascript', ['-l', 'JavaScript', scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = stderr.trim();
        const hint = /not authorized|not permitted|(-1743)/i.test(detail)
          ? 'Allow Terminal to control Contacts in System Settings → Privacy & Security → Automation, then try again.'
          : detail;
        return reject(new Error(hint || `Contacts helper exited with code ${code}.`));
      }
      try { resolve(JSON.parse(stdout) as AppleContact[]); }
      catch { reject(new Error('The Contacts helper returned invalid data.')); }
    });
  });
}

function addFieldConflict(db: RolodexDatabase, personId: number, contact: AppleContact, field: 'company', incoming: string, existing: string): number {
  const duplicate = db.prepare(`
    SELECT 1 FROM sync_conflicts WHERE source = 'apple_contacts' AND possible_person_id = ? AND field = ?
      AND incoming_value = ? AND existing_value = ? AND status = 'pending'
  `).get(personId, field, incoming, existing);
  if (duplicate) return 0;
  db.prepare(`
    INSERT INTO sync_conflicts (source, conflict_type, incoming_name, possible_person_id, field, incoming_value, existing_value)
    VALUES ('apple_contacts', 'field', ?, ?, ?, ?, ?)
  `).run(contact.fullName, personId, field, incoming, existing);
  return 1;
}

function appendAppleSource(db: RolodexDatabase, personId: number, contact: AppleContact): void {
  const row = db.prepare('SELECT raw_source_data FROM people WHERE id = ?').get(personId) as { raw_source_data: string | null };
  let data: { appleContacts?: AppleContact | AppleContact[] } = {};
  try { data = row.raw_source_data ? JSON.parse(row.raw_source_data) : {}; } catch { data = {}; }
  const contacts = Array.isArray(data.appleContacts)
    ? data.appleContacts
    : data.appleContacts ? [data.appleContacts] : [];
  const existingIndex = contacts.findIndex((item) => item.identifier === contact.identifier);
  if (existingIndex >= 0) contacts[existingIndex] = contact;
  else contacts.push(contact);
  data.appleContacts = contacts;
  db.prepare('UPDATE people SET raw_source_data = ? WHERE id = ?').run(JSON.stringify(data), personId);
}

function metadataCatalog(db: RolodexDatabase): MetadataCatalog {
  const values = (sql: string, column: string) => (db.prepare(sql).all() as Array<Record<string, string>>).map((row) => row[column]);
  return {
    companies: values(`
      SELECT DISTINCT json_extract(raw_json, '$.Company') AS company
      FROM import_rows
      WHERE json_extract(raw_json, '$.Company') IS NOT NULL
        AND trim(json_extract(raw_json, '$.Company')) != ''
      UNION SELECT 'Jane Street' AS company
    `, 'company'),
    fields: values(`SELECT DISTINCT field FROM people WHERE field IS NOT NULL AND trim(field) != ''`, 'field'),
    affiliations: values(`SELECT name FROM affiliations`, 'name'),
  };
}

type PersonRow = {
  id: number;
  apple_contact_id: string | null;
  full_name: string;
  company: string | null;
  field: string | null;
  context: string | null;
};

function methodKey(type: string, value: string): string | null {
  if (type === 'email') {
    const email = normalizeEmail(value);
    return email ? `email:${email}` : null;
  }
  if (type === 'phone') {
    const phone = normalizePhone(value);
    return phone ? `phone:${phone}` : null;
  }
  return null;
}

function contactMethodKeys(contact: AppleContact): string[] {
  return [
    ...contact.emails.map((item) => methodKey('email', item.value)),
    ...contact.phones.map((item) => methodKey('phone', item.value)),
  ].filter((key): key is string => key !== null);
}

/* Every incoming contact is matched against every person and contact method, so
   both tables are read once per run and then kept current as the run inserts
   rows. Ties keep the lowest row id, so a contact still matches the oldest
   candidate the way a plain table scan did. */
function createMatchIndex(db: RolodexDatabase) {
  const people = db.prepare('SELECT id, apple_contact_id, full_name, company, field, context FROM people').all() as PersonRow[];
  const byId = new Map(people.map((person) => [person.id, person]));
  const byAppleId = new Map<string, PersonRow>();
  const byName = new Map<string, PersonRow>();
  const byMethod = new Map<string, { methodId: number; personId: number }>();

  function remember(map: Map<string, PersonRow>, key: string | null, person: PersonRow): void {
    if (key && !map.has(key)) map.set(key, person);
  }

  function addMethod(methodId: number, personId: number, type: string, value: string): void {
    const key = methodKey(type, value);
    if (!key) return;
    const existing = byMethod.get(key);
    if (!existing || methodId < existing.methodId) byMethod.set(key, { methodId, personId });
  }

  function addPerson(person: PersonRow): void {
    people.push(person);
    byId.set(person.id, person);
    remember(byAppleId, person.apple_contact_id, person);
    remember(byName, normalizeName(person.full_name), person);
  }

  for (const person of people) {
    remember(byAppleId, person.apple_contact_id, person);
    remember(byName, normalizeName(person.full_name), person);
  }
  const methods = db.prepare('SELECT id, person_id, type, value FROM contact_methods ORDER BY id').all() as Array<{
    id: number; person_id: number; type: string; value: string;
  }>;
  for (const method of methods) addMethod(method.id, method.person_id, method.type, method.value);

  return {
    /* Every known person, in insertion order, for fuzzy-name comparison. */
    people,
    addMethod,
    addPerson,
    linkAppleId(person: PersonRow, identifier: string): void {
      person.apple_contact_id = identifier;
      remember(byAppleId, identifier, person);
    },
    match(contact: AppleContact): PersonRow | undefined {
      const known = byAppleId.get(contact.identifier);
      if (known) return known;
      let closest: { methodId: number; personId: number } | undefined;
      for (const key of contactMethodKeys(contact)) {
        const hit = byMethod.get(key);
        if (hit && (!closest || hit.methodId < closest.methodId)) closest = hit;
      }
      if (closest) return byId.get(closest.personId);
      return byName.get(normalizeName(contact.fullName));
    },
  };
}

function addAffiliations(db: RolodexDatabase, personId: number, names: string[]): number {
  const insertName = db.prepare('INSERT OR IGNORE INTO affiliations (name) VALUES (?)');
  const findName = db.prepare('SELECT id FROM affiliations WHERE name = ? COLLATE NOCASE');
  const link = db.prepare('INSERT OR IGNORE INTO person_affiliations (person_id, affiliation_id) VALUES (?, ?)');
  let changes = 0;
  for (const name of names) {
    insertName.run(name);
    const affiliation = findName.get(name) as { id: number };
    changes += link.run(personId, affiliation.id).changes;
  }
  return changes;
}

export function syncAppleContacts(db: RolodexDatabase, contacts: AppleContact[]): SyncSummary {
  const run = db.prepare(`INSERT INTO sync_runs (source) VALUES ('apple_contacts')`).run();
  const runId = Number(run.lastInsertRowid);
  const summary: SyncSummary = { total: contacts.length, created: 0, matched: 0, updated: 0, conflicts: 0, runId };
  const catalog = metadataCatalog(db);
  const index = createMatchIndex(db);
  const insertMethod = db.prepare(`
    INSERT OR IGNORE INTO contact_methods (person_id, type, value, label, source) VALUES (?, ?, ?, ?, 'apple_contacts')
  `);

  try {
    db.transaction(() => {
      for (const contact of contacts) {
        const updatesBeforeContact = summary.updated;
        const organization = canonicalizeOrganization(contact.organizationName);
        const noteMetadata = parseContactNotes(contact.notes ?? '', catalog);
        const incomingCompany = organization.company || noteMetadata.company;
        const incomingField = organization.field || noteMetadata.field || fieldFromRole(contact.jobTitle, incomingCompany);
        const incomingContext = noteMetadata.context;
        const incomingAffiliations = [...organization.affiliations, ...noteMetadata.affiliations];
        let person = index.match(contact);
        let manualOverrides = new Set<string>();

        if (!person) {
          // A close-but-inexact name goes to the review queue instead of merging silently.
          const uncertainMatch = index.people
            .map((item) => ({ person: item, score: diceSimilarity(item.full_name, contact.fullName) }))
            .filter((item) => item.score >= 0.86)
            .sort((a, b) => b.score - a.score)[0]?.person;
          const result = db.prepare(`
            INSERT INTO people (apple_contact_id, full_name, company, field, context, source, last_synced_from_contacts_at, raw_source_data)
            VALUES (?, ?, ?, ?, ?, 'apple_contacts', CURRENT_TIMESTAMP, ?)
          `).run(contact.identifier, contact.fullName, incomingCompany, incomingField, incomingContext, JSON.stringify({ appleContacts: contact }));
          person = {
            id: Number(result.lastInsertRowid), apple_contact_id: contact.identifier, full_name: contact.fullName,
            company: incomingCompany, field: incomingField, context: incomingContext,
          };
          index.addPerson(person);
          summary.created += 1;
          if (uncertainMatch) {
            db.prepare(`
              INSERT INTO sync_conflicts (source, conflict_type, incoming_name, incoming_person_id, possible_person_id, field, incoming_value, existing_value)
              VALUES ('apple_contacts', 'possible_duplicate', ?, ?, ?, 'full_name', ?, ?)
            `).run(contact.fullName, person.id, uncertainMatch.id, contact.fullName, uncertainMatch.full_name);
            summary.conflicts += 1;
          }
        } else {
          summary.matched += 1;
          manualOverrides = getOverrides(db, person.id);
          db.prepare(`
            UPDATE people SET apple_contact_id = COALESCE(apple_contact_id, ?), last_synced_from_contacts_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(contact.identifier, person.id);
          if (!person.apple_contact_id) index.linkAppleId(person, contact.identifier);
          const existingCompany = person.company ?? '';
          if (!manualOverrides.has('company') && incomingCompany && !existingCompany) {
            db.prepare(`UPDATE people SET company = ? WHERE id = ?`).run(incomingCompany, person.id);
            person.company = incomingCompany;
            summary.updated += 1;
          } else if (!manualOverrides.has('company') && incomingCompany && existingCompany && incomingCompany.toLowerCase() !== existingCompany.toLowerCase()) {
            summary.conflicts += addFieldConflict(db, person.id, contact, 'company', incomingCompany, existingCompany);
          }
          if (!manualOverrides.has('field') && incomingField && !person.field) {
            db.prepare(`UPDATE people SET field = ? WHERE id = ?`).run(incomingField, person.id);
            person.field = incomingField;
            summary.updated += 1;
          }
          if (!manualOverrides.has('context') && incomingContext && !person.context) {
            db.prepare(`UPDATE people SET context = ? WHERE id = ?`).run(incomingContext, person.id);
            person.context = incomingContext;
            summary.updated += 1;
          }
        }

        const addMethod = (type: 'email' | 'phone', value: string, label: string) => {
          const inserted = insertMethod.run(person.id, type, value, normalizeContactLabel(label, type));
          if (!inserted.changes) return;
          index.addMethod(Number(inserted.lastInsertRowid), person.id, type, value);
          summary.updated += inserted.changes;
        };
        if (!manualOverrides.has('contact_email')) {
          for (const email of contact.emails) addMethod('email', email.value, email.label);
        }
        if (!manualOverrides.has('contact_phone')) {
          for (const phone of contact.phones) addMethod('phone', phone.value, phone.label);
        }
        if (!manualOverrides.has('affiliations')) summary.updated += addAffiliations(db, person.id, incomingAffiliations);
        appendAppleSource(db, person.id, contact);

        /* Emails, phones, and affiliations live in other tables, and the
           people_updated_at trigger only watches this table's detail columns
           (migration 005), so a person the sync actually changed is stamped
           here. People it merely re-read keep their place in the list. */
        if (summary.updated > updatesBeforeContact) {
          db.prepare('UPDATE people SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(person.id);
        }
      }
    })();
    db.prepare(`UPDATE sync_runs SET finished_at = CURRENT_TIMESTAMP, status = 'completed', summary = ? WHERE id = ?`)
      .run(JSON.stringify(summary), runId);
    return summary;
  } catch (error) {
    db.prepare(`UPDATE sync_runs SET finished_at = CURRENT_TIMESTAMP, status = 'failed', summary = ? WHERE id = ?`)
      .run(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), runId);
    throw error;
  }
}
