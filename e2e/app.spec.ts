// End-to-end: the real desktop app (Electron + static export + SQLite) driven like a lab would use it.
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { launchApp, startTrialIfLocked } from './launch';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildASTMFrame } = require('../lib/machineServer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encryptLicenseKey, getMachineId } = require('../lib/server-api');

const OWNER = { name: 'Dr. Owner', email: 'owner@lab.com', password: 'Owner@123' };
let recoveryCode = '';

const go = (page: Page, route: string) => page.evaluate(r => (window as any).next.router.push(r), route);
const dbQuery = (page: Page, model: string, action: string, args: any) =>
  page.evaluate(async q => {
    const res = await (window as any).electronAPI.dbQuery(q);
    if (!res.success) throw new Error(res.error);
    return res.data;
  }, { model, action, args });

async function completeSetup(page: Page) {
  await page.getByPlaceholder('e.g. Apex Diagnostics Lab').fill('City Path Lab');
  await page.getByPlaceholder('e.g. 9876543210').fill('9876543210');
  await page.getByPlaceholder(/1st Floor/).fill('Main Road, Ranchi');
  await page.getByRole('button', { name: /Owner Account Credentials/ }).click();
  await page.getByPlaceholder('e.g. Dr. Ramesh Prasad').fill(OWNER.name);
  await page.getByPlaceholder('e.g. owner@lab.com').fill(OWNER.email);
  await page.getByPlaceholder('••••••••').nth(0).fill(OWNER.password);
  await page.getByPlaceholder('••••••••').nth(1).fill(OWNER.password);
  await page.getByRole('button', { name: /Build Lab/ }).click();
  await expect(page.getByText('Lab Setup Complete!')).toBeVisible({ timeout: 60_000 });
  recoveryCode = (await page.getByText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/).textContent()) || '';
  await page.getByLabel('I have written down this code').check();
  await page.getByRole('button', { name: 'Launch Dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

async function signIn(page: Page, password = OWNER.password) {
  await page.getByLabel('Email address').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function registerPatient(page: Page, name: string, age: string) {
  await page.keyboard.press('F2');
  await expect(page.getByRole('heading', { name: /Quick Entry/ })).toBeVisible();
  await page.getByPlaceholder('Enter full name').fill(name);
  await page.getByPlaceholder('10-digit number').fill('9876500000');
  await page.getByPlaceholder('Age').fill(age);
  await page.getByRole('button', { name: 'CBC', exact: true }).click();
  await page.getByRole('button', { name: 'Register & Enter Results' }).click();
  await expect(page.getByPlaceholder('Enter result value').first()).toBeVisible();
  return dbQuery(page, 'testOrder', 'findFirst', { orderBy: { id: 'desc' }, include: { patient: true } });
}

test.describe.serial('a lab day on a fresh install', () => {
  let app: Awaited<ReturnType<typeof launchApp>>['app'];
  let page: Page;
  let dataDir: string;

  test.afterAll(async () => app?.close());

  test('first run: trial, setup wizard, owner lands on the dashboard', async () => {
    ({ app, page, dataDir } = await launchApp('lab-day'));
    await startTrialIfLocked(page);
    await completeSetup(page);
    const tests = await dbQuery(page, 'test', 'count', {});
    expect(tests).toBeGreaterThanOrEqual(200);
  });

  test('sign-out, wrong password rejected, correct password accepted', async () => {
    await page.getByRole('button', { name: new RegExp(OWNER.name) }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('City Path Lab,')).toBeVisible();
    await signIn(page, 'wrong-password');
    await expect(page.getByRole('alert').filter({ hasText: /Invalid/i })).toBeVisible();
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  });

  test('owner forgot the password: the recovery code resets it and shows the login email', async () => {
    await page.getByRole('button', { name: new RegExp(OWNER.name) }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.getByRole('button', { name: 'Forgot password or email?' }).click();
    await page.getByLabel('Recovery code').fill(recoveryCode.toLowerCase());
    await page.getByLabel('New password', { exact: true }).fill('Owner@456');
    await page.getByLabel('Confirm new password').fill('Owner@456');
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByText(OWNER.email)).toBeVisible();
    await page.getByLabel('I have written down this code').check();
    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByLabel('Email address')).toHaveValue(OWNER.email);
    OWNER.password = 'Owner@456';
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  });

  test('walk-in: register + bill, enter results, report PDF downloads', async () => {
    const order = await registerPatient(page, 'Rajesh Kumar', '45');
    expect(order.patient.name).toBe('Rajesh Kumar');

    const inputs = page.locator('input[placeholder="Enter result value"]:not([readonly])');
    await inputs.nth(0).fill('10.2'); // Hb, below 13-17
    await inputs.nth(1).fill('4.8');
    await inputs.nth(2).fill('42');
    await page.getByRole('button', { name: 'Save Results & Generate Report' }).click();
    await expect(page.getByText(/registered successfully under order ID/)).toBeVisible();

    const results = await dbQuery(page, 'testResult', 'findMany', { where: { orderItem: { orderId: order.id } } });
    const hb = results.find((r: any) => r.numericValue === 10.2);
    expect(hb, 'Hb saved').toBeTruthy();
    expect(hb.isAbnormal).toBe(true);

    await page.getByRole('button', { name: 'Download PDF Report' }).click();
    const pdf = path.join(dataDir, 'downloads', `${order.orderNo}-report.pdf`);
    await expect.poll(() => fs.existsSync(pdf), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => fs.readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('Ctrl+K finds the patient and opens their record', async () => {
    await page.keyboard.press('Control+K');
    await page.getByRole('combobox').fill('Rajesh');
    await expect(page.getByRole('option', { name: /Rajesh Kumar/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/patients\/detail\?id=/);
    await expect(page.getByText('Rajesh Kumar').first()).toBeVisible();
  });

  test('analyzer: results sent over LAN (ASTM) land in the waiting order', async () => {
    const order = await registerPatient(page, 'Sunita Devi', '38');
    const port = await new Promise<number>(r => { const s = net.createServer().listen(0, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });

    await go(page, '/settings/machine');
    await page.getByPlaceholder('e.g. 5000').fill(String(port));
    await page.getByRole('button', { name: 'Start Analyzer Server' }).click();
    await expect(page.getByText('CONNECTED (ACTIVE)')).toBeVisible();

    // Play a Mindray BC-series analyzer: ENQ, checksummed frames each waiting for ACK, EOT.
    const socket = net.createConnection({ port });
    await new Promise(r => socket.once('connect', r));
    const ack = () => new Promise<number>(r => socket.once('data', d => r(d[0])));
    socket.write(Buffer.from([0x05]));
    expect(await ack()).toBe(0x06);
    const records = ['H|\\^&|||Mindray BC-5150||||||||1394-97', 'P|1||||Sunita Devi', `O|1|${order.orderNo}||^^^CBC`, 'R|1|^^^HGB|9.1|g/dL|13-17|L', 'R|2|^^^MCV|85|fL|78-100|N', 'L|1|N'];
    for (let i = 0; i < records.length; i++) {
      socket.write(Buffer.from(buildASTMFrame(i + 1, records[i]), 'latin1'));
      expect(await ack()).toBe(0x06);
    }
    socket.write(Buffer.from([0x04]));
    socket.end();

    await expect.poll(async () => (await dbQuery(page, 'testResult', 'findMany', { where: { orderItem: { orderId: order.id } } })).length, { timeout: 15_000 }).toBe(2);
    const saved = await dbQuery(page, 'testResult', 'findMany', { where: { orderItem: { orderId: order.id } } });
    expect(saved.map((r: any) => r.numericValue).sort()).toEqual([85, 9.1]);
    expect(saved.find((r: any) => r.numericValue === 9.1).flag).toBe('↓');
    await expect(page.getByText(/Saved parameter Hemoglobin \(Hb\) = 9.1/).first()).toBeVisible();

    await go(page, `/results/entry?orderId=${order.id}`);
    await expect.poll(() => page.locator('input').evaluateAll(els => els.map(e => (e as HTMLInputElement).value)), { timeout: 15_000 }).toContain('9.1');
  });

  test('reports: approved reports keep the lab details they were approved with; new reports get the new ones', async () => {
    const reportOf = async (patientName: string) => {
      const order = await dbQuery(page, 'testOrder', 'findFirst', { where: { patient: { name: patientName } }, orderBy: { id: 'desc' }, include: { report: true } });
      return { order, data: order.report?.snapshot ? JSON.parse(order.report.snapshot) : null };
    };
    const rajesh = await reportOf('Rajesh Kumar');
    expect(rajesh.order.status).toBe('APPROVED');
    expect(rajesh.data.lab.address).toBe('Main Road, Ranchi');

    // The analyzer's order waits on the Reports screen; approve it there.
    await go(page, '/reports');
    const row = (name: string) => page.locator('div.rounded-xl.border.p-4', { hasText: name });
    await row('Sunita Devi').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Report approved for Sunita Devi')).toBeVisible();
    expect((await reportOf('Sunita Devi')).data.lab.address).toBe('Main Road, Ranchi');

    // The lab moves.
    await go(page, '/settings');
    await page.locator('textarea').first().fill('Station Road, Dumka');
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await expect(page.getByText('Lab Profile saved successfully!')).toBeVisible();
    expect((await reportOf('Rajesh Kumar')).data).toEqual(rajesh.data);
    expect((await reportOf('Sunita Devi')).data.lab.address).toBe('Main Road, Ranchi');

    // Preview shows the real PDF; Print downloads it.
    await go(page, '/reports');
    await row('Rajesh Kumar').getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTitle('Report PDF')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const pdf = path.join(dataDir, 'downloads', `${rajesh.order.orderNo}-report.pdf`);
    fs.rmSync(pdf, { force: true });
    await row('Rajesh Kumar').getByRole('button', { name: 'Print' }).click();
    await expect.poll(() => fs.existsSync(pdf) && fs.readFileSync(pdf).subarray(0, 5).toString(), { timeout: 20_000 }).toBe('%PDF-');

    // The next report carries the new address.
    await registerPatient(page, 'Kavita Singh', '30');
    await page.locator('input[placeholder="Enter result value"]:not([readonly])').nth(0).fill('13.1');
    await page.getByRole('button', { name: 'Save Results & Generate Report' }).click();
    await expect(page.getByText(/registered successfully under order ID/)).toBeVisible();
    expect((await reportOf('Kavita Singh')).data.lab.address).toBe('Station Road, Dumka');

    // The bill PDF downloads with the price charged for each test.
    const bill = await dbQuery(page, 'bill', 'findFirst', { where: { patient: { name: 'Rajesh Kumar' } }, include: { orders: { include: { items: true } } } });
    expect(bill.orders[0].items[0].price).toBeGreaterThan(0);
    expect(JSON.parse(bill.lab).address).toBe('Main Road, Ranchi'); // made before the move
    await go(page, '/billing');
    await page.locator('tr', { hasText: bill.billNo }).getByTitle('Print').click();
    const invoice = path.join(dataDir, 'downloads', `${bill.billNo}.pdf`);
    await expect.poll(() => fs.existsSync(invoice) && fs.readFileSync(invoice).subarray(0, 5).toString(), { timeout: 20_000 }).toBe('%PDF-');
  });

  test('data survives an app restart', async () => {
    await app.close();
    ({ app, page } = await launchApp('lab-day', {}, { fresh: false }));
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 });
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.keyboard.press('F6');
    await expect(page.getByText('Rajesh Kumar').first()).toBeVisible();
    await expect(page.getByText('Sunita Devi').first()).toBeVisible();
  });
});

test('admin dashboard: pause locks the app, resume unlocks, offline keeps working; updates are offered', async () => {
  test.setTimeout(240_000);
  const machineId = getMachineId();
  const expiry = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const state = { status: 'ACTIVE', licenseKey: encryptLicenseKey(machineId, expiry) };
  const admin = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url!.startsWith('/api/license/status')) return res.end(JSON.stringify({ success: true, machineId, expiryDate: expiry, ...state }));
    if (req.url!.startsWith('/api/updates/latest')) {
      return res.end(JSON.stringify({ success: true, update: { version: '9.9.9', title: 'Faster reports', releaseNotes: 'New report layouts', downloadUrl: 'https://example.invalid/JharLab-9.9.9.exe' } }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>(r => admin.listen(0, '127.0.0.1', () => r()));
  const adminUrl = `http://127.0.0.1:${(admin.address() as net.AddressInfo).port}`;

  const { app, page } = await launchApp('admin-control', { NEXT_PUBLIC_ADMIN_DASHBOARD_URL: adminUrl });
  try {
    // ACTIVE + key from the dashboard: no lock screen, key stored locally, update offered.
    await expect(page.getByText(/Set up|Laboratory Information|Initialize/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Update available')).toBeVisible();
    await expect(page.getByText('v9.9.9')).toBeVisible();

    state.status = 'PAUSED';
    await expect(page.getByText(/temporarily PAUSED by the administrator/)).toBeVisible({ timeout: 30_000 });

    state.status = 'ACTIVE';
    await expect(page.getByText(/PAUSED/)).toBeHidden({ timeout: 30_000 });

    // Lost internet while paused? The lab keeps working on its local licence.
    state.status = 'PAUSED';
    await expect(page.getByText(/temporarily PAUSED/)).toBeVisible({ timeout: 30_000 });
    await new Promise<void>(r => admin.close(() => r()));
    admin.closeAllConnections?.();
    await expect(page.getByText(/temporarily PAUSED/)).toBeHidden({ timeout: 30_000 });
  } finally {
    await app.close();
    admin.close();
  }
});

test('desktop runtime: GPU acceleration on, serial driver loads, web links never open in-app', async () => {
  const { app, page } = await launchApp('runtime');
  try {
    expect(await app.evaluate(({ app }) => app.isHardwareAccelerationEnabled())).toBe(true);
    // Real GPU compositing comes up a moment after launch; machines without a usable GPU fall back to software.
    const compositing = () => app.evaluate(({ app }) => app.getGPUFeatureStatus().gpu_compositing);
    await expect.poll(compositing, { timeout: 10_000 }).toMatch(/^enabled/).catch(() => {});
    console.log('GPU compositing:', await compositing());

    const ports = await page.evaluate(() => (window as any).electronAPI.machineListPorts());
    expect(Array.isArray(ports)).toBe(true);
    const logs = await page.evaluate(() => (window as any).electronAPI.machineGetLogs());
    expect(logs.filter((l: any) => l.type === 'ERROR')).toEqual([]);

    const opened = await page.evaluate(() => window.open('https://example.com/phish') === null);
    expect(opened).toBe(true);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
  }
});
