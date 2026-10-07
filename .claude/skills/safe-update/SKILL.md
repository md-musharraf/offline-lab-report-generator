---
name: safe-update
description: Rules for changing or releasing the JharLab offline desktop app so an update never loses a lab's data (logins, patients, reports, bills, settings) or breaks sign-in. Use before editing prisma/schema.prisma, upgradeData/ensureSchema, login or password code, main.js database/userData/backup code, or package.json name/appId/productName/version; before building or releasing an installer; and when a lab reports "data gone" or "can't log in" after an update.
---

# JharLab: updates without data loss

A lab's whole business is one SQLite file. An update must never lose or hide a single login, patient,
report, bill or setting. When a rule below and a requested change conflict, stop and tell the user.

## Where the data lives

- Installed app: `%APPDATA%\jharlab\dev.db` (+ `dev.db-wal`, `dev.db-shm`), backups in `%APPDATA%\jharlab\backups\`.
  The folder comes from package.json `"name": "jharlab"` (Electron userData).
- Dev (`npm run dev` / `electron:dev`): `prisma/dev.db` and `prisma/backups/`; it never touches `%APPDATA%\jharlab`.
- Tests and E2E: `JHARLAB_USER_DATA=<temp dir>`.

## Never change

- package.json `name` (`jharlab`), `build.appId` (`com.offlinelab.lis`), `build.productName` (`JharLab`).
  A new name means a new data folder, so the lab looks empty after the update. This already happened once
  (`offline-lab-lis` -> `jharlab`). If a rename is ever unavoidable, add the old folder name to
  `LEGACY_DATA_DIRS` in lib/server-api.js.
- `build.nsis.deleteAppDataOnUninstall: false`. Never ship a database inside the installer.
- The safety nets in lib/server-api.js and main.js (below). Don't remove or bypass them.

## Database changes: additive only

- Only add tables, or columns that are optional (`?`) or have `@default(...)`. Never rename, drop or retype a
  column or table. `ensureSchema` can only ADD. For a rename: add the new column, copy the data in
  `upgradeData()`, and keep the old column.
- `upgradeData()` fixes must be idempotent and must never delete lab data.
- After editing schema.prisma, run `npm run build` (regenerates `prisma/schema.sql`).
- Sign-in: keep every old password format working. `checkPassword` accepts bcrypt and legacy plain text
  (re-hashed on first login), and matches emails lowercased and trimmed. Never invalidate existing users,
  recovery codes or the licence key on update.

## Safety nets already built in

- `upgradeDatabase()`: when the app version differs from the one stored in the file (`PRAGMA user_version`),
  it saves `backups/jharlab-preupdate-<old>-to-<new>-<time>.db` before touching anything. These copies are never pruned.
- `recoverMissingDatabase()`: a missing `dev.db` comes back from the newest backup or an older install's
  folder, never an empty lab. The user sees a dialog.
- A daily automatic backup (14 kept), and a safety copy before every restore.

## Release checklist

1. `npm version X.Y.Z --no-git-tag-version`
2. `npm run build`. If `prisma/schema.sql` differs from the newest file in `tests/release-schemas/`, copy it to
   `tests/release-schemas/X.Y.Z.sql` (each released schema stays there for good).
3. `npm test`. `tests/upgrade.test.js` opens a filled database from every released version and checks that
   logins, patients, results, reports and bills survive. It must pass. Never weaken or skip it.
4. `npm run electron:build`, then `E2E_PACKAGED=1 npx playwright test`. This is mandatory: unit tests never
   load main.js, and this step has caught an installer that crashed on start and files missing from the
   installer. (`npm test` only syntax-checks main.js.)
5. Optional real-data check: copy (never move) a real lab's `dev.db` and `dev.db-wal` to a temp folder, run
   `api.upgradeDatabase` on the copy, and compare row counts before and after.
6. Commit, tag `vX.Y.Z`. Push only when the user asks.

## Never

- Run the packaged exe, tests or scripts (`clear_db.js`, `clear_all_for_setup.js`, ...) against a real lab's
  database. Always use `JHARLAB_USER_DATA=<temp dir>`.
- Move, delete or overwrite a real `dev.db`, or copy it without its `-wal` (that loses recent entries).

## "Can't log in" or "data gone" after an update

1. Work on copies only. List each database's labs and logins read-only: `%APPDATA%\jharlab\dev.db`, its
   `backups\`, any `old-*` folders, and legacy folders such as `%APPDATA%\offline-lab-lis\dev.db`.
2. Usually the email is mistyped, or the account lives in another database. Show the user which login
   exists where. The owner can also use "Forgot password or email?" with the recovery code.
3. To bring older data back, use the app's Backup -> Restore (it makes a safety copy first). Never copy
   files over a live database.
