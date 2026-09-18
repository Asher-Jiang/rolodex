import { openDatabase } from '../db.js';
import { importNotionFiles } from '../notion-import.js';

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('Usage: npm run import:notion -- /path/to/export.csv [/path/to/second.csv]');
  process.exit(1);
}

const db = openDatabase();
try {
  const summary = importNotionFiles(db, paths);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  db.close();
}
