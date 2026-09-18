import express from 'express';
import fs from 'node:fs';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RolodexDatabase } from './db.js';
import { readAppleContacts, syncAppleContacts } from './apple-sync.js';
import { listConflicts, resolveConflict } from './conflicts.js';
import { importNotionFiles } from './notion-import.js';
import { createPerson, getFilters, getPerson, listPeople, updatePerson } from './people.js';
import type { PersonInput } from './types.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 10, fileSize: 10 * 1024 * 1024 } });
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function createApp(db: RolodexDatabase) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_request, response) => {
    const count = (db.prepare('SELECT COUNT(*) AS count FROM people').get() as { count: number }).count;
    response.json({ ok: true, app: 'rolodex', people: count });
  });

  app.get('/api/people', (request, response) => response.json(listPeople(db, request.query)));
  app.get('/api/people/filters', (_request, response) => response.json(getFilters(db)));
  app.get('/api/people/:id', (request, response) => {
    const person = getPerson(db, Number(request.params.id));
    if (!person) return response.status(404).json({ error: 'Person not found.' });
    response.json(person);
  });
  app.post('/api/people', (request, response) => {
    const id = createPerson(db, request.body as PersonInput);
    response.status(201).json(getPerson(db, id));
  });
  app.put('/api/people/:id', (request, response) => {
    const id = Number(request.params.id);
    updatePerson(db, id, request.body as PersonInput);
    response.json(getPerson(db, id));
  });

  app.get('/api/conflicts', (request, response) => response.json(listConflicts(db, String(request.query.status || 'pending'))));
  app.post('/api/conflicts/:id/resolve', (request, response) => {
    resolveConflict(db, Number(request.params.id), String(request.body.action || ''));
    response.json({ ok: true });
  });

  app.get('/api/sync-runs', (_request, response) => {
    response.json(db.prepare(`
      SELECT id, source, started_at AS startedAt, finished_at AS finishedAt, status, summary
      FROM sync_runs ORDER BY id DESC LIMIT 20
    `).all());
  });

  app.post('/api/import/notion', upload.array('files'), (request, response) => {
    const files = (request.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) return response.status(400).json({ error: 'Choose at least one CSV file.' });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolodex-import-'));
    try {
      const paths = files.map((file, index) => {
        const safeName = `${index}-${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(tempDir, safeName);
        fs.writeFileSync(filePath, file.buffer);
        return filePath;
      });
      response.json(importNotionFiles(db, paths));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  app.post('/api/sync/apple', async (_request, response, next) => {
    try {
      const contacts = await readAppleContacts();
      response.json(syncAppleContacts(db, contacts));
    } catch (error) {
      next(error);
    }
  });

  const frontendDist = path.resolve(moduleDir, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.use((request, response, next) => {
      if (request.method === 'GET' && !request.path.startsWith('/api/')) {
        return response.sendFile(path.join(frontendDist, 'index.html'));
      }
      next();
    });
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    response.status(message.includes('not found') ? 404 : 400).json({ error: message });
  });
  return app;
}
