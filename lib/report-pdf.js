// Lab report PDF (A4) from report data (lib/report-data.js). Printer-friendly: white header, black text,
// abnormal results in bold with H / L / Critical. Header, patient block and table heading repeat on every
// page; signatures and the verification QR close the last page. One call can render many reports into a
// single PDF (bulk print), each with its own page numbering.
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

const W = 595.28;
const H = 841.89;
const M = 36;
const R = W - M;
const CW = R - M;
const MM = 72 / 25.4;

const C = {
  ink: rgb(0.1, 0.11, 0.14),
  navy: rgb(0.07, 0.2, 0.38),
  teal: rgb(0, 0.47, 0.47),
  gray: rgb(0.42, 0.44, 0.48),
  line: rgb(0.82, 0.84, 0.87),
  band: rgb(0.95, 0.96, 0.97),
  high: rgb(0.75, 0.1, 0.1),
  low: rgb(0.1, 0.3, 0.72),
  draft: rgb(0.85, 0.15, 0.15),
};

// Table columns: investigation | result | unit | biological reference interval
const COL = { name: M + 6, value: M + 214, unit: M + 300, range: M + 372 };
const COLW = { name: 200, value: 82, unit: 68, range: R - (M + 372) - 4 };

const DEFAULT_FOOTER = 'Results relate only to the sample tested. This is a computer-generated report; kindly correlate clinically.';

function fmtDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const date = `${String(d.getDate()).padStart(2, '0')}-${mon}-${d.getFullYear()}`;
  if (!withTime) return date;
  const h = d.getHours() % 12 || 12;
  return `${date} ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

const isPng = b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpg = b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

/**
 * @param reports [{ data, assets }] from lib/report-data.js (snapshot or live)
 * @param opts { printShowLogo, printShowQR, printSignatures, letterhead, letterheadTopMm, letterheadBottomMm, qrPng(data) => Promise<Buffer> }
 */
async function renderReports(reports, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const bwip = require('bwip-js');

  // The standard PDF fonts only cover Windows-1252: map the usual lab symbols, '?' for the rest, so an
  // unusual character in a name or unit can never stop a report from printing.
  const charset = new Set(font.getCharacterSet());
  const SUBST = { '≤': '<=', '≥': '>=', '↑': 'H', '↓': 'L', '→': '->', '⁶': '^6', '⁹': '^9', '⁰': '^0', '₹': 'Rs.', '✓': 'v', '−': '-', '\t': ' ', '\n': ' ', '\r': '' };
  const clean = s => Array.from(String(s ?? '')).map(ch => (charset.has(ch.codePointAt(0)) ? ch : SUBST[ch] ?? '?')).join('');

  const width = (t, f, size) => f.widthOfTextAtSize(t, size);
  function fit(text, max, f, size) {
    let t = clean(text);
    if (width(t, f, size) <= max) return t;
    while (t.length > 1 && width(`${t}..`, f, size) > max) t = t.slice(0, -1);
    return `${t}..`;
  }
  function wrap(text, max, f, size, maxLines = 3) {
    const words = clean(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (width(next, f, size) <= max || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) lines.splice(maxLines - 1, lines.length, lines.slice(maxLines - 1).join(' '));
    return lines.map(l => fit(l, max, f, size));
  }

  const images = new Map();
  async function embed(hash, assets) {
    if (!hash || !assets?.[hash]) return null;
    if (!images.has(hash)) {
      const buf = assets[hash];
      let img = null;
      try {
        img = isPng(buf) ? await doc.embedPng(buf) : isJpg(buf) ? await doc.embedJpg(buf) : null;
      } catch {
        img = null; // a damaged image is left out rather than failing the whole report
      }
      images.set(hash, img);
    }
    return images.get(hash);
  }
  // Largest size that fits the box, keeping the image's shape.
  const contain = (img, maxW, maxH) => {
    const k = Math.min(maxW / img.width, maxH / img.height, 1.5);
    return { width: img.width * k, height: img.height * k };
  };

  const letterhead = !!opts.letterhead;
  const headerBottom = letterhead ? H - (Number(opts.letterheadTopMm) || 40) * MM : H - 104;
  const footerBase = letterhead ? (Number(opts.letterheadBottomMm) || 20) * MM : 0;
  const bottomLimit = footerBase + 52;

  for (const { data, assets } of reports) {
    const draft = data.status !== 'FINAL';
    const amended = !draft && data.version > 1;
    const lab = data.lab || {};
    const logo = opts.printShowLogo !== false && !letterhead ? await embed(lab.logo, assets) : null;
    const barcode = data.orderNo
      ? await doc.embedPng(await bwip.toBuffer({ bcid: 'code128', text: data.orderNo, scale: 2, height: 7, includetext: false }))
      : null;
    const qr = !draft && opts.printShowQR !== false && opts.qrPng ? await doc.embedPng(await opts.qrPng(data)) : null;
    const firstPage = doc.getPageCount();
    let page;
    let y;

    const text = (t, x, yy, size, f = font, color = C.ink) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
    const right = (t, xr, yy, size, f = font, color = C.ink) => {
      const s = clean(t);
      page.drawText(s, { x: xr - width(s, f, size), y: yy, size, font: f, color });
    };
    const center = (t, yy, size, f = font, color = C.ink) => {
      const s = clean(t);
      page.drawText(s, { x: (W - width(s, f, size)) / 2, y: yy, size, font: f, color });
    };
    const hline = (yy, color = C.line, thickness = 0.5, x1 = M, x2 = R) =>
      page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });

    function drawLetterhead() {
      if (letterhead) return;
      let x = M;
      if (logo) {
        const s = contain(logo, 70, 62);
        page.drawImage(logo, { x: M, y: H - 64 - s.height / 2, ...s });
        x = M + s.width + 12;
      }
      const ids = [lab.nabl && `NABL: ${lab.nabl}`, lab.regNo && `Reg. No: ${lab.regNo}`, lab.gstin && `GSTIN: ${lab.gstin}`].filter(Boolean);
      const idsW = ids.length ? Math.max(...ids.map(t => width(clean(t), font, 7.5))) + 8 : 0;
      const maxW = R - x - idsW;
      text(fit((lab.name || 'Laboratory').toUpperCase(), maxW, bold, 18), x, H - 46, 18, bold, C.navy);
      let ty = H - 60;
      if (lab.tagline) {
        text(fit(lab.tagline, maxW, italic, 9), x, ty, 9, italic, C.teal);
        ty -= 12;
      }
      for (const line of wrap(lab.address, maxW, font, 8, 2)) {
        text(line, x, ty, 8, font, C.gray);
        ty -= 10;
      }
      const contact = [lab.phone && `Ph: ${lab.phone}`, lab.email, lab.website].filter(Boolean).join('   |   ');
      if (contact) text(fit(contact, maxW, font, 8), x, ty, 8, font, C.gray);
      ids.forEach((t, i) => right(t, R, H - 44 - i * 11, 7.5, font, C.gray));
      page.drawLine({ start: { x: M, y: H - 98 }, end: { x: R, y: H - 98 }, thickness: 1.6, color: C.teal });
      page.drawLine({ start: { x: M, y: H - 101 }, end: { x: R, y: H - 101 }, thickness: 0.5, color: C.navy });
    }

    function drawPatientBlock() {
      let top = headerBottom - 8;
      const title = draft ? 'DRAFT REPORT - NOT VERIFIED' : amended ? `LABORATORY TEST REPORT  (AMENDED - REVISION ${data.version})` : 'LABORATORY TEST REPORT';
      center(title, top - 10, 9.5, bold, draft || amended ? C.draft : C.navy);
      top -= 18;
      const boxH = 64;
      page.drawRectangle({ x: M, y: top - boxH, width: CW, height: boxH, color: C.band, borderColor: C.line, borderWidth: 0.6 });
      const row = (label, value, lx, vx, maxW, i, f = font) => {
        text(label, lx, top - 14 - i * 13, 7.5, bold, C.gray);
        text(fit(value, maxW, f, 8.5), vx, top - 14 - i * 13, 8.5, f);
      };
      const p = data.patient || {};
      row('Patient Name', p.name, M + 8, M + 70, 168, 0, bold);
      row('Age / Sex', [p.age, p.gender].filter(Boolean).join(' / '), M + 8, M + 70, 168, 1);
      row('Patient ID', p.id, M + 8, M + 70, 168, 2);
      row('Referred By', p.referredBy, M + 8, M + 70, 168, 3);
      row('Report No', data.orderNo, M + 244, M + 296, 106, 0);
      row('Registered', fmtDate(data.registeredAt), M + 244, M + 296, 106, 1);
      row('Collected', fmtDate(data.collectedAt) || '-', M + 244, M + 296, 106, 2);
      row('Reported', fmtDate(data.reportedAt) || (draft ? 'Pending' : '-'), M + 244, M + 296, 106, 3);
      if (barcode) {
        // 1D barcode: full column width, bars stretched to a scannable height.
        const bw = R - 8 - (M + 406);
        page.drawImage(barcode, { x: R - 8 - bw, y: top - 38, width: bw, height: 26 });
        right(data.orderNo, R - 8, top - 49, 7, font, C.gray);
      }
      y = top - boxH - 10;
    }

    function drawTableHead() {
      page.drawRectangle({ x: M, y: y - 16, width: CW, height: 16, color: C.navy });
      text('INVESTIGATION', COL.name, y - 11, 7.5, bold, rgb(1, 1, 1));
      text('RESULT', COL.value, y - 11, 7.5, bold, rgb(1, 1, 1));
      text('UNIT', COL.unit, y - 11, 7.5, bold, rgb(1, 1, 1));
      text('BIOLOGICAL REF. INTERVAL', COL.range, y - 11, 7.5, bold, rgb(1, 1, 1));
      y -= 20;
    }

    function newPage() {
      page = doc.addPage([W, H]);
      drawLetterhead();
      drawPatientBlock();
      if (draft) {
        page.drawText('DRAFT', { x: 150, y: 300, size: 110, font: bold, color: C.draft, opacity: 0.08, rotate: degrees(35) });
      }
    }
    // Starts a new page when `need` points of height do not fit; returns true if it did.
    const ensure = need => {
      if (y - need >= bottomLimit) return false;
      newPage();
      return true;
    };

    function contd(test) {
      text(fit(`${test.name} (contd.)`, CW, bold, 10.5), M, y - 11, 10.5, bold);
      y -= 15;
      drawTableHead();
    }

    newPage();
    let department = null;
    for (const test of data.tests || []) {
      if (test.department && test.department !== department) {
        ensure(64);
        department = test.department;
        const label = clean(department.toUpperCase());
        const lw = width(label, bold, 9);
        center(label, y - 12, 9, bold, C.teal);
        hline(y - 9, C.teal, 0.6, M, (W - lw) / 2 - 8);
        hline(y - 9, C.teal, 0.6, (W + lw) / 2 + 8, R);
        y -= 22;
      }
      const meta = [test.sample && `Sample: ${test.sample}`, test.method && `Method: ${test.method}`].filter(Boolean).join('     ');
      ensure(meta ? 72 : 60);
      text(fit(test.name, CW, bold, 10.5), M, y - 11, 10.5, bold);
      y -= 15;
      if (meta) {
        text(fit(meta, CW, font, 7.5), M, y - 8, 7.5, font, C.gray);
        y -= 12;
      }
      drawTableHead();

      for (const r of test.rows || []) {
        if (r.header) {
          if (ensure(34)) contd(test);
          text(fit(r.name, CW - 12, bold, 8.5), COL.name, y - 10, 8.5, bold, C.navy);
          y -= 15;
          continue;
        }
        const nameLines = wrap(r.name, COLW.name, font, 8.5);
        const rangeLines = wrap(r.range, COLW.range, font, 8);
        const h = Math.max(nameLines.length, rangeLines.length, 1) * 10 + 5;
        if (ensure(h)) contd(test);
        nameLines.forEach((l, i) => text(l, COL.name, y - 10 - i * 10, 8.5));
        const color = r.flag === 'L' ? C.low : r.flag ? C.high : C.ink;
        const val = fit(r.value, COLW.value - 22, r.flag ? bold : font, 9);
        text(val, COL.value, y - 10, 9, r.flag ? bold : font, color);
        if (r.flag) text(r.flag === 'C' ? 'Critical' : r.flag, COL.value + width(val, bold, 9) + 4, y - 10, r.flag === 'C' ? 6.5 : 8, bold, color);
        text(fit(r.unit, COLW.unit, font, 8), COL.unit, y - 10, 8, font, C.gray);
        rangeLines.forEach((l, i) => text(l, COL.range, y - 10 - i * 10, 8, font, C.gray));
        y -= h;
        hline(y + 2, C.line, 0.3);
      }
      y -= 10;
    }

    // End of report, then the signatures across the bottom of the last page.
    const SIG_H = 78;
    if (y - 16 < bottomLimit + SIG_H) newPage();
    center('-- End of Report --', y - 10, 7.5, italic, C.gray);
    const sy = bottomLimit + SIG_H; // top of the signature band
    hline(sy, C.line, 0.5);
    let sx = M;
    if (qr) {
      page.drawImage(qr, { x: M, y: sy - 68, width: 64, height: 64 });
      text('Scan to verify', M + 8, sy - 76, 6.5, font, C.gray);
      sx = M + 76;
    }
    if (draft) {
      text('Not verified by a pathologist. Not valid for clinical use.', sx, sy - 30, 9, bold, C.draft);
    } else {
      const people = data.signatories?.length ? data.signatories : [{ role: 'Authorised Signatory', name: '', qualification: '', regNo: '' }];
      const colW = (R - sx) / people.length;
      for (const [i, person] of people.entries()) {
        const cx = sx + colW * i + colW / 2;
        const sig = opts.printSignatures !== false ? await embed(person.image, assets) : null;
        if (sig) {
          const s = contain(sig, Math.min(110, colW - 10), 32);
          page.drawImage(sig, { x: cx - s.width / 2, y: sy - 40, ...s });
        }
        hline(sy - 44, C.ink, 0.4, cx - Math.min(60, colW / 2 - 6), cx + Math.min(60, colW / 2 - 6));
        const mid = (t, yy, size, f, color) => {
          const s = fit(t, colW - 8, f, size);
          page.drawText(s, { x: cx - width(s, f, size) / 2, y: yy, size, font: f, color });
        };
        mid(person.name || ' ', sy - 54, 8.5, bold, C.ink);
        if (person.qualification) mid(person.qualification, sy - 63, 7, font, C.gray);
        mid([person.role, person.regNo && `Reg. ${person.regNo}`].filter(Boolean).join('  |  '), sy - 72, 6.5, italic, C.gray);
      }
    }

    // Footer on every page of this report.
    const pages = doc.getPages().slice(firstPage);
    const printed = `Printed ${fmtDate(new Date().toISOString())}`;
    pages.forEach((pg, i) => {
      page = pg;
      hline(footerBase + 40, C.line, 0.4);
      for (const [j, line] of wrap(lab.footer || DEFAULT_FOOTER, CW - 90, italic, 6.5, 2).entries()) {
        text(line, M, footerBase + 31 - j * 8, 6.5, italic, C.gray);
      }
      right(`Page ${i + 1} of ${pages.length}`, R, footerBase + 31, 7.5, bold, C.navy);
      right(printed, R, footerBase + 21, 6, font, C.gray);
    });
  }

  if (reports.length === 1) {
    const d = reports[0].data;
    doc.setTitle(clean(`${d.patient?.name || 'Report'} - ${d.orderNo}`));
    doc.setAuthor(clean(d.lab?.name || ''));
  }
  doc.setCreator('JharLab');
  doc.setProducer('JharLab');
  return doc.save();
}

module.exports = { renderReports, fmtDate };
