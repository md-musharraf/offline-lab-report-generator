// What a lab report prints, as plain data: built from the database for a draft, and frozen into
// Report.snapshot when the report is approved (see approveReport in lib/server-api.js). Images are
// referred to by sha256 hash; build() returns them next to the data so they can be stored once.
const crypto = require('crypto');

const FINAL_STATUSES = ['APPROVED', 'DELIVERED'];

const AGE_UNITS = { YEARS: 'Years', MONTHS: 'Months', DAYS: 'Days' };
const GENDERS = { MALE: 'Male', FEMALE: 'Female' };

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

// Prisma hands back Buffers in Node; values that went through JSON arrive as { type: 'Buffer', data }.
function toBuffer(v) {
  if (!v) return null;
  if (Buffer.isBuffer(v)) return v.length ? v : null;
  if (v instanceof Uint8Array) return v.length ? Buffer.from(v) : null;
  if (v.type === 'Buffer' && Array.isArray(v.data)) return v.data.length ? Buffer.from(v.data) : null;
  if (typeof v === 'string') return Buffer.from(v.split(';base64,').pop(), 'base64');
  return null;
}

const ageInDays = p => (p.ageUnit === 'MONTHS' ? p.age * 30 : p.ageUnit === 'DAYS' ? p.age : p.age * 365);

function matchRange(param, patient) {
  const days = ageInDays(patient);
  return (param.refRanges || []).find(r =>
    (r.gender == null || r.gender === patient.gender) &&
    (r.ageMin == null || days >= r.ageMin) &&
    (r.ageMax == null || days <= r.ageMax));
}

function rangeText(param, range) {
  if (!range) return '';
  if (param.type !== 'NUMERIC' && param.type !== 'CALCULATED') return range.textNormal || '';
  if (range.normalMin != null && range.normalMax != null) return `${range.normalMin} - ${range.normalMax}`;
  if (range.normalMin != null) return `>= ${range.normalMin}`;
  if (range.normalMax != null) return `<= ${range.normalMax}`;
  return range.textNormal || '';
}

// Stored flags come from the result interpreter (↑ ↓ !!) and older versions (H L). Δ is a delta-check
// note for the lab, not a range flag, so it does not print.
function flagOf(result) {
  if (!result) return null;
  if (result.isCritical || result.flag === '!!') return 'C';
  if (result.flag === '↑' || result.flag === 'H') return 'H';
  if (result.flag === '↓' || result.flag === 'L') return 'L';
  return null;
}

function valueOf(result) {
  if (!result) return '';
  if (result.textValue != null && result.textValue !== '') return String(result.textValue);
  return result.numericValue != null ? String(result.numericValue) : '';
}

function testRows(item, patient) {
  const picked = (item.selectedParameters || '').split(',').map(Number).filter(n => n > 0);
  const params = [...(item.test?.parameters || [])]
    .filter(p => p.isHeader || !picked.length || picked.includes(p.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = params.map(p => {
    if (p.isHeader) return { name: p.name, header: true };
    const result = (item.results || []).find(r => r.parameterId === p.id);
    const range = matchRange(p, patient);
    // Dropdown ranges print only when the lab ticks "Print reference range" in the Tests Catalog.
    const printRange = p.type !== 'DROPDOWN' || p.printRefRange;
    const row = { name: p.name, value: valueOf(result), unit: range?.unit || p.unit || '', range: printRange ? rangeText(p, range) : '', flag: flagOf(result) };
    // A critical value still prints which way it is out of range (arrow up or down).
    const v = result?.numericValue;
    if (row.flag === 'C' && v != null && range) {
      if (range.normalMin != null && v < range.normalMin) row.dir = 'L';
      else if (range.normalMax != null && v > range.normalMax) row.dir = 'H';
    }
    return row;
  });
  // Drop section headers with nothing under them.
  return rows.filter((r, i) => !r.header || (rows[i + 1] && !rows[i + 1].header));
}

/**
 * @param order TestOrder with patient.doctor, report, items.results and items.test.{category, parameters.refRanges}
 * @param s LabSettings row (or {})
 * @returns {{ data: object, assets: Record<string, Buffer> }}
 */
function build(order, s = {}) {
  const assets = {};
  const image = v => {
    const buf = toBuffer(v);
    if (!buf) return null;
    const hash = sha256(buf);
    assets[hash] = buf;
    return hash;
  };
  const p = order.patient || {};
  const final = FINAL_STATUSES.includes(order.status);
  const person = (role, name, qualification, regNo, img) =>
    name && name.trim() ? { role, name: name.trim(), qualification: qualification || '', regNo: regNo || '', image: image(img) } : null;

  const data = {
    format: 1,
    status: final ? 'FINAL' : 'DRAFT',
    version: final ? order.report?.version || 1 : 0,
    lab: {
      name: s.labName || '',
      tagline: s.printHeader || '',
      logoCaption: s.logoCaption || '',
      address: s.address || '',
      phone: s.mobile || '', // up to four numbers, comma separated
      email: s.email || '',
      website: s.website || '',
      regNo: s.registrationNo || '',
      nabl: s.nablNumber || '',
      gstin: s.gstNumber || '',
      footer: s.reportFooter || '',
      logo: image(s.logo),
      logoRight: image(s.logoRight),
    },
    patient: {
      id: order.patientId || p.id || '',
      name: p.name || '',
      age: p.age != null ? `${p.age} ${AGE_UNITS[p.ageUnit] || 'Years'}` : '',
      gender: GENDERS[p.gender] || (p.gender ? 'Other' : ''),
      referredBy: p.doctor?.name || p.referredDoctor || 'Self',
      mobile: p.mobile || '',
      address: p.address || '',
    },
    orderNo: order.orderNo,
    registeredAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
    collectedAt: order.collectedAt ? new Date(order.collectedAt).toISOString() : null,
    reportedAt: final && order.report?.approvedAt ? new Date(order.report.approvedAt).toISOString() : null,
    tests: (order.items || []).map(item => ({
      name: item.test?.name || 'Test',
      department: item.test?.category?.name || '',
      sample: [item.test?.sampleType, item.test?.container].filter(Boolean).join(', '),
      method: item.test?.methodology || '',
      rows: testRows(item, p),
    })),
    signatories: [
      person('Lab Technician', s.technicianName, s.technicianQualification, s.technicianRegNo, s.technicianSignature),
      person('Consultant Pathologist', s.doctorName, s.doctorQualification, s.doctorRegNo, s.signature),
      s.coSigning ? person('Pathologist', s.pathologyDoctorName, s.pathologyDoctorQualification, s.pathologyDoctorRegNo, s.pathologyDoctorSignature) : null,
    ].filter(Boolean),
  };
  return { data, assets };
}

// Every image hash a report refers to.
const imageRefs = data => [data.lab?.logo, data.lab?.logoRight, ...(data.signatories || []).map(x => x.image)].filter(Boolean);

module.exports = { build, imageRefs, toBuffer, sha256, FINAL_STATUSES };
