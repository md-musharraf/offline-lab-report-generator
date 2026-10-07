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
const { can, isAdmin, roleLabel, STAFF_ROLES, ADDONS } = require('./roles');
const reportData = require('./report-data');
const { renderReports } = require('./report-pdf');

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
  await upgradeData(prisma);
}

// Idempotent fixes for data written by older versions.
async function upgradeData(prisma) {
  // Orders from before item prices were stored: freeze them at the test's price as of this upgrade.
  await prisma.$executeRawUnsafe('UPDATE "TestOrderItem" SET "price" = (SELECT "price" FROM "Test" WHERE "Test"."id" = "TestOrderItem"."testId") WHERE "price" IS NULL');
  // The analyzer used to set statuses no screen lists (ENTERED / VERIFIED), so its orders never reached
  // Results or Reports. Auto-approved ones become APPROVED, the rest wait for review like any other.
  await prisma.$executeRawUnsafe(`UPDATE "TestOrder" SET "status" = 'APPROVED' WHERE "status" = 'VERIFIED' AND "id" IN (SELECT "orderId" FROM "Report" WHERE "approvedAt" IS NOT NULL)`);
  await prisma.$executeRawUnsafe(`UPDATE "TestOrder" SET "status" = 'RESULT_ENTERED' WHERE "status" IN ('ENTERED', 'VERIFIED')`);
  await prisma.$executeRawUnsafe(`UPDATE "TestOrderItem" SET "status" = 'RESULT_ENTERED' WHERE "status" IN ('ENTERED', 'VERIFIED')`);
}

// ==================== GENERIC DB ACCESS (role-checked) ====================
// ctx.session is set by sign-in (or first-run setup) and cleared by sign-out. Every query from the screens
// passes through here, so roles hold even if someone edits the renderer or opens DevTools.
const READ_ACTIONS = new Set(['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy']);
const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const USER_FIELDS = ['userId', 'createdBy', 'receivedBy', 'enteredBy', 'verifiedBy', 'approvedBy'];
const IMAGE_FIELDS = ['logo', 'signature', 'technicianSignature', 'pathologyDoctorSignature', 'stamp'];
const PUBLIC_READS = new Set(['user.count', 'labSettings.findFirst', 'labSettings.findUnique']);

class AccessError extends Error {}
const deny = message => {
  throw new AccessError(message);
};

const writeData = args => [args.data, args.create, args.update].flat().filter(Boolean);

// The action a write needs (see lib/roles.js). null = any signed-in user; 'never' = nobody, not even the owner.
function requiredAction(model, action, args) {
  const write = WRITE_ACTIONS.has(action);
  if (model === 'activityLog') return !write ? 'audit:view' : action === 'create' ? null : 'never';
  if (!write) return null;
  const datas = writeData(args);
  if (model === 'patient' && (action.startsWith('delete') || datas.some(d => d.deletedAt))) return 'patient:delete';
  if ((model === 'testOrder' || model === 'report') && action.startsWith('delete')) return 'patient:delete';
  // Only auth/recovery-code may set it, or an admin could plant a code and take over the owner.
  if (model === 'user' && datas.some(d => d.recoveryHash !== undefined)) return 'never';
  if (model === 'user' || model === 'staff' || model === 'attendance') return 'staff:manage';
  if (['bill', 'payment', 'expense', 'outsourcedTest'].includes(model) && action.startsWith('delete')) return 'bill:delete';
  if (model === 'testResult') return 'results';
  // Approval freezes the report (POST reports/approve); it cannot be faked or the snapshot edited directly.
  if (model === 'report' && datas.some(d => ['approvedBy', 'approvedAt', 'snapshot', 'version'].some(k => d[k] !== undefined))) return 'never';
  if (model === 'reportAsset') return 'never';
  if (model === 'bill' && datas.some(d => d.lab !== undefined)) return 'never'; // set by the backend on create
  if (model === 'labSettings') return 'settings';
  return null;
}

function requireSession(ctx, action) {
  const user = ctx.session?.user;
  if (!user) deny('Please sign in again.');
  if (action === 'never' || (action && !can(user.role, action))) {
    deny(`A ${roleLabel(user.role)} is not allowed to do this. Ask the lab owner.`);
  }
  return user;
}

// Whoever is signed in did it: enteredBy / receivedBy / approvedBy / createdBy are stamped by the backend,
// so the audit trail and the per-shift totals cannot be spoofed by the screen.
function stampUser(obj, userId) {
  if (!obj || typeof obj !== 'object' || obj instanceof Date || Buffer.isBuffer(obj)) return;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (USER_FIELDS.includes(key) && v !== null && v !== undefined && typeof v !== 'object') obj[key] = userId;
    else stampUser(v, userId);
  }
}

// Password hashes never leave the backend, whichever model included the user.
function scrubPasswords(v) {
  if (Array.isArray(v)) v.forEach(scrubPasswords);
  else if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
    delete v.password;
    delete v.recoveryHash;
    Object.values(v).forEach(scrubPasswords);
  }
  return v;
}

const AUDIT_MODULES = {
  patient: ['Patients', 'patient'], bill: ['Billing', 'bill'], payment: ['Billing', 'payment'], doctor: ['Billing', 'doctor'],
  testOrder: ['Samples', 'order'], testOrderItem: ['Samples', 'order item'], testResult: ['Results', 'result'],
  qcResult: ['Results', 'QC result'], report: ['Reports', 'report'], labSettings: ['Settings', 'lab settings'],
  test: ['Settings', 'test'], testCategory: ['Settings', 'test category'], user: ['Staff', 'login'],
  staff: ['Staff', 'staff member'], attendance: ['Staff', 'attendance'],
  expense: ['Accounts', 'expense'], homeCollection: ['Samples', 'home collection'], outsourceLab: ['Settings', 'partner lab'],
  outsourcedTest: ['Samples', 'outsourced test'], corporate: ['Billing', 'corporate client'],
  inventoryItem: ['Inventory', 'stock item'], inventoryTransaction: ['Inventory', 'stock movement'],
};
// Records that carry who created them; the backend fills it in on create.
const CREATED_BY_MODELS = new Set(['expense', 'homeCollection', 'outsourcedTest', 'inventoryTransaction']);
const AUDIT_SKIP = new Set(['activityLog', 'backupLog', 'counter']);
const VERBS = { create: 'Created', createMany: 'Created', update: 'Updated', updateMany: 'Updated', upsert: 'Saved', delete: 'Deleted', deleteMany: 'Deleted' };

const rupees = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// One readable line for the owner: who/what changed, not raw JSON.
function describeChange(model, action, args, r) {
  if (r && typeof r.count === 'number' && !r.id) return `${r.count} record(s)`;
  const d = Object.assign({}, ...writeData(args));
  const x = { ...d, ...(r || {}) };
  const id = x.id ?? args.where?.id;
  switch (model) {
    case 'patient': return `${x.name || 'Patient'} (${id})`;
    case 'bill': return `${x.billNo || `Bill #${id}`} · ${rupees(x.totalAmount)}${x.discountAmount ? ` · discount ${rupees(x.discountAmount)}` : ''}${x.dueAmount ? ` · due ${rupees(x.dueAmount)}` : ''}`;
    case 'payment': return `${rupees(x.amount)} ${x.method || ''} on bill #${x.billId}`;
    case 'testOrder': return `${x.orderNo || `Order #${id}`}${d.status ? ` → ${d.status}` : ''}`;
    case 'testOrderItem': return `Order item #${id}${d.status ? ` → ${d.status}` : ''}`;
    case 'testResult': return `Value ${x.textValue ?? x.numericValue ?? '—'}${x.flag ? ` ${x.flag}` : ''} (parameter #${x.parameterId}, item #${x.orderItemId})`;
    case 'report': return `Order #${x.orderId}${d.approvedAt ? ' approved' : ''}${d.deliveredAt ? ' delivered' : ''}${d.printCount ? ' printed' : ''}`;
    case 'expense': return `${rupees(x.amount)} ${x.category || ''} · ${x.description || ''}${x.paidTo ? ` · to ${x.paidTo}` : ''}`;
    case 'homeCollection': return `${x.patientName || `Collection #${id}`}${d.status ? ` → ${d.status}` : ''}${d.assignedName ? ` · ${d.assignedName}` : ''}`;
    case 'outsourcedTest': return `${x.testName || 'Test'} for ${x.patientName || '—'} · ${rupees(x.cost)}${d.status ? ` → ${d.status}` : ''}`;
    case 'outsourceLab': case 'corporate': case 'inventoryItem': return `${x.name || `#${id}`}`;
    default: return `#${id ?? '—'} · ${Object.keys(d).filter(k => k !== 'password').slice(0, 6).join(', ')}`;
  }
}

async function audit(prisma, userId, module, action, details) {
  try {
    await prisma.activityLog.create({ data: { userId, module, action, details: String(details).slice(0, 500) } });
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

async function dbQuery(prisma, { model, action, args }, ctx = {}) {
  if (!/^[a-z]\w*$/.test(model || '') || !prisma[model] || !(READ_ACTIONS.has(action) || WRITE_ACTIONS.has(action))) {
    throw new Error(`Invalid model or action: ${model}.${action}`);
  }
  args = args || {};
  const needed = requiredAction(model, action, args);
  if (needed || !PUBLIC_READS.has(`${model}.${action}`)) requireSession(ctx, needed);
  if (READ_ACTIONS.has(action)) return scrubPasswords(await prisma[model][action](args));

  const user = ctx.session.user;
  if (changesReportSource(model, action, args)) await freezeLegacy(prisma);
  if (action === 'create' && CREATED_BY_MODELS.has(model) && args.data) args.data.createdBy = user.id;
  if (model === 'bill' && action === 'create' && args.data) args.data.lab = billLab(await labSettings(prisma));
  for (const data of writeData(args)) {
    stampUser(data, user.id);
    if (model === 'user' && typeof data.password === 'string' && !isHashed(data.password)) {
      data.password = await bcrypt.hash(data.password, 12);
    }
    if (model === 'labSettings') {
      for (const f of IMAGE_FIELDS) if (data[f] !== undefined) data[f] = toBuffer(data[f]);
    }
  }
  const result = model === 'test' && (action === 'create' || action === 'update') && Array.isArray(args.data?.parameters)
    ? await saveTestWithParameters(prisma, action, args)
    : await prisma[model][action](args);

  if (!AUDIT_SKIP.has(model)) {
    const [module, noun] = AUDIT_MODULES[model] || ['Settings', model];
    await audit(prisma, user.id, module, `${VERBS[action]} ${noun}`, describeChange(model, action, args, result));
  }
  ctx.notify?.(model);
  return scrubPasswords(result);
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

// ==================== REPORTS ====================
// Approving a report freezes it: Report.snapshot keeps everything it prints (lab details, logo, signatures,
// patient, tests, units, ranges, results), so later changes to settings, tests or the patient only affect
// reports approved after the change. Drafts always print current data. Editing results of an approved
// report makes it a draft again; approving it again stores a new snapshot marked as amended.
const REPORT_INCLUDE = {
  patient: { include: { doctor: true } },
  report: true,
  items: { orderBy: { id: 'asc' }, include: { results: true, test: { include: { category: true, parameters: { include: { refRanges: true } } } } } },
};
// How reports print rather than what they say: applied at print time, to old reports too.
const PRINT_OPTIONS = ['printShowLogo', 'printShowQR', 'printSignatures', 'letterhead', 'letterheadTopMm', 'letterheadBottomMm', 'printColor', 'printFontSize'];
const REPORT_SOURCES = new Set(['labSettings', 'test', 'testParameter', 'referenceRange', 'testCategory', 'patient', 'doctor']);
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));
const labSettings = async db => (await db.labSettings.findUnique({ where: { id: 1 } })) || {};
const isFinal = order => reportData.FINAL_STATUSES.includes(order.status);

// Would this write change what an already approved report prints?
const changesReportSource = (model, action, args) =>
  REPORT_SOURCES.has(model) && !action.startsWith('create') &&
  !(model === 'labSettings' && writeData(args).every(d => Object.keys(d).every(k => PRINT_OPTIONS.includes(k))));

async function storeSnapshot(tx, order, settings, fields) {
  const { data, assets } = reportData.build(order, settings);
  for (const [hash, bytes] of Object.entries(assets)) {
    await tx.reportAsset.upsert({ where: { hash }, update: {}, create: { hash, data: bytes } });
  }
  const row = { ...fields, snapshot: JSON.stringify(data) };
  await tx.report.upsert({ where: { orderId: order.id }, update: row, create: { orderId: order.id, ...row } });
}

async function approveReport(prisma, orderId, userId) {
  return prisma.$transaction(async tx => {
    const order = await tx.testOrder.findUnique({ where: { id: orderId }, include: REPORT_INCLUDE });
    if (!order) throw new AccessError('Order not found');
    if (isFinal(order) && order.report?.snapshot) return order; // already approved (double click)
    if (!order.items.some(i => i.results.length)) throw new AccessError('Enter the results before approving the report');
    const version = Math.max(order.report?.version || 0, order.report?.approvedAt ? 1 : 0) + 1;
    const approvedAt = new Date();
    Object.assign(order, { status: 'APPROVED', report: { ...order.report, approvedAt, version } });
    await tx.testOrder.update({ where: { id: orderId }, data: { status: 'APPROVED' } });
    await storeSnapshot(tx, order, await labSettings(tx), { approvedBy: userId, approvedAt, version });
    return order;
  });
}

// The lab details a bill prints, kept on the bill when it is made (the amounts are stored on it anyway).
const billLab = s => JSON.stringify({ labName: s.labName || '', address: s.address || '', mobile: s.mobile || '', gstNumber: s.gstNumber || '' });

// Bills and reports made by older versions did not keep their lab details: freeze them with what they print
// today, before the first change that would alter them.
async function freezeLegacy(prisma) {
  const settings = await labSettings(prisma);
  await prisma.bill.updateMany({ where: { lab: null }, data: { lab: billLab(settings) } });
  const pending = await prisma.testOrder.findMany({
    where: { status: { in: reportData.FINAL_STATUSES }, OR: [{ report: { is: null } }, { report: { is: { snapshot: null } } }] },
    select: { id: true },
  });
  if (!pending.length) return;
  for (const { id } of pending) {
    await prisma.$transaction(async tx => {
      const order = await tx.testOrder.findUnique({ where: { id }, include: REPORT_INCLUDE });
      const version = Math.max(order.report?.version || 0, 1);
      order.report = { ...order.report, version };
      await storeSnapshot(tx, order, settings, { version });
    });
  }
  console.log(`[reports] froze ${pending.length} report(s) approved by an older version`);
}

// { order, data, assets } for printing: the frozen snapshot of an approved report, current data for a draft.
async function loadReport(prisma, orderId) {
  const order = await prisma.testOrder.findUnique({ where: { id: orderId }, include: REPORT_INCLUDE });
  if (!order) throw new AccessError('Order not found');
  if (!isFinal(order) || !order.report?.snapshot) return { order, ...reportData.build(order, await labSettings(prisma)) };
  const data = JSON.parse(order.report.snapshot);
  const rows = await prisma.reportAsset.findMany({ where: { hash: { in: reportData.imageRefs(data) } } });
  return { order, data, assets: Object.fromEntries(rows.map(r => [r.hash, Buffer.from(r.data)])) };
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

const OLD_FLAGS = { H: '↑', L: '↓', C: '!!' }; // what the admin verify page shows

function reportVerifyUrl(data) {
  const compact = {
    o: data.orderNo, n: data.patient.name, a: data.patient.age, g: data.patient.gender,
    d: data.registeredAt ? new Date(data.registeredAt).toLocaleDateString('en-GB') : '',
    l: data.lab.name || 'Diagnostic Centre', r: data.signatories.at(-1)?.name || '',
    t: data.tests.map(t => ({ n: short(t.name), p: t.rows.filter(r => !r.header).map(r => ({ n: short(r.name), v: r.value, f: OLD_FLAGS[r.flag] || null })) })),
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

// ==================== SESSIONS ====================
// ponytail: one shared throttle for the whole app (it is a single-desk program); per-account if it ever serves a network.
const failedLogins = { count: 0, until: 0 };
const throttled = () => Date.now() < failedLogins.until;
function noteFailedLogin() {
  if (++failedLogins.count >= 5) {
    failedLogins.count = 0;
    failedLogins.until = Date.now() + 60_000;
  }
}

async function checkPassword(prisma, email, password) {
  const user = await prisma.user.findUnique({ where: { email: String(email || '').toLowerCase().trim() } });
  if (!user || !user.isActive || user.deletedAt) return null;
  const legacyPlain = !isHashed(user.password) && user.password === password;
  if (!legacyPlain && !(await bcrypt.compare(String(password || ''), user.password))) return null;
  if (legacyPlain) await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 12) } });
  return user;
}

// ==================== OWNER RECOVERY CODE ====================
// Offline answer to "the owner forgot the password": a one-time code shown at setup (or made again from
// Settings), stored only as a bcrypt hash. Staff passwords are reset by the owner on the Staff screen.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no 0/O/1/I
const normalizeCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function issueRecoveryCode(prisma, userId) {
  const raw = Array.from(crypto.randomBytes(16), b => RECOVERY_ALPHABET[b % 32]).join(''); // 80 bits
  await prisma.user.update({ where: { id: userId }, data: { recoveryHash: await bcrypt.hash(raw, 12) } });
  return raw.match(/.{4}/g).join('-');
}

// ==================== DOCUMENT NUMBERS ====================
// Atomic, gap-tolerant numbering. Counting today's rows (the old way) re-issued an existing number as soon
// as anything was deleted, which made the next registration fail on the unique constraint.
const pad = (n, w) => String(n).padStart(w, '0');
const localYmd = d => `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
const NUMBERS = {
  patient: { model: 'patient', field: 'id', width: 5, prefix: d => `LAB-${d.getFullYear()}-`, key: d => `patient:${d.getFullYear()}` },
  order: { model: 'testOrder', field: 'orderNo', width: 4, prefix: d => `LAB-ORD-${localYmd(d)}-`, key: d => `order:${localYmd(d)}` },
  bill: { model: 'bill', field: 'billNo', width: 4, prefix: d => `LAB-BIL-${localYmd(d)}-`, key: d => `bill:${localYmd(d)}` },
};

async function nextNumber(prisma, kind, dateStr) {
  const f = NUMBERS[kind];
  if (!f) throw new Error(`Unknown number kind: ${kind}`);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') ? new Date(`${dateStr}T12:00:00`) : new Date();
  const prefix = f.prefix(d);
  const key = f.key(d);
  return prisma.$transaction(async tx => {
    let row = await tx.counter.findUnique({ where: { key } });
    if (!row) {
      // First number of this period: continue after anything already issued (older versions, upgrades).
      const existing = await tx[f.model].findMany({ where: { [f.field]: { startsWith: prefix } }, select: { [f.field]: true } });
      const max = existing.reduce((m, r) => Math.max(m, parseInt(r[f.field].slice(prefix.length), 10) || 0), 0);
      row = await tx.counter.create({ data: { key, value: max } });
    }
    const value = row.value + 1;
    await tx.counter.update({ where: { key }, data: { value } });
    return prefix + pad(value, f.width);
  });
}

// ==================== STAFF & SHIFTS ====================
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const minutes = hhmm => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// Night shifts wrap past midnight (e.g. 20:00 -> 08:00).
function onShift(staff, now = new Date()) {
  const start = minutes(staff?.shiftStart);
  const end = minutes(staff?.shiftEnd);
  if (start === null || end === null) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return start <= end ? t >= start && t < end : t >= start || t < end;
}

const friendlyDbError = err =>
  err?.code === 'P2002' ? 'That email is already used by another login.' : err?.message || 'Could not save.';

async function saveStaff(ctx, b) {
  const admin = requireSession(ctx, 'staff:manage');
  const role = String(b.role || '').toUpperCase();
  if (!String(b.name || '').trim()) return fail(400, 'Name is required');
  if (!STAFF_ROLES.includes(role)) return fail(400, 'Choose a valid role');
  const login = b.login || {};
  const email = String(login.email || '').toLowerCase().trim();
  if (login.enabled && !/^\S+@\S+\.\S+$/.test(email)) return fail(400, 'Enter a valid email for the login');
  if (login.password && String(login.password).length < 6) return fail(400, 'Password must be at least 6 characters');
  const addons = (login.addons || []).filter(a => ADDONS[a]);
  const roleString = addons.length ? `${role}:${addons.join(',')}` : role;
  const staffData = {
    name: String(b.name).trim(),
    role,
    mobile: b.mobile || null,
    salary: b.salary === '' || b.salary === undefined || b.salary === null ? null : Number(b.salary),
    joinedAt: b.joinedAt ? new Date(b.joinedAt) : null,
    shift: b.shift || null,
    shiftStart: b.shiftStart || null,
    shiftEnd: b.shiftEnd || null,
  };
  try {
    const saved = await ctx.prisma.$transaction(async tx => {
      let staff = b.id ? await tx.staff.update({ where: { id: Number(b.id) }, data: staffData }) : await tx.staff.create({ data: staffData });
      if (login.enabled) {
        const userData = { name: staffData.name, email, role: roleString, isActive: true, deletedAt: null };
        if (login.password) userData.password = await bcrypt.hash(String(login.password), 12);
        if (staff.userId) {
          await tx.user.update({ where: { id: staff.userId }, data: userData });
        } else {
          if (!login.password) throw new AccessError('Set a password for the new login');
          const user = await tx.user.create({ data: userData });
          staff = await tx.staff.update({ where: { id: staff.id }, data: { userId: user.id } });
        }
      } else if (staff.userId) {
        await tx.user.update({ where: { id: staff.userId }, data: { isActive: false } });
      }
      return staff;
    });
    await audit(ctx.prisma, admin.id, 'Staff', b.id ? 'Updated staff member' : 'Added staff member',
      `${saved.name} · ${roleLabel(roleString)}${saved.shift ? ` · ${saved.shift} ${saved.shiftStart || ''}-${saved.shiftEnd || ''}` : ''}${login.enabled ? ` · login ${email}` : ''}`);
    ctx.notify?.('staff');
    return ok({ success: true, staff: saved });
  } catch (err) {
    if (err instanceof AccessError) return fail(400, err.message);
    return fail(400, friendlyDbError(err));
  }
}

// ==================== BACKUPS ====================
// VACUUM INTO writes a consistent, compacted copy of the live database (safe while the app is running).
const backupDir = ctx => path.join(ctx.dataDir, 'backups');

async function createBackup(ctx, type = 'MANUAL', dest) {
  const dir = backupDir(ctx);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = dest || path.join(dir, `jharlab-${type.toLowerCase()}-${stamp}.db`);
  fs.rmSync(file, { force: true });
  await ctx.prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const sizeBytes = fs.statSync(file).size;
  await ctx.prisma.backupLog.create({
    data: { filename: path.basename(file), sizeBytes, type, status: 'SUCCESS', createdBy: ctx.session?.user?.id || 0 },
  });
  return { file, sizeBytes };
}

function listBackups(ctx) {
  const dir = backupDir(ctx);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, file: path.join(dir, f), sizeBytes: st.size, createdAt: st.mtime.toISOString(), type: /-auto-/.test(f) ? 'AUTO' : /-safety-/.test(f) ? 'SAFETY' : /-preupdate-/.test(f) ? 'UPDATE' : 'MANUAL' };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// A restore only accepts a real SQLite file that holds JharLab's core tables.
async function verifyBackupFile(file, PrismaClient) {
  const header = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, header, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString('latin1') !== 'SQLite format 3\0') throw new Error('This file is not a JharLab backup.');
  const probe = new PrismaClient({ datasources: { db: { url: `file:${file.replace(/\\/g, '/')}` } } });
  try {
    const tables = await probe.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Patient','User','LabSettings')");
    if (tables.length < 3) throw new Error('This backup does not contain JharLab lab data.');
  } finally {
    await probe.$disconnect();
  }
}

// Daily automatic backup, keeping the newest 14.
async function autoBackup(ctx, keep = 14) {
  const autos = listBackups(ctx).filter(b => b.type === 'AUTO');
  if (autos[0] && Date.now() - new Date(autos[0].createdAt).getTime() < 20 * 3600e3) return null;
  const made = await createBackup(ctx, 'AUTO');
  for (const old of listBackups(ctx).filter(b => b.type === 'AUTO').slice(keep)) fs.rmSync(old.file, { force: true });
  return made;
}

// ==================== UPDATES WITHOUT DATA LOSS ====================
// The app version that last opened a database is kept in the file itself (PRAGMA user_version): 1.4.0 -> 10400.
const versionCode = v => String(v).split('.').slice(0, 3).reduce((n, p) => n * 100 + (parseInt(p, 10) || 0), 0);
const versionName = c => [Math.floor(c / 10000), Math.floor(c / 100) % 100, c % 100].join('.');

// Opens the database for this app version. When a different version used it last, an untouched copy is
// saved in backups/ first (never pruned), then new tables/columns are added and the version recorded.
async function upgradeDatabase(prisma, sql, { dataDir, version }) {
  const code = versionCode(version);
  const was = Number((await prisma.$queryRawUnsafe('PRAGMA user_version'))[0].user_version);
  let backup = null;
  if (was !== code && (await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name='User'")).length) {
    fs.mkdirSync(backupDir({ dataDir }), { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    backup = path.join(backupDir({ dataDir }), `jharlab-preupdate-${was ? versionName(was) : 'old'}-to-${version}-${stamp}.db`);
    await prisma.$executeRawUnsafe(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  }
  await ensureSchema(prisma, sql);
  if (was !== code) await prisma.$executeRawUnsafe(`PRAGMA user_version = ${code}`);
  return { backup };
}

// Folders older installs kept their data in, next to this app's (%APPDATA%\<name>\dev.db).
const LEGACY_DATA_DIRS = ['offline-lab-lis'];

// A missing database is never silently replaced by an empty lab: the newest of this app's backups and older
// installs' databases is copied in. Returns the file used, or null on a genuine first run.
function recoverMissingDatabase(dbFile, dataDir) {
  if (fs.existsSync(dbFile)) return null;
  const changed = f => Math.max(...[f, `${f}-wal`].map(x => fs.statSync(x, { throwIfNoEntry: false })?.mtimeMs || 0));
  const found = [...listBackups({ dataDir }).map(b => b.file), ...LEGACY_DATA_DIRS.map(n => path.join(path.dirname(dataDir), n, 'dev.db'))]
    .filter(f => fs.statSync(f, { throwIfNoEntry: false })?.size > 0)
    .sort((a, b) => changed(b) - changed(a))[0];
  if (!found) return null;
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  for (const ext of ['-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true }); // never mix in another file's log
  fs.copyFileSync(found, dbFile);
  if (fs.existsSync(`${found}-wal`)) fs.copyFileSync(`${found}-wal`, `${dbFile}-wal`);
  return found;
}


const routes = {
  'GET auth/setup-status': async ({ prisma }) => ok({ success: true, isSetupRequired: (await ownerCount(prisma)) === 0 }),

  'POST auth/setup': async (ctx, b) => {
    const { prisma } = ctx;
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
    ctx.session = { user: publicUser(owner) };
    return ok({ success: true, user: ctx.session.user, recoveryCode: await issueRecoveryCode(prisma, owner.id) });
  },

  'POST auth/login': async (ctx, b) => {
    if (!b.email || !b.password) return fail(400, 'Email and password are required');
    if (throttled()) return fail(429, 'Too many wrong passwords. Wait a minute and try again.');
    const user = await checkPassword(ctx.prisma, b.email, b.password);
    if (!user) {
      noteFailedLogin();
      return fail(401, 'Invalid email or password, or the account is disabled');
    }
    failedLogins.count = 0;
    const updated = await ctx.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    ctx.session = { user: publicUser(updated) };
    await audit(ctx.prisma, user.id, 'Staff', 'Signed in', user.email);
    return ok({ success: true, user: ctx.session.user });
  },

  'POST auth/logout': async ctx => {
    if (ctx.session?.user) await audit(ctx.prisma, ctx.session.user.id, 'Staff', 'Signed out', ctx.session.user.email);
    ctx.session = null;
    return ok({ success: true });
  },

  // Owner forgot the password (and maybe the email): the recovery code alone identifies the owner.
  // The code is single-use: a new one is issued and shown with the email.
  'POST auth/recover': async (ctx, b) => {
    if (throttled()) return fail(429, 'Too many wrong codes. Wait a minute and try again.');
    if (String(b.newPassword || '').length < 6) return fail(400, 'Password must be at least 6 characters');
    const code = normalizeCode(b.code);
    const owners = await ctx.prisma.user.findMany({ where: { role: 'SUPER_ADMIN', deletedAt: null, recoveryHash: { not: null } } });
    let owner = null;
    for (const u of owners) if (await bcrypt.compare(code, u.recoveryHash)) owner = u;
    if (!owner) {
      noteFailedLogin();
      return fail(401, 'That recovery code is not right');
    }
    failedLogins.count = 0;
    await ctx.prisma.user.update({ where: { id: owner.id }, data: { password: await bcrypt.hash(String(b.newPassword), 12) } });
    const recoveryCode = await issueRecoveryCode(ctx.prisma, owner.id);
    await audit(ctx.prisma, owner.id, 'Staff', 'Reset password with recovery code', owner.email);
    return ok({ success: true, email: owner.email, recoveryCode });
  },

  'GET auth/recovery-code': async ctx => {
    const me = requireSession(ctx, null);
    const user = await ctx.prisma.user.findUnique({ where: { id: me.id }, select: { role: true, recoveryHash: true } });
    return ok({ success: true, isOwner: user?.role === 'SUPER_ADMIN', hasCode: !!user?.recoveryHash });
  },

  // A new code replaces the old one; needs the current password so an unattended session cannot make one.
  'POST auth/recovery-code': async (ctx, b) => {
    const me = requireSession(ctx, null);
    if (me.role !== 'SUPER_ADMIN') return fail(403, 'Only the lab owner has a recovery code');
    if (throttled()) return fail(429, 'Too many wrong passwords. Wait a minute and try again.');
    if (!(await checkPassword(ctx.prisma, me.email, b.password))) {
      noteFailedLogin();
      return fail(401, 'Wrong password');
    }
    const recoveryCode = await issueRecoveryCode(ctx.prisma, me.id);
    await audit(ctx.prisma, me.id, 'Staff', 'Made a new recovery code', me.email);
    return ok({ success: true, recoveryCode });
  },

  'GET auth/me': async ctx => ok({ success: true, user: ctx.session?.user || null }),

  // Owner/admin password at someone else's desk (discount unlock, editing an approved report).
  'POST auth/verify-admin': async (ctx, b) => {
    requireSession(ctx, null);
    if (throttled()) return fail(429, 'Too many wrong passwords. Wait a minute and try again.');
    const user = await checkPassword(ctx.prisma, b.email, b.password);
    if (!user || !isAdmin(user.role)) {
      noteFailedLogin();
      return fail(401, 'Only the lab owner or an admin can approve this');
    }
    await audit(ctx.prisma, user.id, 'Staff', 'Approved override', `${b.reason || 'restricted action'} for ${ctx.session.user.name}`);
    return ok({ success: true, user: publicUser(user) });
  },

  'POST db': async (ctx, b) => ok({ success: true, data: await dbQuery(ctx.prisma, b, ctx) }),

  'POST numbers/next': async (ctx, b) => {
    requireSession(ctx, null);
    return ok({ success: true, number: await nextNumber(ctx.prisma, b.kind, b.date) });
  },

  // Admin-only, all-or-nothing: the patient with every order, result, report, bill and payment.
  'POST patients/delete': async (ctx, b) => {
    const user = requireSession(ctx, 'patient:delete');
    const ids = [].concat(b.ids || []).map(String);
    if (!ids.length) return fail(400, 'No patients selected');
    const deleted = await ctx.prisma.$transaction(async tx => {
      const patients = await tx.patient.findMany({ where: { id: { in: ids } }, include: { orders: { include: { items: true } }, bills: true } });
      for (const p of patients) {
        const orderIds = p.orders.map(o => o.id);
        const itemIds = p.orders.flatMap(o => o.items.map(i => i.id));
        const billIds = p.bills.map(x => x.id);
        await tx.testResult.deleteMany({ where: { orderItemId: { in: itemIds } } });
        await tx.testOrderItem.deleteMany({ where: { id: { in: itemIds } } });
        await tx.report.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.testOrder.deleteMany({ where: { id: { in: orderIds } } });
        await tx.payment.deleteMany({ where: { billId: { in: billIds } } });
        await tx.bill.deleteMany({ where: { id: { in: billIds } } });
        await tx.patient.delete({ where: { id: p.id } });
      }
      return patients;
    }, { timeout: 60000 });
    for (const p of deleted) {
      await audit(ctx.prisma, user.id, 'Patients', 'Deleted patient', `${p.name} (${p.id}) with ${p.orders.length} order(s), ${p.bills.length} bill(s)`);
    }
    ctx.notify?.('patient');
    return ok({ success: true, count: deleted.length });
  },

  'GET staff/list': async ctx => {
    requireSession(ctx, 'staff:manage');
    const [staff, users, attendance] = await Promise.all([
      ctx.prisma.staff.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      ctx.prisma.user.findMany({ select: { id: true, email: true, role: true, isActive: true, lastLogin: true } }),
      ctx.prisma.attendance.findMany({ where: { date: { gte: startOfToday() } } }),
    ]);
    return ok({
      success: true,
      staff: staff.map(s => ({
        ...s,
        onDuty: onShift(s),
        login: users.find(u => u.id === s.userId) || null,
        attendance: attendance.find(a => a.staffId === s.id)?.status || null,
      })),
    });
  },

  'POST staff/save': saveStaff,

  'POST staff/remove': async (ctx, b) => {
    const admin = requireSession(ctx, 'staff:manage');
    const staff = await ctx.prisma.staff.update({ where: { id: Number(b.id) }, data: { isActive: false } });
    if (staff.userId) await ctx.prisma.user.update({ where: { id: staff.userId }, data: { isActive: false, deletedAt: new Date() } });
    await audit(ctx.prisma, admin.id, 'Staff', 'Removed staff member', `${staff.name}${staff.userId ? ' (login disabled)' : ''}`);
    ctx.notify?.('staff');
    return ok({ success: true });
  },

  'POST staff/attendance': async (ctx, b) => {
    requireSession(ctx, 'staff:manage');
    const staffId = Number(b.staffId);
    const status = b.status === 'ABSENT' ? 'ABSENT' : b.status === 'LEAVE' ? 'LEAVE' : 'PRESENT';
    const today = startOfToday();
    const existing = await ctx.prisma.attendance.findFirst({ where: { staffId, date: { gte: today } } });
    const time = new Date().toTimeString().slice(0, 5);
    if (existing) await ctx.prisma.attendance.update({ where: { id: existing.id }, data: { status } });
    else await ctx.prisma.attendance.create({ data: { staffId, date: new Date(), status, inTime: status === 'PRESENT' ? time : null } });
    return ok({ success: true });
  },

  // Today per person: money received, results entered, reports approved, and who is on shift now.
  'GET dashboard/staff': async ctx => {
    const me = requireSession(ctx, null);
    const since = startOfToday();
    const { prisma } = ctx;
    const [users, staff, payments, results, approvals] = await Promise.all([
      prisma.user.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true, role: true, lastLogin: true } }),
      prisma.staff.findMany({ where: { isActive: true } }),
      prisma.payment.groupBy({ by: ['receivedBy'], where: { paidAt: { gte: since } }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.testResult.groupBy({ by: ['enteredBy'], where: { enteredAt: { gte: since } }, _count: { _all: true } }),
      prisma.report.groupBy({ by: ['approvedBy'], where: { approvedAt: { gte: since } }, _count: { _all: true } }),
    ]);
    const rows = users.map(u => {
      const s = staff.find(x => x.userId === u.id);
      const pay = payments.find(x => x.receivedBy === u.id);
      return {
        id: u.id,
        name: u.name,
        role: roleLabel(u.role),
        shift: s?.shift || null,
        shiftStart: s?.shiftStart || null,
        shiftEnd: s?.shiftEnd || null,
        onDuty: onShift(s),
        signedIn: me.id === u.id,
        collected: pay?._sum.amount || 0,
        payments: pay?._count._all || 0,
        results: results.find(x => x.enteredBy === u.id)?._count._all || 0,
        approvals: approvals.find(x => x.approvedBy === u.id)?._count._all || 0,
      };
    });
    return ok({ success: true, rows: isAdmin(me.role) ? rows : rows.filter(r => r.id === me.id) });
  },

  // Active people who can sign in, for "assign to" pickers (no contact or salary details).
  'GET staff/names': async ctx => {
    requireSession(ctx, null);
    const users = await ctx.prisma.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } });
    return ok({ success: true, people: users.map(u => ({ id: u.id, name: u.name, role: roleLabel(u.role) })) });
  },

  // Stock in / out / correction and the item's new balance, together.
  'POST inventory/move': async (ctx, b) => {
    const user = requireSession(ctx, null);
    const quantity = Number(b.quantity);
    const type = ['IN', 'OUT', 'ADJUST'].includes(b.type) ? b.type : null;
    if (!type || !(quantity >= 0) || (type !== 'ADJUST' && quantity === 0)) return fail(400, 'Enter a valid quantity');
    const item = await ctx.prisma.$transaction(async tx => {
      const current = await tx.inventoryItem.findUnique({ where: { id: Number(b.itemId) } });
      if (!current) throw new AccessError('Item not found');
      const next = type === 'IN' ? current.currentStock + quantity : type === 'OUT' ? current.currentStock - quantity : quantity;
      if (next < 0) throw new AccessError(`Only ${current.currentStock} ${current.unit} in stock`);
      await tx.inventoryTransaction.create({ data: { itemId: current.id, type, quantity, note: b.note || null, createdBy: user.id } });
      return tx.inventoryItem.update({ where: { id: current.id }, data: { currentStock: next } });
    }).catch(err => {
      if (err instanceof AccessError) return { error: err.message };
      throw err;
    });
    if (item.error) return fail(400, item.error);
    await audit(ctx.prisma, user.id, 'Inventory', `Stock ${type === 'IN' ? 'in' : type === 'OUT' ? 'out' : 'corrected'}`, `${item.name}: ${type === 'ADJUST' ? 'set to' : type === 'IN' ? '+' : '−'}${quantity} ${item.unit} → ${item.currentStock}${b.note ? ` · ${b.note}` : ''}`);
    ctx.notify?.('inventoryItem');
    return ok({ success: true, item });
  },

  // Code 128 barcode PNG for sample labels (scannable by analyzers and barcode guns).
  'POST barcode/png': async (ctx, b) => {
    requireSession(ctx, null);
    const text = String(b.text || '').trim();
    if (!text) return fail(400, 'Nothing to encode');
    const png = await require('bwip-js').toBuffer({ bcid: 'code128', text, scale: 3, height: 10, includetext: false });
    return { status: 200, body: png, type: 'image/png' };
  },

  // This month's money for the owner: collections in, expenses out, net.
  'GET dashboard/money': async ctx => {
    const me = requireSession(ctx, null);
    if (!isAdmin(me.role)) return ok({ success: true, visible: false });
    const since = startOfToday();
    since.setDate(1);
    const [paid, spent] = await Promise.all([
      ctx.prisma.payment.aggregate({ where: { paidAt: { gte: since } }, _sum: { amount: true } }),
      ctx.prisma.expense.aggregate({ where: { date: { gte: since } }, _sum: { amount: true } }),
    ]);
    const revenue = paid._sum.amount || 0;
    const expenses = spent._sum.amount || 0;
    return ok({ success: true, visible: true, revenue, expenses, net: revenue - expenses });
  },

  'GET backup/list': async ctx => {
    requireSession(ctx, null);
    return ok({ success: true, dir: backupDir(ctx), backups: listBackups(ctx) });
  },

  'POST backup/create': async ctx => {
    const user = requireSession(ctx, 'backup:create');
    const made = await createBackup(ctx, 'MANUAL');
    await audit(ctx.prisma, user.id, 'Backup', 'Created backup', `${path.basename(made.file)} (${Math.round(made.sizeBytes / 1024)} KB)`);
    return ok({ success: true, backup: made });
  },

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

  'POST reports/approve': async (ctx, b) => {
    const user = requireSession(ctx, 'report:approve');
    const order = await approveReport(ctx.prisma, Number(b.orderId), user.id);
    const v = order.report.version;
    await audit(ctx.prisma, user.id, 'Reports', v > 1 ? 'Approved amended report' : 'Approved report', `${order.orderNo} · ${order.patient.name}${v > 1 ? ` · revision ${v}` : ''}`);
    ctx.notify?.('report');
    return ok({ success: true, version: v });
  },

  // One PDF for one or many reports (bulk print). preview: true leaves the print count alone.
  'POST reports/pdf': async (ctx, b) => {
    const user = requireSession(ctx, null);
    const ids = [].concat(b.orderIds ?? b.orderId ?? []).map(Number).filter(Boolean);
    if (!ids.length) return fail(400, 'No report selected');
    const reports = [];
    for (const id of ids) reports.push(await loadReport(ctx.prisma, id));
    const pdf = await renderReports(reports, { ...pick(await labSettings(ctx.prisma), PRINT_OPTIONS), qrPng: reportQrPng });
    if (!b.preview) {
      for (const { order } of reports) {
        await ctx.prisma.report.upsert({ where: { orderId: order.id }, update: { printCount: { increment: 1 } }, create: { orderId: order.id, printCount: 1 } });
      }
      await audit(ctx.prisma, user.id, 'Reports', 'Printed report', reports.map(r => r.order.orderNo).join(', '));
      ctx.notify?.('report');
    }
    return { status: 200, body: Buffer.from(pdf), type: 'application/pdf' };
  },

  // Link that lets the patient check an approved report online (sent on WhatsApp).
  'POST reports/verify-url': async (ctx, b) => {
    requireSession(ctx, null);
    const { order, data } = await loadReport(ctx.prisma, Number(b.orderId));
    if (!isFinal(order)) return fail(400, 'Approve the report first');
    return ok({ success: true, verifyUrl: reportVerifyUrl(data) });
  },

  // Print options older versions kept only in the browser; AppLayout moves them here once.
  'POST settings/import-print-options': async (ctx, b) => {
    requireSession(ctx, 'settings');
    const data = Object.fromEntries(['printShowLogo', 'printShowQR', 'printSignatures', 'coSigning'].filter(k => typeof b[k] === 'boolean').map(k => [k, b[k]]));
    if (typeof b.nablNumber === 'string' && b.nablNumber.trim()) data.nablNumber = b.nablNumber.trim();
    await ctx.prisma.labSettings.updateMany({ where: { id: 1 }, data });
    return ok({ success: true });
  },
};

// Runs a route by name. Used directly by Electron IPC handlers.
async function callRoute(ctx, method, name, body = {}, query = new URLSearchParams()) {
  const handler = routes[`${method} ${name}`];
  if (!handler) return fail(404, `No API route ${method} /api/${name}`);
  try {
    return await handler(ctx, body, query);
  } catch (err) {
    if (err instanceof AccessError) return fail(403, err.message, { code: 'ACCESS' });
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
  AccessError,
  ensureSchema,
  upgradeDatabase,
  recoverMissingDatabase,
  dbQuery,
  nextNumber,
  createBackup,
  listBackups,
  autoBackup,
  verifyBackupFile,
  onShift,
  callRoute,
  handleRequest,
  approveReport,
  loadReport,
  getMachineId,
  encryptLicenseKey,
  validateLicenseKey,
};
