// The day-to-day record screens (expenses, stock, samples, home collection, outsourcing, corporate) used
// through the real app: everything is saved on this PC, survives a restart, and PDFs are made on demand.
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { launchApp, startTrialIfLocked } from './launch';

const OWNER = { email: 'owner@lab.com', password: 'Owner@123' };
// Local dates, like the app's file names (UTC is still yesterday before 5:30 AM IST).
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const month = () => today().slice(0, 7);
const go = (page: Page, route: string) => page.evaluate(r => (window as any).next.router.push(r), route);

async function pdfSaved(dataDir: string, name: string) {
  const file = path.join(dataDir, 'downloads', name);
  await expect.poll(() => fs.existsSync(file), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => fs.readFileSync(file).subarray(0, 5).toString()).toBe('%PDF-');
  return fs.readFileSync(file);
}

test.describe.serial('record screens save on the PC', () => {
  let app: Awaited<ReturnType<typeof launchApp>>['app'];
  let page: Page;
  let dataDir: string;
  let orderNo = '';
  test.afterAll(async () => app?.close());

  test('set up the lab', async () => {
    ({ app, page, dataDir } = await launchApp('screens'));
    await startTrialIfLocked(page);
    await page.getByPlaceholder('e.g. Apex Diagnostics Lab').fill('Records Lab');
    await page.getByPlaceholder('e.g. 9876543210').fill('9876543210');
    await page.getByPlaceholder(/1st Floor/).fill('Deoghar');
    await page.getByRole('button', { name: /Owner Account Credentials/ }).click();
    await page.getByPlaceholder('e.g. Dr. Ramesh Prasad').fill('Owner');
    await page.getByPlaceholder('e.g. owner@lab.com').fill(OWNER.email);
    await page.getByPlaceholder('••••••••').nth(0).fill(OWNER.password);
    await page.getByPlaceholder('••••••••').nth(1).fill(OWNER.password);
    await page.getByRole('button', { name: /Build Lab/ }).click();
    await page.getByLabel('I have written down this code').check();
    await page.getByRole('button', { name: 'Launch Dashboard' }).click({ timeout: 60_000 });
  });

  test('expenditure: add an expense, see the total, download the PDF statement', async () => {
    await go(page, '/expenditure');
    await page.getByRole('button', { name: 'Add expense' }).click();
    await page.getByLabel('Description *').fill('CBC reagent pack');
    await page.getByLabel('Amount (₹) *').fill('1200');
    await page.getByLabel('Paid to').fill('Sysmex distributor');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByTestId('expense-row')).toContainText('CBC reagent pack');
    await expect(page.getByTestId('expense-total')).toHaveText('₹1,200');
    await page.getByRole('button', { name: 'PDF statement' }).click();
    await pdfSaved(dataDir, `expenses-${month()}.pdf`);

    await go(page, '/dashboard');
    await expect(page.getByTestId('month-money')).toContainText('Expenses this month');
    await expect(page.getByTestId('month-money')).toContainText('₹1,200');
  });

  test('inventory: add stock, use some, get the low-stock warning, download the register', async () => {
    await go(page, '/inventory');
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByLabel('Item name *').fill('EDTA tubes');
    await page.getByLabel('Category').selectOption('TUBE');
    await page.getByLabel('Opening stock').fill('100');
    await page.getByLabel('Alert below (minimum)').fill('50');
    await page.getByRole('button', { name: 'Save item' }).click();
    const row = page.getByTestId('stock-row-EDTA tubes');
    await expect(row).toContainText('100 pcs');
    await expect(row).toContainText('In stock');

    await page.getByRole('button', { name: 'Stock out: EDTA tubes' }).click();
    await page.getByLabel('Quantity (pcs)').fill('70');
    await page.getByLabel('Note').fill('Used this week');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(row).toContainText('30 pcs');
    await expect(row).toContainText('Low');
    await expect(page.getByTestId('stock-attention')).toHaveText('1');
    await page.getByRole('button', { name: 'PDF register' }).click();
    await pdfSaved(dataDir, `stock-register-${today()}.pdf`);
  });

  test('samples: a registered patient appears, gets collected and a barcode label prints', async () => {
    await page.keyboard.press('F2');
    await page.getByPlaceholder('Enter full name').fill('Sita Kumari');
    await page.getByPlaceholder('10-digit number').fill('9876500002');
    await page.getByPlaceholder('Age').fill('29');
    await page.getByRole('button', { name: 'CBC', exact: true }).click();
    await page.getByRole('button', { name: 'Register & Enter Results' }).click();
    await expect(page.getByPlaceholder('Enter result value').first()).toBeVisible();
    orderNo = (await page.evaluate(() => (window as any).electronAPI.dbQuery({ model: 'testOrder', action: 'findFirst', args: {} }))).data.orderNo;

    await go(page, '/samples');
    await expect(page.getByText(orderNo)).toBeVisible();
    await page.getByRole('button', { name: 'Collect', exact: true }).click();
    await expect(page.getByText(/✓ Collected/)).toBeVisible();
    await page.getByRole('button', { name: 'Label', exact: true }).click();
    const label = await pdfSaved(dataDir, `label-${orderNo}.pdf`);
    expect(label.includes(Buffer.from('/Image')), 'label carries the barcode image').toBe(true);
    const order = (await page.evaluate(() => (window as any).electronAPI.dbQuery({ model: 'testOrder', action: 'findFirst', args: {} }))).data;
    expect(order.collectedAt).toBeTruthy();
    expect(order.barcodeData).toBe(orderNo);
  });

  test('home collection: schedule, assign, travel, collect, run sheet', async () => {
    await go(page, '/home-collection');
    await page.getByRole('button', { name: 'Schedule collection' }).click();
    await page.getByLabel('Patient name *').fill('Meena Devi');
    await page.getByLabel('Phone').fill('9123456789');
    await page.getByLabel('Address *').fill('Ward 4, near Shiv Mandir');
    await page.getByLabel('Tests').fill('Lipid profile');
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    const row = page.getByTestId('collection-row-Meena Devi');
    await expect(row).toContainText('Not assigned');

    await row.getByRole('button', { name: 'Assign' }).click();
    await page.getByLabel('Who will collect?').selectOption({ label: 'Owner · Lab Owner' });
    await page.getByRole('dialog').getByRole('button', { name: 'Assign' }).click();
    await expect(row).toContainText('Assigned');
    await row.getByRole('button', { name: 'Start' }).click();
    await expect(row).toContainText('On the way');
    await row.getByRole('button', { name: 'Collected' }).click();
    await expect(row).toContainText('Collected');
    await page.getByRole('button', { name: 'Run sheet PDF' }).click();
    await pdfSaved(dataDir, `home-collection-${today()}.pdf`);
  });

  test('outsourcing: add a partner lab, send a test, receive the result', async () => {
    await go(page, '/outsource');
    await page.getByRole('button', { name: 'Partner labs' }).click();
    await page.getByRole('button', { name: 'Add partner lab' }).click();
    await page.getByLabel('Lab name *').fill('Metro Reference Lab');
    await page.getByRole('button', { name: 'Save lab' }).click();
    await expect(page.getByRole('cell', { name: 'Metro Reference Lab', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Tests sent' }).click();
    await page.getByRole('button', { name: 'Send a test' }).click();
    await page.getByLabel('Patient name *').fill('Sita Kumari');
    await page.getByLabel('Test *').fill('Vitamin D');
    await page.getByLabel('Cost (₹)').fill('650');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const row = page.getByTestId('outsourced-row-Vitamin D');
    await expect(row).toContainText('Awaiting result');
    await row.getByRole('button', { name: 'Result received' }).click();
    await expect(row).toContainText('Result received');
    await expect(page.getByTestId('outsource-cost')).toHaveText('₹650');
  });

  test('corporate: add a client with an agreed discount', async () => {
    await go(page, '/corporate');
    await page.getByRole('button', { name: 'Add client' }).click();
    await page.getByLabel('Company / hospital name *').fill('Coal India Hospital');
    await page.getByLabel('Discount (%)').fill('15');
    await page.getByRole('button', { name: 'Save client' }).click();
    await expect(page.getByTestId('corporate-row-Coal India Hospital')).toContainText('15%');
  });

  test('after a restart every record is still there', async () => {
    await app.close();
    ({ app, page } = await launchApp('screens', {}, { fresh: false }));
    await page.getByLabel('Email address').fill(OWNER.email);
    await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

    const checks: [string, string | RegExp][] = [
      ['/expenditure', 'CBC reagent pack'],
      ['/inventory', '30 pcs'],
      ['/samples', /✓ Collected/],
      ['/home-collection', 'Meena Devi'],
      ['/outsource', 'Vitamin D'],
      ['/corporate', 'Coal India Hospital'],
    ];
    for (const [route, text] of checks) {
      await go(page, route);
      await expect(page.getByText(text).first(), `${route} kept its data`).toBeVisible();
    }
    await go(page, '/audit-log');
    for (const action of ['Created expense', 'Stock out', 'Updated home collection', 'Created outsourced test', 'Created corporate client']) {
      await expect(page.getByText(action).first()).toBeVisible();
    }
  });
});
