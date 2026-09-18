import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../src/migrations');
const destination = path.resolve(here, '../dist/migrations');
fs.mkdirSync(destination, { recursive: true });
for (const file of fs.readdirSync(source).filter((name) => name.endsWith('.sql'))) {
  fs.copyFileSync(path.join(source, file), path.join(destination, file));
}
