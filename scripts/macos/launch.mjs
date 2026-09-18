import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const state = path.join(os.homedir(), 'Library', 'Logs', 'Rolodex');
fs.mkdirSync(state, { recursive: true });
const log = path.join(state, 'server.log');
const url = 'http://127.0.0.1:4317';
const pause = () => new Promise(resolve => setTimeout(resolve, 250));
async function ready() {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(800) });
    const body = await response.json();
    if (body.app !== 'rolodex') throw new Error('Port 4317 is being used by another app or an older Rolodex server. Stop that server and try again.');
    return body.ok === true;
  } catch (error) {
    if (error.message.startsWith('Port 4317')) throw error;
    return false;
  }
}
async function main() {
  const lock = path.join(state, 'startup.lock');
  let ownsLock = false;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await ready()) {
        const child = spawn('/usr/bin/open', [url], { stdio: 'ignore' });
        await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Could not open your browser.'))); });
        return;
      }
      if (!ownsLock) {
        try {
          fs.mkdirSync(lock);
          ownsLock = true;
          if (!fs.existsSync(path.join(root, 'backend/dist/server.js')) || !fs.existsSync(path.join(root, 'frontend/dist/index.html'))) {
            throw new Error('Rolodex needs to be built. Run npm run build in the project folder.');
          }
          const fd = fs.openSync(log, 'a', 0o600);
          const server = spawn(process.execPath, ['backend/dist/server.js'], {
            cwd: root, detached: true, stdio: ['ignore', fd, fd],
            env: { ...process.env, PORT: '4317', HOST: '127.0.0.1' },
          });
          fs.closeSync(fd);
          await new Promise((resolve, reject) => { server.once('spawn', resolve); server.once('error', reject); });
          server.unref();
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          try { if (Date.now() - fs.statSync(lock).mtimeMs > 60000) fs.rmdirSync(lock); } catch {}
        }
      }
      await pause();
    }
    throw new Error(`Rolodex did not start. Details are in ${log}`);
  } finally {
    if (ownsLock) fs.rmdirSync(lock);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
