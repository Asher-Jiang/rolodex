import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('The Rolodex launcher requires macOS.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const destination = path.resolve(process.argv[2] || path.join(os.homedir(), 'Applications', 'Rolodex.app'));
if (fs.existsSync(destination)) throw new Error(`Already exists: ${destination}. Move the old launcher to Trash before reinstalling.`);
const quoteShell = value => "'" + value.replaceAll("'", "'\\''") + "'";
const command = `${quoteShell(process.execPath)} ${quoteShell(path.join(root, 'scripts/macos/launch.mjs'))}`;
const source = `on run\ntry\ndo shell script ${JSON.stringify(command)}\non error messageText\ndisplay alert "Rolodex could not open" message messageText as critical\nend try\nend run\n`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rolodex-launcher-'));
try {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const script = path.join(temp, 'launcher.applescript');
  fs.writeFileSync(script, source);
  execFileSync('/usr/bin/osacompile', ['-o', destination, script]);
  fs.copyFileSync(path.join(root, 'assets/Rolodex.icns'), path.join(destination, 'Contents/Resources/applet.icns'));
  const plist = path.join(destination, 'Contents/Info.plist');
  execFileSync('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', 'com.local.rolodex.launcher', plist]);
  execFileSync('/usr/bin/plutil', ['-replace', 'NSAppleEventsUsageDescription', '-string', 'Rolodex reads Apple Contacts when you choose Sync Contacts.', plist]);
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', destination]);
  execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', destination]);
  console.log(`Installed ${destination}\nOpen Spotlight and search for Rolodex. Keep the project at ${root}.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
