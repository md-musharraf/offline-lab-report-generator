// The desktop backend against a real SQLite file: schema upgrades, first-run setup, sign-in, the role
// rules (what a technician / receptionist / owner may do), audit trail, numbering, staff & shifts, backups.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PrismaClient } = require('../prisma/client');
const api = require('../lib/server-api');
const roles = require('../lib/roles');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jharlab-api-'));
const prisma = new PrismaClient({ datasources: { db: { url: `file:${path.join(tmp, 'test.db').replace(/\\/g, '/')}` } } });
const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.sql'), 'utf8');

// One backend context per signed-in person, like the app's single session.
const owner = { prisma, dataDir: tmp, session: null };
const call = (ctx, method, name, body) => api.callRoute(ctx, method, name, body);
const q = (ctx, model, action, args) => api.dbQuery(prisma, { model, action, args }, ctx);
const denied = (promise, re = /not allowed|sign in/i) => assert.rejects(promise, re);
let tech;
let recep;
let techUserId;
let ownerCode;

async function signIn(email, password) {
  const ctx = { prisma, dataDir: tmp, session: null };
  const res = await call(ctx, 'POST', 'auth/login', { email, password });
  assert.equal(res.json.success, true, JSON.stringify(res.json));
  return ctx;
}

before(() => api.ensureSchema(prisma, sql));
after(async () => {
  await prisma.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('roles: technician runs the lab, only owner/admin can delete patients, manage staff or restore', () => {
  for (const action of ['register', 'billing', 'discount', 'results', 'report:approve', 'settings', 'backup:create']) {
    assert.equal(roles.can('TECHNICIAN', action), true, action);
  }
  for (const action of ['patient:delete', 'staff:manage', 'backup:restore', 'bill:delete', 'audit:view']) {
    assert.equal(roles.can('TECHNICIAN', action), false, action);
    assert.equal(roles.can('SUPER_ADMIN', action), true, action);
    assert.equal(roles.can('ADMIN', action), true, action);
  }
  assert.equal(roles.can('TECHNICIAN:DELETE_PATIENTS', 'patient:delete'), false, 'old add-on no longer grants delete');
  assert.equal(roles.can('RECEPTIONIST', 'results'), false);
  assert.equal(roles.can('RECEPTIONIST:ACCESS_RESULTS', 'results'), true);
  assert.equal(roles.can('DOCTOR', 'report:approve'), true, 'old DOCTOR logins act as pathologist');
  assert.equal(roles.canOpen('TECHNICIAN', '/billing/new'), true);
  assert.equal(roles.canOpen('TECHNICIAN', '/staff'), false);
  assert.equal(roles.canOpen('TECHNICIAN', '/audit-log'), false);
  assert.equal(roles.canOpen('PHLEBOTOMIST', '/billing'), false);
  assert.equal(roles.canOpen('NOBODY', '/dashboard'), false);
});

test('ensureSchema re-adds columns an older install is missing, and is idempotent', async () => {
  await prisma.$executeRawUnsafe('ALTER TABLE "Doctor" DROP COLUMN "commission"');
  await prisma.$executeRawUnsafe('ALTER TABLE "Staff" DROP COLUMN "shift"');
  await api.ensureSchema(prisma, sql);
  await api.ensureSchema(prisma, sql);
  const cols = async t => (await prisma.$queryRawUnsafe(`PRAGMA table_info("${t}")`)).map(c => c.name);
  assert.ok((await cols('Doctor')).includes('commission'));
  assert.ok((await cols('Staff')).includes('shift'));
});

test('first-run setup creates the owner, names the lab, seeds the catalog and signs the owner in', async () => {
  assert.equal((await call(owner, 'GET', 'auth/setup-status')).json.isSetupRequired, true);
  await call(owner, 'GET', 'license/check'); // placeholder settings row, as on a real first launch
  const res = await call(owner, 'POST', 'auth/setup', {
    labName: 'City Path Lab', mobile: '9000000000', address: 'Ranchi', ownerName: 'Owner', ownerEmail: 'Owner@Lab.test', ownerPassword: 'Secret@123',
  });
  assert.equal(res.json.success, true, JSON.stringify(res.json));
  assert.equal(owner.session.user.role, 'SUPER_ADMIN');
  ownerCode = res.json.recoveryCode;
  assert.match(ownerCode, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/, 'setup shows the owner a recovery code');
  assert.equal((await prisma.labSettings.findMany()).length, 1);
  assert.ok((await prisma.test.count()) >= 200);
  assert.equal((await call(owner, 'POST', 'auth/setup', { labName: 'x', mobile: 'x', address: 'x', ownerName: 'x', ownerEmail: 'x@x', ownerPassword: 'x' })).status, 400);
});

test('nothing but the sign-in screen works without signing in', async () => {
  const anon = { prisma, dataDir: tmp, session: null };
  assert.equal(await q(anon, 'user', 'count', {}), 1, 'sign-in screen may ask whether setup is done');
  await denied(q(anon, 'patient', 'findMany', {}));
  await denied(q(anon, 'patient', 'create', { data: { id: 'X', name: 'X', age: 1, gender: 'MALE', mobile: '1', createdBy: 1 } }));
  assert.equal((await call(anon, 'POST', 'patients/delete', { ids: ['X'] })).status, 403);
  assert.equal((await call(anon, 'GET', 'staff/list')).status, 403);
});

test('owner adds two technicians on different shifts and a receptionist, each with their own login', async () => {
  const save = body => call(owner, 'POST', 'staff/save', body);
  let r = await save({ name: 'Asha', role: 'TECHNICIAN', mobile: '9111111111', shift: 'MORNING', shiftStart: '08:00', shiftEnd: '14:00', login: { enabled: true, email: 'asha@lab.test', password: 'Asha@123' } });
  assert.equal(r.json.success, true, JSON.stringify(r.json));
  techUserId = r.json.staff.userId;
  r = await save({ name: 'Ravi', role: 'TECHNICIAN', shift: 'NIGHT', shiftStart: '20:00', shiftEnd: '08:00', login: { enabled: true, email: 'ravi@lab.test', password: 'Ravi@123' } });
  assert.equal(r.json.success, true);
  r = await save({ name: 'Rita', role: 'RECEPTIONIST', login: { enabled: true, email: 'rita@lab.test', password: 'Rita@123' } });
  assert.equal(r.json.success, true);
  assert.equal((await save({ name: 'Dup', role: 'TECHNICIAN', login: { enabled: true, email: 'asha@lab.test', password: 'x12345' } })).json.error, 'That email is already used by another login.');
  assert.equal((await save({ name: 'Boss', role: 'SUPER_ADMIN' })).status, 400, 'cannot mint another owner');

  const user = await prisma.user.findUnique({ where: { email: 'asha@lab.test' } });
  assert.match(user.password, /^\$2[aby]\$/, 'stored hashed');
  const list = (await call(owner, 'GET', 'staff/list')).json.staff;
  assert.equal(list.length, 3);
  assert.equal(list.find(s => s.name === 'Asha').login.email, 'asha@lab.test');
  assert.equal(JSON.stringify(list).includes('Asha@123'), false);

  tech = await signIn('asha@lab.test', 'Asha@123');
  recep = await signIn('rita@lab.test', 'Rita@123');
  assert.equal((await call(tech, 'GET', 'staff/list')).status, 403, 'technician cannot manage staff');
});

test('shift times decide who is on duty, including night shifts past midnight', () => {
  const at = h => new Date(2026, 9, 6, h, 30);
  const morning = { shiftStart: '08:00', shiftEnd: '14:00' };
  const night = { shiftStart: '20:00', shiftEnd: '08:00' };
  assert.equal(api.onShift(morning, at(9)), true);
  assert.equal(api.onShift(morning, at(15)), false);
  assert.equal(api.onShift(night, at(23)), true);
  assert.equal(api.onShift(night, at(3)), true);
  assert.equal(api.onShift(night, at(12)), false);
  assert.equal(api.onShift(null, at(9)), false);
});

test('technician registers, bills, collects, enters and approves results; stamps cannot be spoofed', async () => {
  const pid = (await call(tech, 'POST', 'numbers/next', { kind: 'patient' })).json.number;
  assert.match(pid, /^LAB-\d{4}-00001$/);
  await q(tech, 'patient', 'create', { data: { id: pid, name: 'Rajesh Kumar', age: 45, gender: 'MALE', mobile: '9876543210', createdBy: 999 } });
  const billNo = (await call(tech, 'POST', 'numbers/next', { kind: 'bill' })).json.number;
  const bill = await q(tech, 'bill', 'create', { data: { billNo, patientId: pid, subtotal: 400, totalAmount: 400, paidAmount: 400, discountValue: 50 } });
  await q(tech, 'payment', 'create', { data: { billId: bill.id, amount: 400, method: 'CASH', receivedBy: 1 } });
  const orderNo = (await call(tech, 'POST', 'numbers/next', { kind: 'order' })).json.number;
  const cbc = await prisma.test.findFirst({ where: { code: 'HEM001' }, include: { parameters: true } });
  const order = await q(tech, 'testOrder', 'create', { data: { orderNo, patientId: pid, billId: bill.id, items: { create: [{ testId: cbc.id }] } }, include: { items: true } });
  await q(tech, 'testResult', 'create', { data: { orderItemId: order.items[0].id, parameterId: cbc.parameters[0].id, numericValue: 10.2, status: 'ENTERED', enteredBy: 1 } });
  await q(tech, 'report', 'create', { data: { orderId: order.id, approvedBy: 1, approvedAt: new Date() } });
  await q(tech, 'labSettings', 'update', { where: { id: 1 }, data: { reportFooter: 'Checked by technician' } });

  const payment = await prisma.payment.findFirst();
  const result = await prisma.testResult.findFirst();
  const report = await prisma.report.findFirst();
  const patient = await prisma.patient.findUnique({ where: { id: pid } });
  for (const [what, value] of [['payment.receivedBy', payment.receivedBy], ['result.enteredBy', result.enteredBy], ['report.approvedBy', report.approvedBy], ['patient.createdBy', patient.createdBy]]) {
    assert.equal(value, techUserId, `${what} is whoever was signed in`);
  }

  const summary = (await call(tech, 'GET', 'dashboard/staff')).json.rows;
  assert.equal(summary.length, 1, 'a technician sees only their own row');
  assert.deepEqual([summary[0].collected, summary[0].results, summary[0].approvals], [400, 1, 1]);
  const all = (await call(owner, 'GET', 'dashboard/staff')).json.rows;
  assert.ok(all.length >= 4, 'the owner sees everyone');
  assert.equal(all.find(r => r.name === 'Asha').collected, 400);
});

test('technician cannot delete patients, bills or staff, read the audit log or touch it', async () => {
  const pid = (await prisma.patient.findFirst()).id;
  await denied(q(tech, 'patient', 'delete', { where: { id: pid } }));
  await denied(q(tech, 'patient', 'deleteMany', { where: {} }));
  await denied(q(tech, 'patient', 'update', { where: { id: pid }, data: { deletedAt: new Date() } }));
  await denied(q(tech, 'testOrder', 'deleteMany', { where: {} }));
  await denied(q(tech, 'bill', 'deleteMany', { where: {} }));
  await denied(q(tech, 'payment', 'deleteMany', { where: {} }));
  await denied(q(tech, 'user', 'update', { where: { id: techUserId }, data: { role: 'SUPER_ADMIN' } }), /not allowed/);
  await denied(q(tech, 'staff', 'create', { data: { name: 'x', role: 'ADMIN' } }));
  await denied(q(tech, 'activityLog', 'findMany', {}));
  assert.equal((await call(tech, 'POST', 'patients/delete', { ids: [pid] })).status, 403);
  await denied(q(owner, 'activityLog', 'deleteMany', { where: {} }), /not allowed/);
  await denied(q(owner, 'activityLog', 'update', { where: { id: 1 }, data: { details: 'x' } }), /not allowed/);
  assert.equal(await prisma.patient.count({ where: { id: pid } }), 1);
});

test('receptionist registers and bills but cannot enter or approve results (unless given results access)', async () => {
  const pid = (await prisma.patient.findFirst()).id;
  const item = await prisma.testOrderItem.findFirst();
  const cbc = await prisma.test.findFirst({ where: { code: 'HEM001' }, include: { parameters: true } });
  await q(recep, 'patient', 'update', { where: { id: pid }, data: { address: 'Main Road' } });
  await denied(q(recep, 'testResult', 'create', { data: { orderItemId: item.id, parameterId: cbc.parameters[1].id, numericValue: 4.8, status: 'ENTERED', enteredBy: 1 } }));
  await denied(q(recep, 'report', 'update', { where: { orderId: item.orderId }, data: { approvedBy: 1, approvedAt: new Date() } }));
  await q(recep, 'report', 'update', { where: { orderId: item.orderId }, data: { printCount: 1, deliveredAt: new Date() } });

  await call(owner, 'POST', 'staff/save', {
    id: (await prisma.staff.findFirst({ where: { name: 'Rita' } })).id, name: 'Rita', role: 'RECEPTIONIST',
    login: { enabled: true, email: 'rita@lab.test', addons: ['ACCESS_RESULTS'] },
  });
  const rita = await signIn('rita@lab.test', 'Rita@123');
  await q(rita, 'testResult', 'create', { data: { orderItemId: item.id, parameterId: cbc.parameters[1].id, numericValue: 4.8, status: 'ENTERED', enteredBy: 1 } });
});

test('password hashes never leave the backend, whatever query asks for them', async () => {
  const users = await q(owner, 'user', 'findMany', {});
  assert.ok(users.length >= 4);
  assert.ok(users.every(u => !('password' in u)));
  const logs = await q(owner, 'activityLog', 'findMany', { include: { user: true } });
  assert.ok(logs.every(l => !('password' in l.user)));
  const pats = await q(owner, 'patient', 'findMany', { include: { user: true } });
  assert.ok(pats.every(p => !('password' in p.user)));
});

test('every change is in the audit log under the person who made it', async () => {
  const logs = await q(owner, 'activityLog', 'findMany', { where: { userId: techUserId }, orderBy: { id: 'asc' } });
  const actions = logs.map(l => `${l.module}: ${l.action}`);
  for (const expected of ['Staff: Signed in', 'Patients: Created patient', 'Billing: Created bill', 'Billing: Created payment', 'Results: Created result', 'Reports: Created report', 'Settings: Updated lab settings']) {
    assert.ok(actions.includes(expected), `missing "${expected}" in ${actions.join(' | ')}`);
  }
  assert.match(logs.find(l => l.action === 'Created payment').details, /₹400 CASH on bill #\d+/, 'details are readable, not JSON');
  assert.match(logs.find(l => l.action === 'Created patient').details, /^Rajesh Kumar \(LAB-\d{4}-00001\)$/);
});

test('owner deletes a patient: everything goes in one transaction and the deletion is audited', async () => {
  const pid = (await prisma.patient.findFirst()).id;
  const res = await call(owner, 'POST', 'patients/delete', { ids: [pid] });
  assert.equal(res.json.success, true, JSON.stringify(res.json));
  for (const model of ['patient', 'testOrder', 'testOrderItem', 'testResult', 'report', 'bill', 'payment']) {
    assert.equal(await prisma[model].count(), 0, `${model} rows left behind`);
  }
  const entry = await prisma.activityLog.findFirst({ where: { action: 'Deleted patient' } });
  assert.match(entry.details, /Rajesh Kumar/);
  assert.equal(entry.userId, owner.session.user.id);
});

test('numbers keep counting after deletes and continue after numbers issued by older versions', async () => {
  const next = async kind => (await call(tech, 'POST', 'numbers/next', { kind })).json.number;
  assert.match(await next('patient'), /-00002$/, 'deleted patient 00001 is not re-issued');
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  await prisma.counter.delete({ where: { key: `order:${ymd}` } });
  await prisma.patient.create({ data: { id: 'LAB-OLD-1', name: 'Old', age: 1, gender: 'MALE', mobile: '1', createdBy: 1 } });
  await prisma.testOrder.create({ data: { orderNo: `LAB-ORD-${ymd}-0007`, patientId: 'LAB-OLD-1' } });
  assert.equal(await next('order'), `LAB-ORD-${ymd}-0008`);
  assert.equal(await next('order'), `LAB-ORD-${ymd}-0009`);
  const backdated = await call(tech, 'POST', 'numbers/next', { kind: 'bill', date: '2025-01-15' });
  assert.equal(backdated.json.number, 'LAB-BIL-20250115-0001', 'a back-dated registration numbers within its own day');
});

test('removing a staff member disables their login', async () => {
  const ravi = await prisma.staff.findFirst({ where: { name: 'Ravi' } });
  await call(owner, 'POST', 'staff/remove', { id: ravi.id });
  const res = await call({ prisma, dataDir: tmp, session: null }, 'POST', 'auth/login', { email: 'ravi@lab.test', password: 'Ravi@123' });
  assert.equal(res.status, 401);
  assert.equal((await call(owner, 'POST', 'staff/attendance', { staffId: (await prisma.staff.findFirst({ where: { name: 'Asha' } })).id, status: 'PRESENT' })).json.success, true);
  assert.equal((await call(owner, 'GET', 'staff/list')).json.staff.find(s => s.name === 'Asha').attendance, 'PRESENT');
});

test('backups are real database copies; restore only accepts JharLab backups', async () => {
  const made = await call(tech, 'POST', 'backup/create');
  assert.equal(made.json.success, true, JSON.stringify(made.json));
  const file = made.json.backup.file;
  assert.equal(fs.readFileSync(file).subarray(0, 15).toString(), 'SQLite format 3');
  await api.verifyBackupFile(file, PrismaClient);
  const copy = new PrismaClient({ datasources: { db: { url: `file:${file.replace(/\\/g, '/')}` } } });
  assert.equal(await copy.user.count(), await prisma.user.count(), 'backup holds the same data');
  await copy.$disconnect();

  const junk = path.join(tmp, 'not-a-backup.db');
  fs.writeFileSync(junk, 'hello');
  await assert.rejects(api.verifyBackupFile(junk, PrismaClient), /not a JharLab backup/);

  assert.ok(await api.autoBackup(owner), 'first automatic backup made');
  assert.equal(await api.autoBackup(owner), null, 'not again within the same day');
  const list = (await call(tech, 'GET', 'backup/list')).json.backups;
  assert.deepEqual(new Set(list.map(b => b.type)), new Set(['MANUAL', 'AUTO']));
});

test('editing a test keeps parameter ids, so saved results stay attached', async () => {
  const cbc = await prisma.test.findFirst({ where: { code: 'HEM001' }, include: { parameters: { include: { refRanges: true } } } });
  const edited = cbc.parameters.map(p => ({ ...p }));
  edited[0] = { ...edited[0], unit: 'g/dl (edited)', refRanges: [{ gender: 'MALE', normalMin: 13, normalMax: 17 }] };
  const saved = await q(tech, 'test', 'update', { where: { id: cbc.id }, data: { name: cbc.name, price: 400, parameters: edited } });
  const hb = saved.parameters.find(p => p.id === cbc.parameters[0].id);
  assert.ok(hb, 'parameter id preserved');
  assert.equal(hb.unit, 'g/dl (edited)');
});

test('report QR verification URL is signed and the PNG renders', async () => {
  const res = await call(owner, 'POST', 'reports/qrcode', { orderNo: 'ORD-1', patientName: 'Rajesh', getUrlOnly: true });
  assert.match(res.json.verifyUrl, /\/verify\?p=.+&s=[0-9a-f]{16}$/);
  const png = await call(owner, 'POST', 'reports/qrcode', { orderNo: 'ORD-1', patientName: 'Rajesh', tests: [] });
  assert.deepEqual([...png.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('expenses, stock, home collections, outsourcing and corporate clients are saved on the PC and stamped', async () => {
  // Expenses: whoever is signed in is the creator; only the owner may delete one.
  const exp = await q(tech, 'expense', 'create', { data: { date: new Date(), category: 'REAGENT', description: 'CBC reagent', amount: 500 } });
  assert.equal(exp.createdBy, techUserId);
  await denied(q(tech, 'expense', 'delete', { where: { id: exp.id } }));
  const money = (await call(owner, 'GET', 'dashboard/money')).json;
  assert.equal(money.visible, true);
  assert.equal(money.expenses, 500);
  assert.equal(money.net, money.revenue - 500);
  assert.equal((await call(tech, 'GET', 'dashboard/money')).json.visible, false, 'profit is for the owner only');

  // Stock: in / out / correction move the balance in one step and keep a history.
  const item = await q(tech, 'inventoryItem', 'create', { data: { name: 'EDTA tubes', category: 'TUBE', unit: 'pcs', currentStock: 0, minStock: 50 } });
  assert.equal((await call(tech, 'POST', 'inventory/move', { itemId: item.id, type: 'IN', quantity: 100, note: 'Invoice 42' })).json.item.currentStock, 100);
  assert.equal((await call(tech, 'POST', 'inventory/move', { itemId: item.id, type: 'OUT', quantity: 70 })).json.item.currentStock, 30);
  const tooMany = await call(tech, 'POST', 'inventory/move', { itemId: item.id, type: 'OUT', quantity: 31 });
  assert.equal(tooMany.status, 400);
  assert.match(tooMany.json.error, /Only 30 pcs in stock/);
  assert.equal((await call(tech, 'POST', 'inventory/move', { itemId: item.id, type: 'ADJUST', quantity: 28 })).json.item.currentStock, 28);
  const moves = await prisma.inventoryTransaction.findMany({ where: { itemId: item.id } });
  assert.deepEqual(moves.map(m => m.type), ['IN', 'OUT', 'ADJUST']);
  assert.ok(moves.every(m => m.createdBy === techUserId));

  // Home collection, outsourcing and corporate clients.
  const people = (await call(tech, 'GET', 'staff/names')).json.people;
  assert.ok(people.some(p => p.name === 'Asha'));
  assert.ok(people.every(p => !('email' in p) && !('password' in p)));
  const hc = await q(tech, 'homeCollection', 'create', { data: { patientName: 'Meena', address: 'Ward 4', scheduledAt: new Date(), assignedTo: techUserId, assignedName: 'Asha', status: 'ASSIGNED' } });
  assert.equal(hc.createdBy, techUserId);
  await q(tech, 'homeCollection', 'update', { where: { id: hc.id }, data: { status: 'IN_TRANSIT' } });
  const lab = await q(tech, 'outsourceLab', 'create', { data: { name: 'Metro Ref Lab' } });
  const sent = await q(tech, 'outsourcedTest', 'create', { data: { labId: lab.id, patientName: 'Meena', testName: 'Vitamin D', cost: 650 } });
  await denied(q(tech, 'outsourcedTest', 'delete', { where: { id: sent.id } }));
  await q(tech, 'corporate', 'create', { data: { name: 'Coal India Hospital', discount: 15, creditDays: 30 } });
  const trail = (await q(owner, 'activityLog', 'findMany', { where: { userId: techUserId } })).map(l => `${l.action}: ${l.details}`);
  for (const expected of [/Created expense: ₹500 REAGENT · CBC reagent/, /Stock out: EDTA tubes: −70 pcs → 30/, /Updated home collection: Meena → IN_TRANSIT/, /Created outsourced test: Vitamin D for Meena · ₹650/]) {
    assert.ok(trail.some(t => expected.test(t)), `missing ${expected} in ${trail.join(' | ')}`);
  }
  await q(owner, 'expense', 'delete', { where: { id: exp.id } });
});

test('sample labels get a real Code 128 barcode image', async () => {
  const png = await call(tech, 'POST', 'barcode/png', { text: 'LAB-ORD-20261006-0001' });
  assert.equal(png.type, 'image/png');
  assert.deepEqual([...png.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.ok(png.body.length > 300);
  assert.equal((await call(tech, 'POST', 'barcode/png', { text: '' })).status, 400);
});

test('owner who forgot the password resets it with the one-time recovery code; nobody can plant one', async () => {
  const anon = { prisma, dataDir: tmp, session: null };
  const recover = (code, newPassword) => call(anon, 'POST', 'auth/recover', { code, newPassword });
  assert.equal((await recover('AAAA-BBBB-CCCC-DDDD', 'New@1234')).status, 401);
  const r = await recover(ownerCode.toLowerCase().replace(/-/g, ' '), 'New@1234');
  assert.equal(r.json.success, true, JSON.stringify(r.json));
  assert.equal(r.json.email, 'owner@lab.test', 'a forgotten login email is shown too');
  assert.notEqual(r.json.recoveryCode, ownerCode);
  assert.equal((await recover(ownerCode, 'Other@123')).status, 401, 'a used code is dead');
  await signIn('owner@lab.test', 'New@1234');

  await denied(q(owner, 'user', 'update', { where: { id: owner.session.user.id }, data: { recoveryHash: 'planted' } }));
  assert.equal((await call(tech, 'POST', 'auth/recovery-code', { password: 'Asha@123' })).status, 403);
  assert.ok((await q(owner, 'user', 'findMany', {})).every(u => !('recoveryHash' in u) && !('password' in u)));

  assert.equal((await call(owner, 'POST', 'auth/recovery-code', { password: 'wrong' })).status, 401);
  const fresh = await call(owner, 'POST', 'auth/recovery-code', { password: 'New@1234' });
  assert.equal((await recover(r.json.recoveryCode, 'Other@123')).status, 401, 'a new code replaces the old one');
  assert.equal((await recover(fresh.json.recoveryCode, 'Secret@123')).json.success, true);
});

test('sign-out ends the session; five wrong passwords lock sign-in for a minute', async () => {
  await call(tech, 'POST', 'auth/logout');
  await denied(q(tech, 'patient', 'findMany', {}));
  const anon = { prisma, dataDir: tmp, session: null };
  for (let i = 0; i < 5; i++) assert.ok([401, 429].includes((await call(anon, 'POST', 'auth/login', { email: 'asha@lab.test', password: 'wrong' })).status));
  const locked = await call(anon, 'POST', 'auth/login', { email: 'asha@lab.test', password: 'Asha@123' });
  assert.equal(locked.status, 429, 'even the right password waits');
});
