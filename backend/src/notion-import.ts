import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import type { RolodexDatabase } from './db.js';
import { setAffiliations } from './people.js';
import { cleanString, normalizeName, uniqueStrings } from './utils.js';

type CsvRow = Record<string, string>;

export type ImportSummary = {
  files: number;
  rows: number;
  created: number;
  updated: number;
  introductions: number;
  conflicts: number;
  runId: number;
};

function value(row: CsvRow, wanted: string): string {
  const key = Object.keys(row).find((candidate) => candidate.replace(/^\uFEFF/, '').trim().toLowerCase() === wanted.toLowerCase());
  return key ? cleanString(row[key]) : '';
}

function splitList(input: string): string[] {
  return uniqueStrings(input.split(/[,;\n]+/).map((item) => item.trim()));
}

function introductionParts(input: string): Array<{ name: string; context: string | null }> {
  return splitList(input).map((item) => {
    const match = item.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    return match ? { name: match[1].trim(), context: match[2].trim() } : { name: item, context: null };
  }).filter((item) => item.name);
}

function contactParts(input: string): Array<{ type: string; value: string }> {
  return uniqueStrings(input.split(/[;,\n/]+/).map((item) => item.trim())).map((part) => {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) return { type: 'email', value: part };
    if (/linkedin\.com/i.test(part) || /^linkedin$/i.test(part)) return { type: 'linkedin', value: part };
    if (/twitter\.com|x\.com/i.test(part)) return { type: 'twitter', value: part };
    if (/messenger/i.test(part)) return { type: 'messenger', value: part };
    if (/i?message/i.test(part)) return { type: 'imessage', value: part };
    if (/phone/i.test(part) || part.replace(/\D/g, '').length >= 7) return { type: 'phone', value: part };
    return { type: 'other', value: part };
  });
}

function appendRawSource(db: RolodexDatabase, personId: number, sourceFile: string, row: CsvRow): void {
  const existing = db.prepare('SELECT raw_source_data FROM people WHERE id = ?').get(personId) as { raw_source_data: string | null };
  let data: { notion?: Array<{ sourceFile: string; row: CsvRow }> } = {};
  try { data = existing.raw_source_data ? JSON.parse(existing.raw_source_data) : {}; } catch { data = {}; }
  data.notion ??= [];
  const signature = JSON.stringify({ sourceFile, row });
  if (!data.notion.some((entry) => JSON.stringify(entry) === signature)) data.notion.push({ sourceFile, row });
  db.prepare('UPDATE people SET raw_source_data = ? WHERE id = ?').run(JSON.stringify(data), personId);
}

function addConflict(db: RolodexDatabase, runSource: string, personId: number, name: string, field: string, incoming: string, existing: string): void {
  const duplicate = db.prepare(`
    SELECT 1 FROM sync_conflicts WHERE source = ? AND possible_person_id = ? AND field = ?
      AND incoming_value = ? AND existing_value = ? AND status = 'pending'
  `).get(runSource, personId, field, incoming, existing);
  if (!duplicate) {
    db.prepare(`
      INSERT INTO sync_conflicts (source, conflict_type, incoming_name, possible_person_id, field, incoming_value, existing_value)
      VALUES (?, 'field', ?, ?, ?, ?, ?)
    `).run(runSource, name, personId, field, incoming, existing);
  }
}

export function importNotionFiles(db: RolodexDatabase, filePaths: string[]): ImportSummary {
  if (!filePaths.length) throw new Error('Provide at least one CSV file.');
  const run = db.prepare(`INSERT INTO sync_runs (source) VALUES ('notion')`).run();
  const runId = Number(run.lastInsertRowid);
  const summary: ImportSummary = { files: filePaths.length, rows: 0, created: 0, updated: 0, introductions: 0, conflicts: 0, runId };
  const pendingIntroductions: Array<{ fromId: number; targets: Array<{ name: string; context: string | null }> }> = [];
  const byName = new Map<string, number>();

  for (const person of db.prepare('SELECT id, full_name FROM people').all() as Array<{ id: number; full_name: string }>) {
    byName.set(normalizeName(person.full_name), person.id);
  }

  try {
    db.transaction(() => {
      for (const filePath of filePaths) {
        const sourceFile = path.basename(filePath);
        const rows = parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''), {
          columns: true,
          skip_empty_lines: false,
          relax_column_count: true,
          trim: true,
        }) as CsvRow[];

        rows.forEach((row, index) => {
          const name = value(row, 'Name');
          const hasData = Object.values(row).some((item) => cleanString(item));
          if (!hasData) return;
          summary.rows += 1;
          let personId = name ? byName.get(normalizeName(name)) : undefined;
          if (!name) {
            db.prepare(`INSERT INTO import_rows (sync_run_id, source_file, row_number, raw_json) VALUES (?, ?, ?, ?)`)
              .run(runId, sourceFile, index + 2, JSON.stringify(row));
            return;
          }

          const company = value(row, 'Company');
          const field = value(row, 'Field');
          const notes = value(row, 'Notes');
          if (!personId) {
            const result = db.prepare(`
              INSERT INTO people (full_name, company, field, notes, source) VALUES (?, ?, ?, ?, 'notion')
            `).run(name, company || null, field || null, notes || null);
            personId = Number(result.lastInsertRowid);
            byName.set(normalizeName(name), personId);
            summary.created += 1;
          } else {
            const person = db.prepare('SELECT company, field, notes FROM people WHERE id = ?').get(personId) as { company: string | null; field: string | null; notes: string | null };
            for (const [column, incoming] of [['company', company], ['field', field]] as const) {
              const existing = person[column] ?? '';
              if (incoming && !existing) db.prepare(`UPDATE people SET ${column} = ? WHERE id = ?`).run(incoming, personId);
              else if (incoming && existing && incoming.toLowerCase() !== existing.toLowerCase()) {
                addConflict(db, 'notion', personId, name, column, incoming, existing);
                summary.conflicts += 1;
              }
            }
            if (notes && !person.notes) db.prepare('UPDATE people SET notes = ? WHERE id = ?').run(notes, personId);
            else if (notes && person.notes && notes !== person.notes && !person.notes.includes(notes)) {
              db.prepare('UPDATE people SET notes = ? WHERE id = ?').run(`${person.notes}\n\n${notes}`, personId);
            }
            summary.updated += 1;
          }

          const existingAffiliations = (db.prepare(`
            SELECT a.name FROM person_affiliations pa JOIN affiliations a ON a.id = pa.affiliation_id WHERE pa.person_id = ?
          `).all(personId) as Array<{ name: string }>).map((item) => item.name);
          setAffiliations(db, personId, [...existingAffiliations, ...splitList(value(row, 'Affiliation?'))]);

          const insertContact = db.prepare(`
            INSERT OR IGNORE INTO contact_methods (person_id, type, value, source) VALUES (?, ?, ?, 'notion')
          `);
          for (const contact of contactParts(value(row, 'Contact'))) insertContact.run(personId, contact.type, contact.value);

          appendRawSource(db, personId, sourceFile, row);
          db.prepare(`
            INSERT INTO import_rows (sync_run_id, source_file, row_number, matched_person_id, raw_json) VALUES (?, ?, ?, ?, ?)
          `).run(runId, sourceFile, index + 2, personId, JSON.stringify(row));

          const targets = introductionParts(value(row, 'Introduced me to:'));
          if (targets.length) pendingIntroductions.push({ fromId: personId, targets });
        });
      }

      for (const relation of pendingIntroductions) {
        for (const target of relation.targets) {
          let targetId = byName.get(normalizeName(target.name));
          if (!targetId) {
            const result = db.prepare(`INSERT INTO people (full_name, source) VALUES (?, 'notion-reference')`).run(target.name);
            targetId = Number(result.lastInsertRowid);
            byName.set(normalizeName(target.name), targetId);
            summary.created += 1;
          }
          if (targetId !== relation.fromId) {
            const result = db.prepare(`
              INSERT OR IGNORE INTO introductions (from_person_id, to_person_id, context, source) VALUES (?, ?, ?, 'notion')
            `).run(relation.fromId, targetId, target.context);
            if (!result.changes && target.context) {
              db.prepare(`UPDATE introductions SET context = COALESCE(context, ?) WHERE from_person_id = ? AND to_person_id = ?`)
                .run(target.context, relation.fromId, targetId);
            }
            summary.introductions += result.changes;
          }
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
