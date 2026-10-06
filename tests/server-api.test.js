// The desktop backend against a real SQLite file: fresh install, app update (missing columns),
// first-run setup, login, and editing a test without orphaning saved results.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PrismaClient } = require('../prisma/client');
const api = require('../lib/server-api');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jharlab-api-'));
const prisma = new PrismaClient({ datasources: { db: { url: `file:${path.join(tmp, 'test.db').replace(/\\/g, '/')}` } } });
const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.sql'), 'utf8');
const ctx = { prisma, dataDir: tmp };
const call = (method, name, body) => api.callRoute(ctx, method, name, body);

before(() => api.ensureSchema(prisma, sql));
after(async () => {
  await prisma.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('ensureSchema re-adds columns an older install is missing, and is idempotent', async () => {
  await prisma.$executeRawUnsafe('ALTER TABLE "Doctor" DROP COLUMN "commission"');
  await prisma.$executeRawUnsafe('ALTER TABLE "Staff" DROP COLUMN "updatedAt"');
  await api.ensureSchema(prisma, sql);
  await api.ensureSchema(prisma, sql);
  const cols = async t => (await prisma.$queryRawUnsafe(`PRAGMA table_info("${t}")`)).map(c => c.name);
  assert.ok((await cols('Doctor')).includes('commission'));
  assert.ok((await cols('Staff')).includes('updatedAt'));
  await prisma.doctor.create({ data: { name: 'Dr. Test' } });
  assert.equal((await prisma.doctor.findFirst()).commission, 0);
});

test('first-run setup creates the owner, names the lab and seeds the catalog in one go', async () => {
  assert.equal((await call('GET', 'auth/setup-status')).json.isSetupRequired, true);
  await call('GET', 'license/check'); // creates the placeholder settings row, as the app does on launch
  const res = await call('POST', 'auth/setup', {
    labName: 'City Path Lab', mobile: '9000000000', address: 'Ranchi', ownerName: 'Owner', ownerEmail: 'Owner@Lab.test', ownerPassword: 'Secret@123',
  });
  assert.equal(res.json.success, true, JSON.stringify(res.json));
  assert.equal(res.json.user.email, 'owner@lab.test');
  assert.equal(res.json.user.password, undefined, 'password hash never leaves the backend');
  const settings = await prisma.labSettings.findMany();
  assert.equal(settings.length, 1);
  assert.equal(settings[0].labName, 'City Path Lab');
  assert.ok((await prisma.test.count()) >= 200);
  assert.equal((await call('GET', 'auth/setup-status')).json.isSetupRequired, false);
  assert.equal((await call('POST', 'auth/setup', { labName: 'x', mobile: 'x', address: 'x', ownerName: 'x', ownerEmail: 'x@x', ownerPassword: 'x' })).status, 400);
});

test('login checks the bcrypt hash and rejects wrong passwords', async () => {
  assert.equal((await call('POST', 'auth/login', { email: 'owner@lab.test', password: 'nope' })).status, 401);
  const ok = await call('POST', 'auth/login', { email: ' OWNER@lab.test ', password: 'Secret@123' });
  assert.equal(ok.json.success, true);
});

test('staff created through the generic db bridge get hashed passwords', async () => {
  const user = await api.dbQuery(prisma, { model: 'user', action: 'create', args: { data: { name: 'Tech', email: 'tech@lab.test', password: 'Plain@123', role: 'TECHNICIAN' } } });
  assert.match(user.password, /^\$2[aby]\$/);
  assert.equal((await call('POST', 'auth/login', { email: 'tech@lab.test', password: 'Plain@123' })).json.success, true);
  await assert.rejects(api.dbQuery(prisma, { model: '$executeRawUnsafe', action: 'findMany' }), /Invalid model/);
  await assert.rejects(api.dbQuery(prisma, { model: 'user', action: '$queryRaw' }), /Invalid model/);
});

test('editing a test keeps parameter ids, so saved results stay attached', async () => {
  const cbc = await prisma.test.findFirst({ where: { code: 'HEM001' }, include: { parameters: { include: { refRanges: true } } } });
  const hb = cbc.parameters[0];
  const edited = cbc.parameters.map(p => ({ ...p, refRanges: p.refRanges }));
  edited[0] = { ...edited[0], unit: 'g/dl (edited)', refRanges: [{ gender: 'MALE', normalMin: 13, normalMax: 17 }] };
  edited.push({ name: 'New Parameter', unit: 'x', refRanges: [] });
  const saved = await api.dbQuery(prisma, { model: 'test', action: 'update', args: { where: { id: cbc.id }, data: { name: cbc.name, price: 400, parameters: edited } } });
  const savedHb = saved.parameters.find(p => p.id === hb.id);
  assert.ok(savedHb, 'parameter id preserved');
  assert.equal(savedHb.unit, 'g/dl (edited)');
  assert.deepEqual(savedHb.refRanges.map(r => [r.gender, r.normalMin, r.normalMax]), [['MALE', 13, 17]]);
  assert.equal(saved.parameters.length, cbc.parameters.length + 1);
  assert.equal(saved.price, 400);

  const withoutLast = saved.parameters.filter(p => p.name !== 'New Parameter');
  const trimmed = await api.dbQuery(prisma, { model: 'test', action: 'update', args: { where: { id: cbc.id }, data: { parameters: withoutLast } } });
  assert.equal(trimmed.parameters.length, cbc.parameters.length, 'removed parameter deleted');
});

test('report QR verification URL is signed and the PNG renders', async () => {
  const res = await call('POST', 'reports/qrcode', { orderNo: 'ORD-1', patientName: 'Rajesh', getUrlOnly: true });
  assert.match(res.json.verifyUrl, /\/verify\?p=.+&s=[0-9a-f]{16}$/);
  const png = await call('POST', 'reports/qrcode', { orderNo: 'ORD-1', patientName: 'Rajesh', tests: [{ testName: 'CBC', parameters: [{ name: 'Hb', value: '13', flag: '' }] }] });
  assert.equal(png.type, 'image/png');
  assert.deepEqual([...png.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('trial licence activates once per machine', async () => {
  const first = await call('POST', 'license/trial');
  assert.equal(first.json.success, true);
  assert.equal((await call('GET', 'license/check')).json.valid, true);
  assert.equal((await call('POST', 'license/trial')).json.success, false);
});
