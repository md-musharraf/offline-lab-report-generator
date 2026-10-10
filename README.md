i want to add more feature in this application 

1. i want to control fully by my admin dashboard paused / stopped / delete user (when user connected via internet , if he not connect with internet then he can use until he connect with internet)

2. i want to do when i push update via online , when user connect with internet then they get update and enjoying new feature 

3. add feature when technician add one parameter and he press 'Enter' key then they jump into next parameter ✔️

4. keep ui clean and easy for technician (color-combination, ui, layout ,button , and more shortcuts)✔️

5. add fully customize according to lab-owner request (parameter name, price, report style , report layout, header , footer, clinic information , hospital information , and more)

6. login based for technicians and lab-owner





1. 🧪 Diagnostic & Report Customizations (NABL Guidelines ke mutabik)
Calculated Parameters (Auto-Formula Calculation):
Kya hoga: Jab user basic test values enter karega (jaise Total Protein aur Albumin), toh software automatically secondary parameters calculate kar lega (jaise Globulin = Total Protein - Albumin aur A/G Ratio).
Kahan kaam aayega: Lipid Profile (LDL/VLDL calculate karne ke liye), CBC (Absolute counts calculate karne ke liye), aur Kidney function (eGFR) mein.
Ref Ranges based on Age & Gender:
Kya hoga: Patient ki age aur gender ke mutabik normal range automatically print hogi report mein, jisse results abnormal hain ya nahi, yeh easily check ho sakega.
Pre-Printed Letterhead Margins:
Kya hoga: Settings mein option dena jisse user margin adjust kar sake (e.g., top margin 2.5 inches) taaki reports direct lab ke pre-printed pad/letterhead par bina kisi alignment issue ke print ho sakein.
2. 📱 Patient Experience & WhatsApp / SMS (Communication)
Automated WhatsApp/SMS Alert System:
Kya hoga: Patient register hote hi WhatsApp/SMS chala jaye: "Welcome, Rajesh. Your order has been registered at City Lab. Track here..." aur report approve hote hi link ke sath notification chala jaye.
Report QR Code Verification:
Kya hoga: Har report ke upar ek dynamic QR code print hoga. Jab doctor ya patient use mobile se scan karenge, toh software unhe PDF verify karne ka link dikhayega, jo report ki authenticity prove karega.

3. 💼 Finance & Lab Operations (Business Suite)
Referral Doctor Commission Ledger:
Kya hoga: Doctors ki billing aur unke commissions (jaise 10% on Biochemistry, 15% on Hematology) ko track karna. Har mahine ke aakhir mein doctor-wise payout report generate karna.
Outsource Test Tracker:
Kya hoga: Kuch tests jo aapki lab mein nahi hote aur aap bahar outsourcing ke liye bhejte hain, unka record rakhna: outsourcing cost kitni aayi, kis lab ko bheja, aur result aaya ya nahi.
Expenditure (Kharche) Manager:
Kya hoga: Staff salary, reagents/chemicals purchase, rent, aur light bills track karna, taaki dashboard par exact Net Profit/Loss dikh sake.

4. 🔌 Advanced Machine Interfacing (Automation)
Lab Analyzer Machine Integration:
Kya hoga: Software ko direct laboratory ki machines (jaise Sysmex/Mindray CBC analyzer ya Bio-chemistry analyzer) ke serial port (COM Port) ya LAN port se link karna, taaki machine ke results direct software mein load ho jayein bina kisi manual typing ke. Isse human error 0% ho jata hai.# offline-lab-report-generator

---

## Development

Requirements: Node 20+ and Windows 10/11 (the installer target). The app is Electron 44 + a static Next.js 14 export + SQLite (Prisma 5).

```bash
npm install
npm run electron:dev      # next dev + Electron (database: prisma/dev.db, created automatically)
npm run build             # prisma client + prisma/schema.sql + static export to out/
npm run electron:build    # build + Windows installer -> dist/JharLab-Setup-<version>.exe
npm test                  # backend + analyzer (ASTM/HL7 over real TCP) tests against real SQLite
npm run test:e2e          # Electron end-to-end tests on out/ (run `npm run build` first)
```

Run the E2E suite against the installed layout with `E2E_PACKAGED=1 npm run test:e2e` after `npm run pack`.

How it fits together:

- `main.js` — Electron main process. Serves `out/` and `/api/*` on the `app://-` origin, creates/updates the
  database schema on startup (`prisma/schema.sql`, additive migrations), GPU acceleration with automatic
  software fallback, single instance.
- `lib/server-api.js` — the only backend: licence, setup, login, generic DB access, QR verification, admin
  dashboard checks. Used by Electron and by `app/api/[...path]/route.ts` in `next dev`.
- `lib/machineServer.js` — analyzer interfacing: ASTM E1381/E1394 and HL7/MLLP over LAN (server or client)
  or RS-232/USB serial, host query order download, unit factors per machine code, auto-reconnect.
- Data lives in `%APPDATA%\JharLab\dev.db`. `JHARLAB_USER_DATA=<dir>` runs on an isolated profile.

Keyboard: `Ctrl+K` search · `F2` quick entry · `F3` results · `F4` reports · `F6` patients · `F7` billing ·
`Enter` moves to the next field.

### Roles, shifts and security

Who may do what lives in `lib/roles.js` and is enforced by the backend (`lib/server-api.js`), not just hidden in
the screens:

| Role | Can | Cannot |
|---|---|---|
| Lab Owner / Admin | everything | — |
| Lab Technician | registration, billing & payments, discounts, results, approving & printing reports, settings, machines, backups | delete patients/orders/bills, manage staff, restore a backup, read the audit log |
| Pathologist / Doctor | results, approve and correct reports | billing, settings |
| Receptionist (optional) | registration, billing, printing reports (results only if allowed) | results, approvals |
| Phlebotomist | sample and home collection | everything else |

- Staff, their logins and shifts (morning / evening / night / custom) are managed on **Staff & Logins**.
- Every change is stamped with whoever is signed in (bills, payments, results, approvals) and written to the
  **Audit Log**, which nobody can edit or delete. The dashboard's shift summary shows each person's cash,
  results and approvals for the day, and updates live.
- Each app launch starts at the sign-in screen; five wrong passwords lock sign-in for a minute. The installed
  app has no DevTools or reload shortcuts.
- Limitation: anyone with Windows access to `%APPDATA%\jharlab\dev.db` can still copy or edit the file directly.
  Give staff a standard Windows account and keep the owner's account separate.

### Backups

A copy of the database is made automatically every day (14 kept in `%APPDATA%\jharlab\backups`), on demand from
**Backup**, or saved to a pendrive / any folder. Restore (owner/admin only) checks the file, saves a safety copy of
the current data first, then restarts on the restored data.

### Everything stays on the PC

All data (patients, bills, results, staff, samples, home collections, outsourced tests, corporate clients,
expenses, stock) lives in one local SQLite file, so it works without internet and is included in every backup.
PDFs are made on demand on the PC (reports, bills, barcode sample labels, expense statements, stock register,
outsourcing register, home-collection run sheets); nothing is uploaded. The only online calls are the licence
check against the admin dashboard and the update check against GitHub Releases.

### Updates

Installed apps update themselves from this repo's GitHub Releases (electron-updater, `startAutoUpdates` in
`main.js`): checked at start and every 4 hours, downloaded in the background, installed silently when the lab
closes JharLab (or at once from "Restart now"). To ship an update, bump the version, commit, then push a tag:

```bash
npm version 1.7.1 --no-git-tag-version
git commit -am "v1.7.1: ..."
git tag v1.7.1
git push origin main v1.7.1
```

`.github/workflows/release.yml` builds the installer, runs `npm test` and the packaged E2E suite, and only then
publishes the release. A tag that fails any test publishes nothing. Every published release reaches every lab,
so follow `.claude/skills/safe-update` first. Labs on 1.6.0 or older install 1.7.0 once by hand.
