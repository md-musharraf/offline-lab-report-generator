// Updates never lose a lab's data. tests/release-schemas/<version>.sql holds the database every released
// version created (add the new one at each release); each is filled with a lab's records and opened by this
// version: logins still work, every patient, order, result, report and bill is still there.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('../prisma/client');
const api = require('../lib/server-api');
const { version } = require('../package.json');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jharlab-upgrade-'));
const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.sql'), 'utf8');
const schemas = path.join(__dirname, 'release-schemas');
const clients = [];
const open = file => {
  const c = new PrismaClient({ datasources: { db: { url: `file:${file.replace(/\\/g, '/')}` } } });
  clients.push(c);
  return c;
};
after(async () => {
  for (const c of clients) await c.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Raw SQL so it fits any version's tables: columns a version lacks are skipped, and required columns not
// given get a blank value.
async function insert(db, table, values) {
  const cols = await db.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
  const row = {};
  for (const c of cols) {
    if (c.name in values) row[c.name] = values[c.name];
    else if (c.notnull && c.dflt_value == null && !c.pk) row[c.name] = /CHAR|TEXT|CLOB/i.test(c.type) ? '' : 0;
  }
  const keys = Object.keys(row);
  await db.$executeRawUnsafe(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map(k => row[k]));
}

const TABLES = ['LabSettings', 'User', 'Doctor', 'Patient', 'Test', 'TestOrder', 'TestOrderItem', 'TestResult', 'Report', 'Bill'];
const counts = async db => Object.fromEntries(await Promise.all(TABLES.map(async t => [t, Number((await db.$queryRawUnsafe(`SELECT count(*) AS n FROM "${t}"`))[0].n)])));
const login = (db, dataDir, email, password) => api.callRoute({ prisma: db, dataDir, session: null }, 'POST', 'auth/login', { email, password });

async function fillLab(db) {
  const t = Date.now();
  const at = { createdAt: t, updatedAt: t };
  await insert(db, 'LabSettings', { id: 1, labName: 'Old Lab', address: 'Station Road, Dumka', mobile: '9000000000', ...at });
  await insert(db, 'User', { id: 1, name: 'Owner', email: 'owner@old.lab', password: bcrypt.hashSync('Old@123', 4), role: 'SUPER_ADMIN', isActive: 1, ...at });
  await insert(db, 'User', { id: 2, name: 'Tech', email: 'tech@old.lab', password: 'Plain@123', role: 'TECHNICIAN', isActive: 1, ...at }); // oldest installs kept plain text
  await insert(db, 'Doctor', { id: 1, name: 'Dr. Old', mobile: '9000000002', ...at });
  await insert(db, 'Patient', { id: 'LAB-2025-00001', name: 'Ramesh Kumar', age: 40, ageUnit: 'YEARS', gender: 'MALE', mobile: '9000000001', referredDoctorId: 1, createdBy: 1, registeredAt: t, updatedAt: t });
  await insert(db, 'TestCategory', { id: 1, name: 'Hematology', ...at });
  await insert(db, 'Test', { id: 1, code: 'HB', name: 'Haemoglobin', categoryId: 1, price: 150, duration: 1, sampleType: 'Blood', ...at });
  await insert(db, 'TestParameter', { id: 1, testId: 1, name: 'Haemoglobin', unit: 'g/dL', type: 'NUMERIC', sortOrder: 1, ...at });
  await insert(db, 'TestOrder', { id: 1, orderNo: 'OLD-ORD-1', patientId: 'LAB-2025-00001', status: 'APPROVED', ...at });
  await insert(db, 'TestOrderItem', { id: 1, orderId: 1, testId: 1, status: 'APPROVED', ...at });
  await insert(db, 'TestResult', { id: 1, orderItemId: 1, parameterId: 1, numericValue: 10.2, flag: 'L', status: 'APPROVED', enteredBy: 1, ...at });
  await insert(db, 'Report', { id: 1, orderId: 1, approvedBy: 1, approvedAt: t, ...at });
  await insert(db, 'Bill', { id: 1, billNo: 'OLD-BILL-1', patientId: 'LAB-2025-00001', subtotal: 150, totalAmount: 150, paidAmount: 150, ...at });
}

for (const file of fs.readdirSync(schemas).filter(f => f.endsWith('.sql'))) {
  const from = file.slice(0, -4);
  test(`a lab on v${from} updates to v${version} with every login, patient, report and bill intact`, async () => {
    const dataDir = path.join(tmp, from);
    fs.mkdirSync(dataDir);
    const db = open(path.join(dataDir, 'dev.db'));
    for (const stmt of fs.readFileSync(path.join(schemas, file), 'utf8').split(/;\s*$/m).filter(x => /CREATE/.test(x))) await db.$executeRawUnsafe(stmt); // tables as that version created them
    await fillLab(db);
    const before = await counts(db);

    const { backup } = await api.upgradeDatabase(db, sql, { dataDir, version });
    assert.ok(backup && fs.existsSync(backup), 'an untouched copy is saved before the update');
    assert.deepEqual(await counts(open(backup)), before, 'the copy holds everything');
    assert.deepEqual(await counts(db), before, 'nothing lost or added by the update');

    assert.equal((await login(db, dataDir, 'Owner@Old.lab ', 'Old@123')).json.success, true, 'owner signs in as before');
    assert.equal((await login(db, dataDir, 'tech@old.lab', 'Plain@123')).json.success, true, 'old plain-text password still works');
    assert.equal((await login(db, dataDir, 'owner@old.lab', 'wrong')).status, 401);

    const p = await db.patient.findUnique({ where: { id: 'LAB-2025-00001' } });
    assert.deepEqual([p.name, p.mobile], ['Ramesh Kumar', '9000000001']);
    assert.equal((await db.labSettings.findUnique({ where: { id: 1 } })).address, 'Station Road, Dumka');
    const report = await api.loadReport(db, 1);
    assert.equal(report.data.patient.name, 'Ramesh Kumar');
    assert.equal(report.data.tests[0].rows[0].value, '10.2');

    assert.equal((await api.upgradeDatabase(db, sql, { dataDir, version })).backup, null, 'no second copy once updated');
  });
}

test('a missing database comes back from the newest backup or an older install, never as an empty lab', () => {
  const root = path.join(tmp, 'recover');
  const dataDir = path.join(root, 'jharlab');
  const legacy = path.join(root, 'offline-lab-lis');
  const dbFile = path.join(dataDir, 'dev.db');
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  fs.mkdirSync(legacy);
  assert.equal(api.recoverMissingDatabase(dbFile, dataDir), null, 'a genuine first run starts empty');

  const backup = path.join(dataDir, 'backups', 'jharlab-auto-20260101-000000.db');
  fs.writeFileSync(backup, 'backup');
  fs.writeFileSync(path.join(legacy, 'dev.db'), 'legacy');
  fs.writeFileSync(path.join(legacy, 'dev.db-wal'), 'legacy-wal');
  const ago = s => new Date(Date.now() - s * 1000);
  fs.utimesSync(path.join(legacy, 'dev.db'), ago(300), ago(300));
  fs.utimesSync(path.join(legacy, 'dev.db-wal'), ago(200), ago(200));
  fs.utimesSync(backup, ago(100), ago(100));
  fs.writeFileSync(`${dbFile}-wal`, 'stale');

  assert.equal(api.recoverMissingDatabase(dbFile, dataDir), backup, 'the newest copy wins');
  assert.equal(fs.readFileSync(dbFile, 'utf8'), 'backup');
  assert.equal(fs.existsSync(`${dbFile}-wal`), false, 'a stale log from another file is never mixed in');
  assert.equal(api.recoverMissingDatabase(dbFile, dataDir), null, 'an existing database is never touched');

  fs.rmSync(dbFile);
  fs.utimesSync(backup, ago(900), ago(900));
  assert.equal(api.recoverMissingDatabase(dbFile, dataDir), path.join(legacy, 'dev.db'), 'an older install, with its log');
  assert.equal(fs.readFileSync(`${dbFile}-wal`, 'utf8'), 'legacy-wal');
});
