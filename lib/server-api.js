// Backend shared by the desktop app (Electron main process) and the `next dev` API route.
// One implementation, so the packaged app and the dev server cannot drift apart.
// Every handler takes ctx = { prisma, dataDir } and returns { status, json } or { status, body, type }.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');
const defaultTests = require('./default-tests.json');

const SECRET_SALT = process.env.LICENSE_SECRET_SALT || 'Musharraf_709121SaltKey';
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || 'https://adminlabmanagement.vercel.app';
const DEFAULT_LAB = { labName: 'JharLab', address: '123 Street Name', mobile: '9876543210' };
const CATEGORIES = ['Hematology', 'Biochemistry', 'Serology', 'Microbiology', 'Clinical Pathology', 'Immunology'];

// ==================== LICENSE ====================
let cachedMachineId = null;
function getMachineId() {
  if (cachedMachineId) return cachedMachineId;
  try {
    if (process.platform === 'win32') {
      const out = execSync('reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8', windowsHide: true });
      const m = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out);
      if (m) cachedMachineId = m[1].trim();
    } else if (process.platform === 'darwin') {
      cachedMachineId = execSync("ioreg -rd1 -c IOPlatformExpertDevice | awk -F'\"' '/IOPlatformUUID/{print $4}'", { encoding: 'utf8' }).trim();
    } else {
      cachedMachineId = execSync('cat /var/lib/dbus/machine-id /etc/machine-id 2>/dev/null | head -n 1', { encoding: 'utf8' }).trim();
    }
  } catch (e) {
    console.error('Failed to get Machine ID:', e);
  }
  return cachedMachineId || 'UNKNOWN-MACHINE-ID';
}

const licenseKeyBytes = () => crypto.createHash('sha256').update(SECRET_SALT).digest();

function encryptLicenseKey(machineId, expiryDate) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', licenseKeyBytes(), iv);
  const enc = cipher.update(`${machineId}|${expiryDate}`, 'utf8', 'hex') + cipher.final('hex');
  return (iv.toString('hex') + enc).toUpperCase();
}

function decryptLicenseKey(licenseKey) {
  try {
    const clean = licenseKey.trim().toLowerCase();
    if (clean.length <= 32) return null;
    const decipher = crypto.createDecipheriv('aes-256-cbc', licenseKeyBytes(), Buffer.from(clean.slice(0, 32), 'hex'));
    const parts = (decipher.update(clean.slice(32), 'hex', 'utf8') + decipher.final('utf8')).split('|');
    return parts.length === 2 ? { machineId: parts[0], expiryDate: parts[1] } : null;
  } catch {
    return null;
  }
}

function validateLicenseKey(licenseKey) {
  if (!licenseKey) return { valid: false, reason: 'License key is missing' };
  const d = decryptLicenseKey(licenseKey);
  if (!d) return { valid: false, reason: 'Invalid license key format or signature' };
  // Tolerate the case/whitespace differences an admin copy-paste can introduce.
  if (d.machineId.trim().toLowerCase() !== getMachineId().trim().toLowerCase()) {
    return { valid: false, reason: "License key does not match this computer's Machine ID", ...d };
  }
  const expiry = new Date(d.expiryDate);
  if (isNaN(expiry.getTime())) return { valid: false, reason: 'Invalid expiration date in license key' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  if (today > expiry) return { valid: false, reason: `License expired on ${d.expiryDate}`, ...d };
  return { valid: true, ...d };
}

const saveLicenseKey = (prisma, licenseKey) =>
  prisma.labSettings.upsert({ where: { id: 1 }, update: { licenseKey }, create: { id: 1, ...DEFAULT_LAB, licenseKey } });

// ==================== SCHEMA BOOTSTRAP ====================
// Creates missing tables/indexes and adds missing columns, so a fresh install and an app
// update that adds schema fields both work without shipping the Prisma CLI.
// ponytail: additive only; a renamed or dropped column needs a hand-written migration here.
async function ensureSchema(prisma, sql) {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean);

  for (const stmt of statements) {
    const table = /^CREATE TABLE "(\w+)"/.exec(stmt);
    if (!table) {
      await prisma.$executeRawUnsafe(stmt.replace(/^CREATE (UNIQUE )?INDEX/, 'CREATE $1INDEX IF NOT EXISTS'));
      continue;
    }
    const existing = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table[1]}")`);
    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(stmt);
      continue;
    }
    const have = new Set(existing.map(c => c.name));
    for (const line of stmt.split('\n')) {
      const col = /^\s*"(\w+)" (\w+)(.*?),?$/.exec(line);
      if (!col || have.has(col[1])) continue;
      let def = `"${col[1]}" ${col[2]}${col[3]}`.replace(/ PRIMARY KEY.*$/, '').replace('DEFAULT CURRENT_TIMESTAMP', 'DEFAULT 0');
      if (/NOT NULL/.test(def) && !/DEFAULT/.test(def)) def += col[2] === 'TEXT' ? " DEFAULT ''" : ' DEFAULT 0';
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table[1]}" ADD COLUMN ${def}`);
      console.log(`[schema] added column ${table[1]}.${col[1]}`);
    }
  }
}

// ==================== GENERIC DB ACCESS ====================
const READ_ACTIONS = new Set(['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy']);
const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const USER_FIELDS = ['userId', 'createdBy', 'receivedBy', 'enteredBy', 'verifiedBy', 'approvedBy'];
const IMAGE_FIELDS = ['logo', 'signature', 'technicianSignature', 'pathologyDoctorSignature', 'stamp'];

// Older screens pass stale demo user ids; map any unknown id to the owner so writes don't hit FK errors.
function remapUserIds(obj, validIds, fallbackId) {
  if (!obj || typeof obj !== 'object' || obj instanceof Date || Buffer.isBuffer(obj)) return;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (USER_FIELDS.includes(key) && (typeof val === 'number' || typeof val === 'string')) {
      const id = parseInt(val, 10);
      if (!isNaN(id)) obj[key] = validIds.has(id) ? id : (fallbackId ?? id);
    } else {
      remapUserIds(val, validIds, fallbackId);
    }
  }
}

const toBuffer = v => (typeof v === 'string' ? Buffer.from(v.split(';base64,').pop(), 'base64') : v || null);
const isHashed = p => /^\$2[aby]\$/.test(p);
const num = v => (v === undefined || v === null || v === '' ? null : Number(v));

const rangeData = r => ({
  gender: r.gender || null,
  ageMin: num(r.ageMin),
  ageMax: num(r.ageMax),
  normalMin: num(r.normalMin),
  normalMax: num(r.normalMax),
  criticalMin: num(r.criticalMin),
  criticalMax: num(r.criticalMax),
  textNormal: r.textNormal || null,
});

const paramData = (p, idx) => ({
  name: p.name,
  shortName: p.shortName || null,
  unit: p.unit || null,
  sortOrder: p.sortOrder || idx + 1,
  type: p.type || 'NUMERIC',
  options: p.options || null,
  formula: p.formula || null,
  isHeader: !!p.isHeader,
});

// Edits parameters in place so their ids survive: saved patient results point at parameter ids,
// and recreating every parameter on each edit used to orphan all historical results of that test.
async function saveTestWithParameters(prisma, action, args) {
  const { parameters, ...testData } = args.data;
  const include = { category: true, parameters: { include: { refRanges: true } } };
  return prisma.$transaction(async tx => {
    if (action === 'create') {
      return tx.test.create({
        data: {
          ...testData,
          parameters: { create: parameters.map((p, i) => ({ ...paramData(p, i), refRanges: { create: (p.refRanges || []).map(rangeData) } })) },
        },
        include,
      });
    }
    const testId = args.where.id;
    await tx.test.update({ where: { id: testId }, data: testData });
    const existing = await tx.testParameter.findMany({ where: { testId } });
    const keep = new Set();
    for (const [i, p] of parameters.entries()) {
      const match = existing.find(e => e.id === p.id) || existing.find(e => !keep.has(e.id) && e.name === p.name);
      const ranges = { create: (p.refRanges || []).map(rangeData) };
      if (match) {
        keep.add(match.id);
        await tx.referenceRange.deleteMany({ where: { parameterId: match.id } });
        await tx.testParameter.update({ where: { id: match.id }, data: { ...paramData(p, i), refRanges: ranges } });
      } else {
        await tx.testParameter.create({ data: { testId, ...paramData(p, i), refRanges: ranges } });
      }
    }
    const removed = existing.filter(e => !keep.has(e.id)).map(e => e.id);
    await tx.referenceRange.deleteMany({ where: { parameterId: { in: removed } } });
    await tx.testParameter.deleteMany({ where: { id: { in: removed } } });
    return tx.test.findUnique({ where: { id: testId }, include });
  });
}

async function dbQuery(prisma, { model, action, args }) {
  if (!/^[a-z]\w*$/.test(model || '') || !prisma[model] || !(READ_ACTIONS.has(action) || WRITE_ACTIONS.has(action))) {
    throw new Error(`Invalid model or action: ${model}.${action}`);
  }
  args = args || {};
  if (WRITE_ACTIONS.has(action)) {
    const users = await prisma.user.findMany({ select: { id: true, role: true } });
    const owner = users.find(u => u.role === 'SUPER_ADMIN') || users[0];
    remapUserIds(args, new Set(users.map(u => u.id)), owner?.id);

    for (const data of [args.data, args.create, args.update].filter(Boolean)) {
      if (model === 'user' && typeof data.password === 'string' && !isHashed(data.password)) {
        data.password = await bcrypt.hash(data.password, 12);
      }
      if (model === 'labSettings') {
        for (const f of IMAGE_FIELDS) if (data[f] !== undefined) data[f] = toBuffer(data[f]);
      }
    }
    if (model === 'test' && (action === 'create' || action === 'update') && Array.isArray(args.data?.parameters)) {
      return saveTestWithParameters(prisma, action, args);
    }
  }
  return prisma[model][action](args);
}

// ==================== FIRST-RUN SETUP ====================
async function seedCatalog(tx) {
  const categoryIds = {};
  for (const name of CATEGORIES) {
    categoryIds[name] = (await tx.testCategory.upsert({ where: { name }, update: {}, create: { name } })).id;
  }
  for (const t of defaultTests) {
    if (await tx.test.findUnique({ where: { code: t.code }, select: { id: true } })) continue;
    await tx.test.create({
      data: {
        code: t.code,
        name: t.name,
        shortName: t.shortName || null,
        categoryId: categoryIds[t.category],
        price: Number(t.price),
        duration: t.duration || 1,
        sampleType: t.sampleType || 'Whole Blood',
        container: t.container || null,
        parameters: { create: t.parameters.map((p, i) => ({ ...paramData(p, i), refRanges: { create: (p.refRanges || []).map(rangeData) } })) },
      },
    });
  }
}

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive });
const ownerCount = prisma => prisma.user.count({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, deletedAt: null } });

// ==================== QR VERIFICATION ====================
const SHORT_NAMES = {
  'Complete Blood Count (CBC)': 'CBC', 'Complete Blood Count': 'CBC', 'Liver Function Test (LFT)': 'LFT',
  'Liver Function Test': 'LFT', 'Renal Function Test (RFT)': 'RFT', 'Renal Function Test': 'RFT',
  'Thyroid Profile': 'Thyroid', 'Lipid Profile': 'Lipid', 'Hemoglobin (Hb)': 'Hb', 'Erythrocyte (RBC) Count': 'RBC',
  'Packed Cell Volume (PCV)': 'PCV', 'Total Leucocytes (WBC) Count': 'WBC', 'Mean Cell Volume (MCV)': 'MCV',
  'Mean Cell Haemoglobin (MCH)': 'MCH', 'Mean Corpuscular Hb Concn. (MCHC)': 'MCHC',
  'Red Cell Distribution Width (RDW)': 'RDW', 'Differential Leucocyte Count (DLC)': 'DLC', 'Platelet count': 'Platelets',
  'Platelet Count': 'Platelets', Neutrophils: 'Neutro', Lymphocytes: 'Lympho', Monocytes: 'Mono', Eosinophils: 'Eosino',
  Basophils: 'Baso', 'Blood Sugar (Fasting)': 'Sugar Fasting', 'Blood Sugar (PP)': 'Sugar PP', 'Blood Sugar': 'Sugar',
  'HbA1c (Glycated Hemoglobin)': 'HbA1c', 'Estimated Avg Glucose': 'eAG', 'Serum Creatinine': 'Creatinine',
  'Blood Urea': 'Urea', 'Sodium (Na+)': 'Sodium', 'Potassium (K+)': 'Potassium', 'Chloride (Cl-)': 'Chloride',
  'Total Cholesterol': 'Cholesterol', 'HDL Cholesterol': 'HDL', 'LDL Cholesterol': 'LDL', 'VLDL Cholesterol': 'VLDL',
  'Total/HDL Ratio': 'Chol/HDL', 'SGOT (AST)': 'SGOT', 'SGPT (ALT)': 'SGPT', 'Alkaline Phosphatase': 'ALP',
  'Total Bilirubin': 'Bilirubin Total', 'Direct Bilirubin': 'Bilirubin Direct', 'Indirect Bilirubin': 'Bilirubin Indirect',
  'Total Protein': 'Protein Total', 'T3 (Triiodothyronine)': 'T3', 'T4 (Thyroxine)': 'T4',
};
const short = n => SHORT_NAMES[n] || n;

function reportVerifyUrl(data) {
  const compact = {
    o: data.orderNo, n: data.patientName, a: data.age || '', g: data.gender || '', d: data.date || '',
    l: data.labName || 'Diagnostic Centre', r: data.approvedBy || '',
    t: (data.tests || []).map(t => ({ n: short(t.testName), p: (t.parameters || []).map(p => ({ n: short(p.name), v: p.value, f: p.flag })) })),
  };
  const payload = zlib.deflateSync(JSON.stringify(compact)).toString('base64');
  const sig = crypto.createHmac('sha256', SECRET_SALT).update(payload).digest('hex').slice(0, 16);
  return `${ADMIN_URL}/verify?p=${encodeURIComponent(payload)}&s=${sig}`;
}

async function reportQrPng(data) {
  return require('bwip-js').toBuffer({ bcid: 'qrcode', text: reportVerifyUrl(data), scale: 2, eclevel: 'L' });
}

async function fetchAdmin(pathAndQuery, timeoutMs) {
  return fetch(`${ADMIN_URL}${pathAndQuery}`, { signal: AbortSignal.timeout(timeoutMs), headers: { 'Cache-Control': 'no-cache' } });
}

// ==================== ROUTES ====================
const ok = json => ({ status: 200, json });
const fail = (status, error, extra) => ({ status, json: { success: false, error, ...extra } });

const routes = {
  'GET auth/setup-status': async ({ prisma }) => ok({ success: true, isSetupRequired: (await ownerCount(prisma)) === 0 }),

  'POST auth/setup': async ({ prisma }, b) => {
    if (!b.labName || !b.mobile || !b.address || !b.ownerName || !b.ownerEmail || !b.ownerPassword) {
      return fail(400, 'All fields are required');
    }
    if ((await ownerCount(prisma)) > 0) return fail(400, 'Setup is already complete. Owner registration blocked.');
    const password = await bcrypt.hash(b.ownerPassword, 12);
    const owner = await prisma.$transaction(async tx => {
      const lab = { labName: b.labName, mobile: b.mobile, address: b.address, email: b.email || null };
      // id 1 may already exist: the license check creates a placeholder row before setup runs.
      await tx.labSettings.upsert({ where: { id: 1 }, update: lab, create: { id: 1, ...lab } });
      const user = await tx.user.create({
        data: { name: b.ownerName, email: b.ownerEmail.toLowerCase().trim(), password, role: 'SUPER_ADMIN', isActive: true, lastLogin: new Date() },
      });
      await seedCatalog(tx);
      return user;
    }, { timeout: 120000 });
    return ok({ success: true, user: publicUser(owner) });
  },

  'POST auth/login': async ({ prisma }, b) => {
    if (!b.email || !b.password) return fail(400, 'Email and password are required');
    const user = await prisma.user.findUnique({ where: { email: b.email.toLowerCase().trim() } });
    if (!user || !user.isActive || user.deletedAt) return fail(401, 'Invalid credentials or inactive account');
    const legacyPlain = !isHashed(user.password) && user.password === b.password;
    if (!legacyPlain && !(await bcrypt.compare(b.password, user.password))) return fail(401, 'Invalid credentials');
    const data = { lastLogin: new Date(), ...(legacyPlain && { password: await bcrypt.hash(b.password, 12) }) };
    return ok({ success: true, user: publicUser(await prisma.user.update({ where: { id: user.id }, data })) });
  },

  'POST db': async ({ prisma }, b) => ok({ success: true, data: await dbQuery(prisma, b) }),

  'GET license/check': async ({ prisma }) => {
    const machineId = getMachineId();
    const settings = await prisma.labSettings.findFirst({ where: { id: 1 } })
      || await prisma.labSettings.create({ data: { id: 1, ...DEFAULT_LAB } });
    if (!settings.licenseKey) return ok({ valid: false, machineId, reason: 'Software has not been activated. Please enter a license key.' });
    const v = validateLicenseKey(settings.licenseKey);
    return ok({ valid: v.valid, machineId, expiryDate: v.expiryDate, reason: v.reason });
  },

  'POST license/activate': async ({ prisma }, b) => {
    if (!b.licenseKey) return fail(400, 'License key is required');
    const v = validateLicenseKey(b.licenseKey);
    if (!v.valid) return fail(400, v.reason || 'Invalid license key');
    await saveLicenseKey(prisma, b.licenseKey.trim());
    return ok({ success: true, expiryDate: v.expiryDate, message: 'License activated successfully!' });
  },

  'POST license/trial': async ({ prisma, dataDir }) => {
    const marker = path.join(dataDir, 'trial.json');
    if (fs.existsSync(marker)) return ok({ success: false, error: 'Trial license has already been activated on this system.' });
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    const expiryDate = expiry.toISOString().slice(0, 10);
    await saveLicenseKey(prisma, encryptLicenseKey(getMachineId(), expiryDate));
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify({ activated: true, date: Date.now(), expiry: expiryDate }, null, 2));
    return ok({ success: true, expiryDate, message: '7-Day Free Trial activated successfully!' });
  },

  'GET license/remote-check': async (_ctx, _b, q) => {
    const machineId = q.get('machineId');
    if (!machineId) return fail(400, 'machineId parameter is required');
    try {
      const res = await fetchAdmin(`/api/license/status?machineId=${encodeURIComponent(machineId)}`, 2500);
      const data = await res.json().catch(() => ({}));
      if (res.ok) return ok(data);
      if (res.status === 404) return ok({ success: false, status: 'DELETED', reason: data.reason || 'This machine is not registered in the database.' });
      return { status: res.status, json: { success: false, status: data.status || 'ERROR', reason: data.reason || `Server returned error status ${res.status}` } };
    } catch {
      return { status: 503, json: { success: false, offline: true, reason: 'Admin dashboard unreachable.' } };
    }
  },

  'GET updates/check': async () => {
    try {
      const res = await fetchAdmin('/api/updates/latest', 2500);
      return res.ok ? ok(await res.json()) : { status: res.status, json: { success: false, reason: `Server returned status ${res.status}` } };
    } catch {
      return { status: 503, json: { success: false, offline: true, reason: 'Admin server unreachable' } };
    }
  },

  'POST reports/qrcode': async (_ctx, b) => {
    if (!b.orderNo || !b.patientName) return fail(400, 'orderNo and patientName are required');
    if (b.getUrlOnly) return ok({ success: true, verifyUrl: reportVerifyUrl(b) });
    return { status: 200, body: await reportQrPng(b), type: 'image/png' };
  },
};

// Runs a route by name. Used directly by Electron IPC handlers.
async function callRoute(ctx, method, name, body = {}, query = new URLSearchParams()) {
  const handler = routes[`${method} ${name}`];
  if (!handler) return fail(404, `No API route ${method} /api/${name}`);
  try {
    return await handler(ctx, body, query);
  } catch (err) {
    console.error(`API ${method} /api/${name} failed:`, err);
    return fail(500, err.message || 'Internal server error');
  }
}

// Web-standard Request -> Response. Used by Electron's app:// protocol and by Next's route handler.
async function handleRequest(ctx, request) {
  const url = new URL(request.url);
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const r = await callRoute(ctx, request.method, name, body, url.searchParams);
  if (r.body) return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.type } });
  return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'Content-Type': 'application/json' } });
}

module.exports = {
  ensureSchema,
  dbQuery,
  callRoute,
  handleRequest,
  reportQrPng,
  getMachineId,
  encryptLicenseKey,
  validateLicenseKey,
};
