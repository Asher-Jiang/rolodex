<p align="center">
  <img src="assets/icon.png" alt="Rolodex" width="128" height="128">
</p>

# Rolodex


Contacts app which stores additional context about relationships. Easily sync with icloud contacts. Keep track of where you met, who introduced you, their work, and the communities you share, with searchable notes and filters to find the right person later. Fully open-source and runs locally on your mac.

## Let an AI agent set it up

Prefer to skip the Terminal steps? Copy this prompt into an AI coding agent that can run commands on your Mac:

```text
Install and launch Rolodex on this Mac using this repository:
https://github.com/Asher-Jiang/rolodex.git

Execute the setup and verify it. Follow these steps in order, stopping
on errors rather than continuing with a partially completed step.

1. Check prerequisites:
   - Run uname -s; this setup requires Darwin (macOS).
   - Run git --version, node --version, and npm --version. Node must
     be version 22 or newer. Use an existing compatible installation.
   - If a requirement is missing, use the machine's existing package
     manager where possible. Guide me through any required installer
     or permission prompt, then recheck the versions before continuing.

2. Choose a permanent checkout:
   - If the current folder is already this repository, use it. Otherwise,
     use "$HOME/Applications/rolodex" and create its parent if needed.
   - If that destination exists, inspect its Git remote and working tree.
     Reuse it only if it is this repository; never overwrite an unrelated
     directory. Ask for a different path if there is a collision.
   - For a new checkout, run:
     git clone https://github.com/Asher-Jiang/rolodex.git "$HOME/Applications/rolodex"
   - Run all npm commands from the checkout root. Read its README and
     package.json and inspect scripts/macos/install.mjs and launch.mjs.
     Preserve local changes; do not reset, clean, or automatically pull
     an existing checkout. Keep the checkout at its permanent path.

3. Build and install:
   - Run npm ci and require a successful exit before proceeding.
   - The launcher belongs at "$HOME/Applications/Rolodex.app".
     If absent, run npm run install:mac (which also builds the app).
   - If it exists, inspect its embedded AppleScript with osadecompile
     and verify the referenced checkout and Node executable. If both
     match this setup, keep the launcher and run npm run build.
   - If it is an outdated Rolodex launcher, move it to a uniquely named
     backup outside Applications before running npm run install:mac.
     Restore it if installation fails. Do not replace an unrelated app.
   - Require a successful build and confirm backend/dist/server.js,
     frontend/dist/index.html, and the installed app bundle exist.
     Do not edit source code or dependency versions to bypass errors.

4. Launch and verify:
   - Check for a listener on port 4317. If occupied, inspect its process
     and working directory. Reuse it only if it is this checkout's
     Rolodex server. Stop an outdated server from this checkout by its
     specific PID if needed; never kill all Node processes. If another
     app or checkout owns the port, report the conflict and ask me how
     to proceed rather than killing it or changing the launcher's port.
   - Run: open "$HOME/Applications/Rolodex.app"
   - Allow up to 30 seconds for startup. Verify that
     http://127.0.0.1:4317/api/health returns HTTP 200 with JSON containing
     "ok": true and "app": "rolodex", and that the root URL serves the UI.
   - Confirm the browser displays Rolodex if browser tools are available;
     otherwise ask me to confirm. An HTTP check alone is not a visual check.
   - If startup fails, inspect "$HOME/Library/Logs/Rolodex/server.log"
     and report the specific error. Do not claim success without checks.

5. Connect Apple Contacts:
   - Click Sync Contacts in the UI if you have UI access; otherwise tell
     me exactly how to do it. Let me approve the macOS permission prompt.
   - If denied, direct me to System Settings > Privacy & Security >
     Automation and enable Contacts for the process macOS lists.
   - Verify the sync result in the app. An empty address book is valid;
     do not invent contacts or treat a zero count alone as a failure.

Preserve data/ and any configured database, including SQLite sidecar
files. Do not delete, replace, upload, or print my contact data. Do not
commit or push anything as part of setup.

Finish with the exact checkout, launcher, and database paths; which
checks passed; and any action still needed from me. Explain that the
launcher is in my home Applications folder and available from Spotlight,
and that its checkout and Node executable must remain in place.
```

You may still need to approve installation or Contacts access prompts yourself.

## Install and open

Requires **macOS**, **Git**, and **Node.js 22+** with npm:

```bash
git clone https://github.com/Asher-Jiang/rolodex.git
cd rolodex
npm ci
npm run install:mac
```

The shortcut appears in your home **Applications** folder (`~/Applications/Rolodex.app`) and Spotlight. Open it to launch Rolodex in your browser. Keep the project folder in place; the shortcut depends on it.

## Add your contacts

Click **Sync Contacts** and allow access when macOS asks. Rolodex reads your Apple Contacts without changing them. You can also add people manually and edit their details in the app.

If access is denied, open **System Settings → Privacy & Security → Automation**, enable Contacts access for Rolodex (or Terminal), then reopen the app and try again.

## Your data

Your data is saved in `data/contacts.sqlite` inside the project folder. The `data/` folder, database files, contact exports, and local `.env` files are Git-ignored. Keep your own backups; deleting the project folder also deletes its local data.

Closing the browser leaves the app running. Before copying the database for a backup, stop the app's Node process (`backend/dist/server.js`) in Activity Monitor.

## Update or develop

To update, stop the app's Node process in Activity Monitor, then run these commands in the project folder and reopen Rolodex:

```bash
git pull
npm ci
npm run build
```

If you move the project folder or change your Node installation, move `~/Applications/Rolodex.app` to Trash and run `npm run install:mac` again.

For development, run `npm run dev` and open http://localhost:5173. Run `npm test` to check your changes.

If the shortcut fails to open, check `~/Library/Logs/Rolodex/server.log`.

[MIT License](LICENSE)
