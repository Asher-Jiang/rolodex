import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = path.resolve(moduleDir, '../../data/contacts.sqlite');

export type RolodexDatabase = Database.Database;

export function openDatabase(databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : defaultDatabasePath): RolodexDatabase {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: RolodexDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const migrationsDir = path.resolve(moduleDir, 'migrations');
  for (const filename of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    const version = filename.split('_')[0];
    const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
    if (applied) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
    })();
  }
}
