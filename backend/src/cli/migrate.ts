import { openDatabase } from '../db.js';

const db = openDatabase();
console.log(`Database migrated: ${db.name}`);
db.close();
