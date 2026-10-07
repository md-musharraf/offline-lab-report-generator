// Desktop app <-> the real admin dashboard code (github.com/md-musharraf/admin.labmanagement), run locally.
// Opt-in: ADMIN_DASHBOARD_DIR=<path to admin_dashboard_lab> npm run test:e2e -- admin-integration
// The dashboard runs in its file-backed demo mode, so no production Supabase data is touched.
import { test, expect, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { pathToFileURL } from 'url';
import { launchApp } from './launch';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getMachineId } = require('../lib/server-api');

const adminDir = process.env.ADMIN_DASHBOARD_DIR || '';
test.skip(!adminDir, 'set ADMIN_DASHBOARD_DIR to run against the admin dashboard');

const customersFile = path.join(adminDir, 'customers_db.json');
const updatesFile = path.join(adminDir, 'updates_db.json');
let server: ChildProcess;
let baseUrl = '';
let encrypt: (machineId: string, expiry: string) => string;
const existed = { customers: false, updates: false };

const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
function setCustomer(fields: Partial<{ status: string; expiry_date: string; license_key: string; machine_id: string }> | null) {
  const machineId = ` ${getMachineId().toUpperCase()} \n`; // pasted badly on purpose
  const expiry = fields?.expiry_date || day(365);
  const rows = fields === null ? [] : [{
    id: 'e2e-lab', created_at: day(-1), lab_name: 'E2E Lab', owner_name: 'Owner', phone: '9000000000', price: 0,
    machine_id: machineId, expiry_date: expiry, status: 'ACTIVE', license_key: encrypt(machineId, expiry), ...fields,
  }];
  fs.writeFileSync(customersFile, JSON.stringify(rows, null, 2));
}
const lockText = (page: Page, re: RegExp) => page.getByText(re).first();

test.beforeAll(async () => {
  test.setTimeout(180_000);
  existed.customers = fs.existsSync(customersFile);
  existed.updates = fs.existsSync(updatesFile);
  ({ encrypt } = await import(pathToFileURL(path.join(adminDir, 'lib', 'keygen.ts')).href));
  const port = await new Promise<number>(r => { const s = net.createServer().listen(0, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
  baseUrl = `http://localhost:${port}`;
  setCustomer({});
  fs.writeFileSync(updatesFile, JSON.stringify([{ version: '9.0.0', title: 'Big update', releaseNotes: 'Pushed from the dashboard', downloadUrl: 'https://example.invalid/JharLab-9.0.0.exe', isCritical: false, publishedAt: day(0) }]));
  server = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: adminDir,
    shell: true,
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://dummy.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy', SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  await expect.poll(async () => (await fetch(`${baseUrl}/api/updates/latest`).catch(() => null))?.status, { timeout: 150_000, intervals: [2000] }).toBe(200);
});

test.afterAll(() => {
  if (server?.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f']); // whole tree: npx -> next -> worker
  if (!existed.customers) fs.rmSync(customersFile, { force: true });
  if (!existed.updates) fs.rmSync(updatesFile, { force: true });
});

test('licence lifecycle driven from the admin dashboard', async () => {
  test.setTimeout(300_000);
  const { app, page } = await launchApp('admin-integration', { NEXT_PUBLIC_ADMIN_DASHBOARD_URL: baseUrl });
  const licence = () => page.evaluate(() => (window as any).electronAPI.licenseCheck());
  const unlocked = () =>
    expect(page.getByText(/Laboratory Setup|Initialize your pathology/).or(page.getByRole('heading', { name: 'Dashboard', exact: true })).first())
      .toBeVisible({ timeout: 40_000 });
  try {
    // Registered lab: the key the dashboard generated (from a badly pasted machine ID) installs itself.
    await unlocked();
    expect((await licence()).valid).toBe(true);
    await expect(page.getByText('v9.0.0')).toBeVisible();

    setCustomer({ status: 'PAUSED' });
    await expect(lockText(page, /temporarily PAUSED/)).toBeVisible({ timeout: 40_000 });
    setCustomer({ status: 'ACTIVE' });
    await unlocked();

    // The lab finishes setup, so the owner is signed in (the backend only accepts changes from a signed-in user).
    await page.getByPlaceholder('e.g. Apex Diagnostics Lab').fill('E2E Lab');
    await page.getByPlaceholder('e.g. 9876543210').fill('9000000000');
    await page.getByPlaceholder(/1st Floor/).fill('Ranchi');
    await page.getByRole('button', { name: /Owner Account Credentials/ }).click();
    await page.getByPlaceholder('e.g. Dr. Ramesh Prasad').fill('Owner');
    await page.getByPlaceholder('e.g. owner@lab.com').fill('owner@e2e.test');
    await page.getByPlaceholder('••••••••').nth(0).fill('Owner@123');
    await page.getByPlaceholder('••••••••').nth(1).fill('Owner@123');
    await page.getByRole('button', { name: /Build Lab/ }).click();
    await page.getByLabel('I have written down this code').check();
    await page.getByRole('button', { name: 'Launch Dashboard' }).click({ timeout: 60_000 });
    await unlocked();

    setCustomer({ status: 'STOPPED' });
    await expect(lockText(page, /STOPPED\/REVOKED/)).toBeVisible({ timeout: 40_000 });
    setCustomer({ status: 'ACTIVE' });
    await unlocked();

    // Subscription lapsed: ACTIVE on the dashboard must not keep an expired key alive.
    const cleared = await page.evaluate(() => (window as any).electronAPI.dbQuery({ model: 'labSettings', action: 'update', args: { where: { id: 1 }, data: { licenseKey: null } } }));
    expect(cleared.success, JSON.stringify(cleared)).toBe(true);
    setCustomer({ expiry_date: day(-2) });
    await expect(lockText(page, /expired/i)).toBeVisible({ timeout: 40_000 });

    // Renewed on the dashboard: the new key arrives and unlocks without anyone typing it.
    setCustomer({ expiry_date: day(30) });
    await unlocked();
    expect((await licence()).valid).toBe(true);

    // Deleted from the dashboard.
    setCustomer(null);
    await expect(lockText(page, /DELETED by the administrator/)).toBeVisible({ timeout: 40_000 });
  } finally {
    await app.close();
  }
});
