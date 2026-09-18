import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncAppleContacts } from './apple-sync.js';
import { parseContactNotes } from './contact-metadata.js';
import { openDatabase, type RolodexDatabase } from './db.js';
import { importNotionFiles } from './notion-import.js';
import { getOverrides } from './overrides.js';
import { createPerson, listPeople, updatePerson } from './people.js';
import type { AppleContact } from './types.js';
import { normalizeContactLabel } from './utils.js';

const cleanup: Array<() => void> = [];

function testDatabase(): { db: RolodexDatabase; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolodex-test-'));
  const db = openDatabase(path.join(dir, 'test.sqlite'));
  cleanup.push(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { db, dir };
}

afterEach(() => { cleanup.splice(0).forEach((fn) => fn()); });

describe('Notion import', () => {
  it('merges multiple exports losslessly and uses row-person -> introduced-person direction', () => {
    const { db, dir } = testDatabase();
    const first = path.join(dir, 'all.csv');
    const second = path.join(dir, 'view.csv');
    fs.writeFileSync(first, 'Name,Affiliation?,Company,Contact,Field,Introduced me to:,Notes\nAlice,"UChicago, SPC",Acme,alice@example.com,VC,Bob,First note\nBob,,,,,,\n');
    fs.writeFileSync(second, 'Name,Company,Field,Contact,Affiliation?,Notes,Introduced me to:\nAlice,Acme,VC,LinkedIn,Jane Street,Second note,Bob\n');

    const result = importNotionFiles(db, [first, second]);
    expect(result.created).toBe(2);
    expect(result.rows).toBe(3);
    expect((db.prepare('SELECT COUNT(*) AS count FROM people').get() as { count: number }).count).toBe(2);
    const alice = db.prepare("SELECT id, notes, raw_source_data FROM people WHERE full_name = 'Alice'").get() as { id: number; notes: string; raw_source_data: string };
    expect(alice.notes).toContain('First note');
    expect(alice.notes).toContain('Second note');
    expect(JSON.parse(alice.raw_source_data).notion).toHaveLength(2);
    expect((db.prepare(`
      SELECT target.full_name AS name FROM introductions i JOIN people source ON source.id = i.from_person_id
      JOIN people target ON target.id = i.to_person_id WHERE source.full_name = 'Alice'
    `).get() as { name: string }).name).toBe('Bob');
    const affiliations = db.prepare(`
      SELECT a.name FROM person_affiliations pa JOIN affiliations a ON a.id = pa.affiliation_id
      WHERE pa.person_id = ? ORDER BY a.name
    `).all(alice.id) as Array<{ name: string }>;
    expect(affiliations.map((item) => item.name)).toEqual(['Jane Street', 'SPC', 'UChicago']);
  });
});

describe('Apple Contacts sync', () => {
  it('matches by email, fills safe blanks, preserves notes, and stays idempotent', () => {
    const { db } = testDatabase();
    const personId = Number(db.prepare("INSERT INTO people (full_name, notes, source) VALUES ('Alice Smith', 'Keep me', 'manual')").run().lastInsertRowid);
    db.prepare("INSERT INTO contact_methods (person_id, type, value) VALUES (?, 'email', 'alice@example.com')").run(personId);
    const contact: AppleContact = {
      identifier: 'apple-1', fullName: 'Alice Smith', givenName: 'Alice', familyName: 'Smith',
      organizationName: 'Acme', jobTitle: 'Founder',
      emails: [{ value: 'alice@example.com', label: 'work' }], phones: [{ value: '(555) 123-4567', label: '_$!<Mobile>!$_' }],
    };

    const first = syncAppleContacts(db, [contact]);
    const second = syncAppleContacts(db, [contact]);
    expect(first.matched).toBe(1);
    expect(second.created).toBe(0);
    const person = db.prepare('SELECT company, field, notes, apple_contact_id, raw_source_data FROM people WHERE id = ?').get(personId) as Record<string, string>;
    expect(person).toMatchObject({ company: 'Acme', field: 'Founder', notes: 'Keep me', apple_contact_id: 'apple-1' });
    expect(JSON.parse(person.raw_source_data).appleContacts).toHaveLength(1);
    expect((db.prepare('SELECT COUNT(*) AS count FROM contact_methods WHERE person_id = ?').get(personId) as { count: number }).count).toBe(2);
    expect((db.prepare("SELECT label FROM contact_methods WHERE person_id = ? AND type = 'phone'").get(personId) as { label: string }).label).toBe('Mobile');
    expect((listPeople(db, {})[0] as { contactSummary: string }).contactSummary.startsWith('(555) 123-4567')).toBe(true);
  });

  it('decomposes recognized Apple Notes without replacing app-owned fields', () => {
    const { db } = testDatabase();
    syncAppleContacts(db, [{
      identifier: 'apple-notes', fullName: 'Notes Example', givenName: 'Notes', familyName: 'Example',
      organizationName: '', jobTitle: '', notes: 'uchicago, js quant, met at summer party 2026', emails: [], phones: [],
    }]);
    const person = db.prepare("SELECT id, company, field, context FROM people WHERE full_name = 'Notes Example'").get() as { id: number; company: string; field: string; context: string };
    expect(person).toMatchObject({ company: 'Jane Street', field: 'Quant', context: 'summer party 2026' });
    expect((db.prepare(`SELECT a.name FROM person_affiliations pa JOIN affiliations a ON a.id = pa.affiliation_id WHERE pa.person_id = ?`).get(person.id) as { name: string }).name).toBe('UChicago');
  });

  it('does not restore Apple values after the dashboard changes or clears them', () => {
    const { db } = testDatabase();
    const contact: AppleContact = {
      identifier: 'apple-overrides', fullName: 'Dashboard Owner', givenName: 'Dashboard', familyName: 'Owner',
      organizationName: 'Old Company', jobTitle: 'Founder', notes: 'UChicago, met at old event',
      emails: [{ value: 'old@example.com', label: 'work' }], phones: [{ value: '555-999-0000', label: 'mobile' }],
    };
    syncAppleContacts(db, [contact]);
    const id = (db.prepare("SELECT id FROM people WHERE full_name = 'Dashboard Owner'").get() as { id: number }).id;
    updatePerson(db, id, {
      fullName: 'Dashboard Owner', company: 'Dashboard Company', field: '', context: '', notes: 'Manual note',
      contactMethods: [], affiliations: [], introducedToIds: [], introducedByIds: [],
    });

    syncAppleContacts(db, [contact]);
    const person = db.prepare('SELECT company, field, context, notes FROM people WHERE id = ?').get(id) as Record<string, string | null>;
    expect(person).toEqual({ company: 'Dashboard Company', field: null, context: null, notes: 'Manual note' });
    expect((db.prepare('SELECT COUNT(*) count FROM contact_methods WHERE person_id = ?').get(id) as { count: number }).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) count FROM person_affiliations WHERE person_id = ?').get(id) as { count: number }).count).toBe(0);
    expect(getOverrides(db, id)).toEqual(new Set(['company', 'field', 'context', 'notes', 'affiliations', 'contact_email', 'contact_phone']));
    expect((db.prepare("SELECT COUNT(*) count FROM sync_conflicts WHERE status = 'pending'").get() as { count: number }).count).toBe(0);
  });

  it('matches a later contact in the same run against a person the run just created', () => {
    const { db } = testDatabase();
    const base = {
      givenName: 'Robin', familyName: 'Vale', organizationName: '', jobTitle: '',
      emails: [{ value: 'Robin.Vale@example.com', label: 'work' }],
    };
    const summary = syncAppleContacts(db, [
      { ...base, identifier: 'apple-first', fullName: 'Robin Vale', phones: [{ value: '555-222-3333', label: 'mobile' }] },
      { ...base, identifier: 'apple-second', fullName: 'R. Vale', emails: [{ value: 'robin.vale@example.com', label: 'home' }], phones: [] },
      { ...base, identifier: 'apple-third', fullName: 'Robin V', emails: [], phones: [{ value: '(555) 222-3333', label: 'iPhone' }] },
    ]);

    expect(summary).toMatchObject({ total: 3, created: 1, matched: 2 });
    expect((db.prepare('SELECT COUNT(*) AS count FROM people').get() as { count: number }).count).toBe(1);
    expect((db.prepare("SELECT full_name FROM people").get() as { full_name: string }).full_name).toBe('Robin Vale');
  });

  it('queues differing non-empty company values instead of overwriting', () => {
    const { db } = testDatabase();
    db.prepare("INSERT INTO people (full_name, company, source) VALUES ('Nolan Smith', 'Local Co', 'manual')").run();
    syncAppleContacts(db, [{
      identifier: 'apple-2', fullName: 'Nolan Smith', givenName: 'Nolan', familyName: 'Smith',
      organizationName: 'Contacts Co', jobTitle: '', emails: [], phones: [],
    }]);
    expect((db.prepare("SELECT company FROM people WHERE full_name = 'Nolan Smith'").get() as { company: string }).company).toBe('Local Co');
    expect((db.prepare("SELECT incoming_value FROM sync_conflicts WHERE field = 'company'").get() as { incoming_value: string }).incoming_value).toBe('Contacts Co');
  });
});

describe('contact note metadata', () => {
  it('standardizes school and community affiliation aliases', () => {
    const parsed = parseContactNotes('Irvington high school; South Park Commons; met through robotics club', {
      companies: [], fields: [], affiliations: ['Irvington', 'SPC'],
    });
    expect(parsed.affiliations).toEqual(['Irvington', 'SPC']);
    expect(parsed.context).toBe('robotics club');
  });

  it('treats Jane Street as a company rather than an inferred affiliation', () => {
    const parsed = parseContactNotes('Jane Street SP, met at recruiting dinner', {
      companies: ['Jane Street SP'], fields: [], affiliations: ['Jane Street'],
    });
    expect(parsed.company).toBe('Jane Street');
    expect(parsed.field).toBe('Strat and Product');
    expect(parsed.affiliations).toEqual([]);
  });
});

describe('Apple contact labels', () => {
  it('decodes Apple localization tokens and removes redundant generic labels', () => {
    expect(normalizeContactLabel('_$!<Mobile>!$_', 'phone')).toBe('Mobile');
    expect(normalizeContactLabel('Phone', 'phone')).toBeNull();
    expect(normalizeContactLabel('work', 'email')).toBe('work');
  });
});

describe('manual relationship editing', () => {
  it('creates and replaces introduction links from comma-separated form names', () => {
    const { db } = testDatabase();
    const aliceId = createPerson(db, { fullName: 'Alice', introducedToNames: ['Bob'] });
    expect((db.prepare(`SELECT p.full_name AS name FROM introductions i JOIN people p ON p.id = i.to_person_id WHERE i.from_person_id = ?`).get(aliceId) as { name: string }).name).toBe('Bob');
    updatePerson(db, aliceId, { fullName: 'Alice', introducedToNames: ['Carla'], introducedByNames: [], contactMethods: [], affiliations: [] });
    expect((db.prepare(`SELECT p.full_name AS name FROM introductions i JOIN people p ON p.id = i.to_person_id WHERE i.from_person_id = ?`).get(aliceId) as { name: string }).name).toBe('Carla');
  });
});
