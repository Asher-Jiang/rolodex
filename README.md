<p align="center">
  <img src="assets/icon.png" alt="Rolodex" width="128" height="128">
</p>

# Rolodex

A personal contacts app for macOS that helps you remember the person behind the name. Keep track of where you met, who introduced you, their work, and the communities you share—with searchable notes and filters to find the right person later. Bring in your Apple Contacts and add context that stays yours, even after syncing again. Everything is stored locally on your Mac. No account needed.

## Let an AI agent set it up

Prefer to skip the Terminal steps? Copy this prompt into an AI coding agent that can run commands on your Mac:

```text
Set up Rolodex on my Mac from https://github.com/Asher-Jiang/rolodex.

Please carry out the setup, not just explain the steps:
1. Check that I have macOS, Git, and Node.js 22 or newer with npm.
   Help install any missing requirements, asking me only when a manual
   action or system permission is needed.
2. Clone the repository into a permanent folder in my home directory
   (such as ~/Applications/rolodex). If I already have a copy, reuse it
   and preserve any local changes and data.
3. Read the repository's setup instructions, run npm ci, then run
   npm run install:mac to build the app and install the shortcut.
   If a Rolodex shortcut already exists, check whether it works before
   replacing it. Preserve my contacts database.
4. Open ~/Applications/Rolodex.app and verify that the app loads in
   my browser. Troubleshoot any setup errors.
5. Help me run Sync Contacts and explain any macOS permission prompt
   I need to approve myself.

When finished, tell me how to open Rolodex from Spotlight and where
the project and my data are saved. Keep the project folder in place
because the shortcut depends on it.
```

You may still need to approve installation or Contacts access prompts yourself.

## Install and open

You need **macOS**, **Git**, and **Node.js 22 or newer** (including npm).

Open Terminal and run:

```bash
git clone https://github.com/Asher-Jiang/rolodex.git
cd rolodex
npm ci
npm run install:mac
```

This builds the app and installs a shortcut at `~/Applications/Rolodex.app`.

Press **Command-Space**, type **Rolodex**, and press **Return**. The shortcut starts the app and opens it in your browser. You can also open it from your home folder's **Applications** folder or drag it to the Dock.

Keep the downloaded project folder in place: the shortcut needs it to run.

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
