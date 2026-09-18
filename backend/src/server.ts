import { createApp } from './app.js';
import { openDatabase } from './db.js';

const port = Number(process.env.PORT || 4317);
const db = openDatabase();
const app = createApp(db);

const server = app.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`Rolodex API running at http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
