<p align="center">
  <img src="assets/icon.png" alt="Rolodex" width="128" height="128">
</p>

# Rolodex

A local-first personal contacts app for macOS. It merges Apple Contacts and Notion CSV exports into one SQLite database, then keeps richer notes and relationship context — how you met, who introduced you, what they work on — that neither source holds.

Nothing leaves your Mac. There is no account, no server, and no cloud service.

- **Additive sync.** Apple Contacts is a read-only capture source. Emails and phones are added, never deleted, and your notes are never overwritten.
- **Nothing gets guessed.** Conflicting values and fuzzy name matches go to a review queue instead of being resolved silently.
- **Your edits win.** Once you change or clear a field in the app, later syncs leave that field alone.
- **Lossless imports.** Every original CSV row is stored verbatim, so an import can always be traced back to its source.

## Requirements

- macOS
- Node.js 22 or newer (`node --version`)

## Getting started

```bash
git clone https://github.com/Asher-Jiang/rolodex.git
cd rolodex
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173). Stop both servers with `Control-C`.

For a production-style local run:

```bash
npm run build
npm start
```

Then open [http://localhost:4317](http://localhost:4317).

The database is created on first run at `data/contacts.sqlite`. Set `DATABASE_PATH` and `PORT` in a `.env` file to change that; see [.env.example](.env.example).

## Open from Spotlight

Run `npm run install:mac` once to build the app and install `~/Applications/Rolodex.app`. Press Command-Space, type **Rolodex**, and press Return. The launcher starts the server and opens your browser; opening it again reuses the running server. No Terminal window is needed.

Keep the project folder in place — the launcher references both it and the Node executable used during installation. The server listens only on your Mac and stays running after you close the browser, until logout or until you stop it. To stop it manually, quit the Node process whose command is `backend/dist/server.js`.

After code changes, stop the running server and run `npm run build`. If you move the project or replace your Node installation, move the old launcher to Trash and run `npm run install:mac` again. Startup errors appear in a dialog; server logs are in `~/Library/Logs/Rolodex/server.log`.

## One manual permission step

Click **Sync Contacts** and approve the macOS prompt allowing Terminal — or Rolodex, when using the launcher — to control Contacts.

If access was previously denied, open **System Settings → Privacy & Security → Automation**, enable **Contacts** under the process shown there, restart the app, and click **Sync Contacts** again.

The sync reads all Apple Contacts. It never changes them.

## What sync does

- Matches by stable Apple ID, then email, phone, and exact normalized name.
- Adds emails and phone numbers without deleting existing methods, unless that contact category was manually edited in the app.
- Fills company, field/role, affiliations, and meeting context only when the app's own value is empty. Apple job titles are normalized into field/role rather than stored separately.
- Never overwrites notes, affiliations, meeting context, or introductions.
- Sends conflicting company values and fuzzy name matches to the **Review queue**.
- Is idempotent: the same Apple contact is not recreated on later runs.
- Records per-field overrides. Once you change or clear company, field/role, meeting context, notes, affiliations, phones, or emails, older Apple values can no longer restore or conflict with that choice.

Apple Contacts Notes are parsed conservatively for known company, field/role, and affiliation names, plus `met at/through/via/in …` phrases. The original note is always preserved in raw source history.

Recognized aliases are normalized so the same organization does not appear under several spellings — `JS` becomes `Jane Street`, `South Park Commons` becomes the affiliation `SPC`, and so on. The vocabulary ships tuned to its author's network; edit [backend/src/contact-metadata.ts](backend/src/contact-metadata.ts) to match your own.

More detail is in [docs/sync-behavior.md](docs/sync-behavior.md).

## Notion imports

Use **Data & sync → Notion CSV** in the app, or run:

```bash
npm run import:notion -- "/absolute/path/to/export.csv" "/absolute/path/to/another.csv"
```

The importer merges rows by normalized name, unions affiliations and contact methods, combines distinct notes, records incompatible scalar fields for review, and saves each complete raw row in `import_rows`.

Expected columns are `Name`, `Company`, `Field`, `Contact`, `Affiliation?`, `Notes`, and `Introduced me to:`; missing columns are skipped. `Introduced me to:` means the person in that row introduced you to the people listed, and parenthetical text is kept as relationship context.

## Data and backups

Your database is `data/contacts.sqlite`. That whole directory is Git-ignored, along with CSV, vCard, and archive files anywhere in the tree, so personal data cannot be committed by accident.

Before making large manual changes, stop the app and copy the file somewhere safe:

```bash
cp data/contacts.sqlite data/contacts-backup.sqlite
```

## Commands

```bash
npm run dev          # frontend and backend with live reload
npm test             # importer, sync, and interface tests
npm run build        # type-check and build both packages
npm run db:migrate   # apply any new database migrations
npm run install:mac  # build and install the Spotlight launcher
npm run icon         # rebuild the app icon from assets/icon.svg
```

## Project layout

```text
frontend/   React + Vite interface
backend/    Express API, SQLite access, import and sync logic
scripts/    Apple Contacts reader and macOS launcher tooling
assets/     App icon source and rendered output
docs/       Schema and sync notes
data/       Local SQLite database (Git-ignored)
```

## License

[MIT](LICENSE)
