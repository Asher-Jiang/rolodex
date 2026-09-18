/* Rebuild the app icon from assets/icon.svg.
   Writes assets/icon.png and assets/Rolodex.icns, then refreshes the icon of an
   already-installed launcher so the change shows up in Spotlight and the Dock. */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('Rendering the Rolodex icon requires macOS.');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const svg = path.join(root, 'assets/icon.svg');
const png = path.join(root, 'assets/icon.png');
const icns = path.join(root, 'assets/Rolodex.icns');
const favicon = path.join(root, 'frontend/public/icon.svg');
const installed = path.resolve(process.argv[2] || path.join(os.homedir(), 'Applications', 'Rolodex.app'));

function rasterize(target, pixels) {
  execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', path.join(root, 'scripts/macos/rasterize-svg.js'), svg, target, String(pixels)], { stdio: 'ignore' });
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rolodex-icon-'));
try {
  rasterize(png, 1024);

  // iconutil needs every size present, so rasterize each one from the vector
  // source instead of downscaling a single bitmap.
  const iconset = path.join(temp, 'Rolodex.iconset');
  fs.mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      rasterize(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`), size * scale);
    }
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', icns]);
  fs.mkdirSync(path.dirname(favicon), { recursive: true });
  fs.copyFileSync(svg, favicon);
  console.log(`Wrote ${[png, icns, favicon].map((file) => path.relative(root, file)).join(', ')}`);

  if (fs.existsSync(installed)) {
    fs.copyFileSync(icns, path.join(installed, 'Contents/Resources/applet.icns'));
    // Re-sign so the edited bundle still launches, then touch and re-register it
    // so Finder drops the icon it cached.
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', installed], { stdio: 'ignore' });
    fs.utimesSync(installed, new Date(), new Date());
    execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', installed], { stdio: 'ignore' });
    console.log(`Updated the icon of ${installed}`);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
