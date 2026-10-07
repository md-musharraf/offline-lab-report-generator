// A small lab run by technicians on shifts, with the owner in control: driven through the real app.
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { launchApp, startTrialIfLocked } from './launch';

const OWNER = { email: 'owner@lab.com', password: 'Owner@123' };
const TECH = { name: 'Asha Kumari', email: 'asha@lab.com', password: 'Asha@123' };

const go = (page: Page, route: string) => page.evaluate(r => (window as any).next.router.push(r), route);
const ipcDb = (page: Page, model: string, action: string, args: any) =>
  page.evaluate(q => (window as any).electronAPI.dbQuery(q), { model, action, args });

async function signIn(page: Page, who: { email: string; password: string }) {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

async function signOut(page: Page) {
  await page.locator('header button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

async function registerWalkIn(page: Page, name: string) {
  await page.keyboard.press('F2');
  await page.getByPlaceholder('Enter full name').fill(name);
  await page.getByPlaceholder('10-digit number').fill('9876500001');
  await page.getByPlaceholder('Age').fill('30');
  await page.getByRole('button', { name: 'CBC', exact: true }).click();
  await page.getByRole('button', { name: 'Register & Enter Results' }).click();
  const inputs = page.locator('input[placeholder="Enter result value"]:not([readonly])');
  await inputs.nth(0).fill('13.4');
  await page.getByRole('button', { name: 'Save Results & Generate Report' }).click();
  await expect(page.getByText(/registered successfully under order ID/)).toBeVisible();
}

test.describe.serial('technician-run lab with owner control', () => {
  let app: Awaited<ReturnType<typeof launchApp>>['app'];
  let page: Page;
  let dataDir: string;
  test.afterAll(async () => app?.close());

  test('owner sets up the lab and adds a morning-shift technician with her own login', async () => {
    ({ app, page, dataDir } = await launchApp('roles', { JHARLAB_NO_RELAUNCH: '1' }));
    await startTrialIfLocked(page);
    await page.getByPlaceholder('e.g. Apex Diagnostics Lab').fill('Small Lab');
    await page.getByPlaceholder('e.g. 9876543210').fill('9876543210');
    await page.getByPlaceholder(/1st Floor/).fill('Dumka');
    await page.getByRole('button', { name: /Owner Account Credentials/ }).click();
    await page.getByPlaceholder('e.g. Dr. Ramesh Prasad').fill('Owner');
    await page.getByPlaceholder('e.g. owner@lab.com').fill(OWNER.email);
    await page.getByPlaceholder('••••••••').nth(0).fill(OWNER.password);
    await page.getByPlaceholder('••••••••').nth(1).fill(OWNER.password);
    await page.getByRole('button', { name: /Build Lab/ }).click();
    await page.getByLabel('I have written down this code').check();
    await page.getByRole('button', { name: 'Launch Dashboard' }).click({ timeout: 60_000 });

    await go(page, '/staff');
    await page.getByRole('button', { name: 'Add staff' }).click();
    await page.getByLabel('Full name *').fill(TECH.name);
    await expect(page.getByLabel('Role *')).toHaveValue('TECHNICIAN');
    await expect(page.getByLabel('Shift')).toHaveValue('MORNING');
    await page.getByLabel('Login email *').fill(TECH.email);
    await page.getByLabel('Password * (min 6)').fill(TECH.password);
    await page.getByRole('button', { name: 'Save staff member' }).click();
    const row = page.getByTestId(`staff-row-${TECH.name}`);
    await expect(row).toContainText('Lab Technician');
    await expect(row).toContainText('08:00–14:00');
    await expect(row).toContainText(TECH.email);
  });

  test('the technician runs the desk: registers, collects money, enters and approves results', async () => {
    await signOut(page);
    await signIn(page, TECH);
    const nav = page.locator('aside');
    const link = (name: string) => nav.getByRole('link', { name: new RegExp(`^${name}( F[0-9])?$`) });
    for (const allowed of ['Quick Entry', 'Billing', 'Results Entry', 'Reports', 'Settings', 'Backup']) {
      await expect(link(allowed)).toBeVisible();
    }
    for (const hidden of ['Staff', 'Audit Log']) await expect(link(hidden)).toHaveCount(0);

    await registerWalkIn(page, 'Sunil Murmu');
    const report = await ipcDb(page, 'report', 'findFirst', {});
    expect(report.success).toBe(true);
    expect(report.data.approvedBy, 'approved by the technician herself').toBeTruthy();

    await go(page, '/dashboard');
    const mine = page.getByTestId(`shift-row-${TECH.name}`);
    await expect(mine).toContainText('(you)');
    await expect(mine).not.toContainText('₹0');
    await expect(page.getByTestId('shift-summary').locator('tbody tr')).toHaveCount(1);
  });

  test('the technician cannot delete patients: no button, and the backend refuses it too', async () => {
    await page.keyboard.press('F6');
    await expect(page.getByText('Sunil Murmu').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);
    const patient = (await ipcDb(page, 'patient', 'findFirst', {})).data;
    const attempt = await ipcDb(page, 'patient', 'delete', { where: { id: patient.id } });
    expect(attempt.success).toBe(false);
    expect(attempt.error).toMatch(/not allowed/);
    const viaRoute = await page.evaluate(id => fetch('/api/patients/delete', { method: 'POST', body: JSON.stringify({ ids: [id] }) }).then(r => r.status), patient.id);
    expect(viaRoute).toBe(403);
    await go(page, '/staff');
    await expect(page.getByText(/don.t have access to Staff/)).toBeVisible();
  });

  test('backups: the technician backs up and saves a copy for the pendrive', async () => {
    await go(page, '/backup');
    await page.getByRole('button', { name: 'Back up now' }).click();
    await expect(page.getByTestId('backup-row').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Restore/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Save a copy/ }).click();
    const copy = path.join(dataDir, 'downloads', `JharLab-backup-${new Date().toISOString().slice(0, 10)}.db`);
    await expect(page.getByText(/Copy saved to/)).toBeVisible(); // the app reports success once the copy is complete
    expect(fs.readFileSync(copy).subarray(0, 15).toString()).toBe('SQLite format 3');
  });

  test('the owner sees the whole shift live, deletes a patient, and finds it all in the audit log', async () => {
    await signOut(page);
    await signIn(page, OWNER);
    const techRow = page.getByTestId(`shift-row-${TECH.name}`);
    await expect(techRow).toBeVisible();
    const before = await techRow.locator('td').nth(2).innerText();

    // Live: a payment recorded elsewhere shows up without reloading the dashboard.
    const bill = (await ipcDb(page, 'bill', 'findFirst', {})).data;
    await ipcDb(page, 'payment', 'create', { data: { billId: bill.id, amount: 250, method: 'UPI', receivedBy: 0 } });
    const ownerRow = page.getByTestId('shift-row-Owner');
    await expect(ownerRow.locator('td').nth(2)).toHaveText('₹250', { timeout: 10_000 });
    await expect(techRow.locator('td').nth(2)).toHaveText(before);

    await page.keyboard.press('F6');
    await page.getByRole('button', { name: 'Delete Sunil Murmu' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Sunil Murmu')).toHaveCount(0);

    await go(page, '/audit-log');
    await expect(page.getByText('Deleted patient').first()).toBeVisible();
    await expect(page.getByText(/Sunil Murmu \(LAB-/).first()).toBeVisible();
    await expect(page.getByText('Created payment').first()).toBeVisible();
    await expect(page.getByText(TECH.name).first()).toBeVisible();
  });

  test('the owner restores the morning backup: the deleted patient comes back', async () => {
    await go(page, '/backup');
    const backups = await page.evaluate(() => fetch('/api/backup/list').then(r => r.json()));
    const morning = backups.backups.find((b: any) => b.type === 'MANUAL');
    await page.evaluate(file => (window as any).electronAPI.backupRestore(file), morning.file);
    await new Promise<void>(resolve => app.process().once('exit', () => resolve()));

    ({ app, page } = await launchApp('roles', { JHARLAB_NO_RELAUNCH: '1' }, { fresh: false }));
    await signIn(page, OWNER);
    await page.keyboard.press('F6');
    await expect(page.getByText('Sunil Murmu').first()).toBeVisible();
    await go(page, '/backup');
    await expect(page.getByText('Safety copy before a restore')).toBeVisible();
  });
});
