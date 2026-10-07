// Lab report PDF (A4) from report data (lib/report-data.js). Printer-friendly: white page, black text, one
// accent colour chosen by the lab; abnormal results in bold with a red ▲ (high) or blue ▼ (low). Header,
// patient block and table heading repeat on every page; signatures and the verification QR close the last
// page. One call can render many reports into a single PDF (bulk print), each with its own page numbering.
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

const W = 595.28;
const H = 841.89;
const M = 36;
const R = W - M;
const CW = R - M;
const MM = 72 / 25.4;

const C = {
  ink: rgb(0.1, 0.11, 0.14),
  gray: rgb(0.36, 0.38, 0.42),
  line: rgb(0.8, 0.82, 0.85),
  high: rgb(0.8, 0.07, 0.07),
  low: rgb(0.08, 0.27, 0.75),
  draft: rgb(0.85, 0.15, 0.15),
  white: rgb(1, 1, 1),
};
const DEFAULT_COLOR = '#0e7490';

// Table columns: test | (arrow) result | unit | reference range
const COL = { name: M + 6, value: M + 218, unit: M + 304, range: M + 380 };
const COLW = { value: 84, unit: 72, range: R - (M + 380) - 4 };

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

function hexColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()) || /^#?([0-9a-f]{6})$/i.exec(DEFAULT_COLOR);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const mix = (c, k, to = 1) => rgb(c.red * k + to * (1 - k), c.green * k + to * (1 - k), c.blue * k + to * (1 - k));

// "7070982408 / 98765 43210; 9123456780" -> "7070982408, 98765 43210, 9123456780"
const phones = s => String(s || '').split(/\s*[,;/|\n]+\s*/).map(t => t.trim()).filter(Boolean).join(', ');

const isPng = b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpg = b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

/**
 * @param reports [{ data, assets }] from lib/report-data.js (snapshot or live)
 * @param opts { printShowLogo, printShowQR, printSignatures, letterhead, letterheadTopMm, letterheadBottomMm,
 *               printColor ('#rrggbb'), printFontSize (9-12), qrPng(data) => Promise<Buffer> }
 */
async function renderReports(reports, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const bwip = require('bwip-js');

  const accent = hexColor(opts.printColor);
  const dark = mix(accent, 0.62, 0); // lab name and headings: the accent, darker
  const tint = mix(accent, 0.1); // band and table-head fill
  const FS = Math.min(12, Math.max(9, Number(opts.printFontSize) || 10)); // result table text size
  const LS = FS + 2.5; // line step in the table

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
    const center = (t, yy, size, f = font, color = C.ink, cx = W / 2) => {
      const s = clean(t);
      page.drawText(s, { x: cx - width(s, f, size) / 2, y: yy, size, font: f, color });
    };
    const hline = (yy, color = C.line, thickness = 0.5, x1 = M, x2 = R) =>
      page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });
    // Solid triangle sitting on baseline `base`: ▲ for high, ▼ for low (the fonts have no arrow glyphs).
    const arrow = (dir, x, base, size, color) => {
      const w = size * 0.72;
      const h = size * 0.66;
      const path = dir === 'L' ? `M0 0 L${w} 0 L${w / 2} ${h} Z` : `M0 ${h} L${w / 2} 0 L${w} ${h} Z`;
      page.drawSvgPath(path, { x, y: base + h, color });
    };

    // Logo (with its caption) on the left, lab name and tagline beside it, registration numbers on the
    // right, then a tinted band with the address and up to four phone numbers. Returns the header's bottom.
    function drawLetterhead() {
      if (letterhead) return H - (Number(opts.letterheadTopMm) || 40) * MM;
      const top = H - 24;
      let x = M;
      let areaH = 56;
      if (logo) {
        const s = contain(logo, 84, 58);
        const capLines = lab.logoCaption ? wrap(lab.logoCaption, Math.max(s.width, 96), bold, 7.5, 2) : [];
        const colW = Math.max(s.width, ...capLines.map(l => width(l, bold, 7.5)));
        page.drawImage(logo, { x: M + (colW - s.width) / 2, y: top - s.height, ...s });
        capLines.forEach((l, i) => center(l, top - s.height - 10 - i * 9, 7.5, bold, accent, M + colW / 2));
        areaH = Math.max(areaH, s.height + (capLines.length ? capLines.length * 9 + 4 : 0));
        x = M + colW + 14;
      }
      const ids = [lab.nabl && `NABL: ${lab.nabl}`, lab.regNo && `Reg. No: ${lab.regNo}`, lab.gstin && `GSTIN: ${lab.gstin}`].filter(Boolean);
      const idsW = ids.length ? Math.max(...ids.map(t => width(clean(t), font, 8))) + 10 : 0;
      ids.forEach((t, i) => right(t, R, top - 8 - i * 11, 8, font, C.gray));
      const maxW = R - x - idsW;
      const name = clean((lab.name || 'Laboratory').toUpperCase());
      let size = 22;
      while (size > 14 && width(name, bold, size) > maxW) size -= 1;
      const blockH = size + (lab.tagline ? 16 : 0);
      const nameY = top - (areaH - blockH) / 2 - size * 0.78;
      text(fit(name, maxW, bold, size), x, nameY, size, bold, dark);
      if (lab.tagline) text(fit(lab.tagline, maxW, italic, 10.5), x, nameY - 16, 10.5, italic, accent);

      const phone = phones(lab.phone);
      const contact = [phone && `Mob: ${phone}`, lab.email && `Email: ${lab.email}`, lab.website].filter(Boolean).join('   |   ');
      const one = [lab.address, contact].filter(Boolean).join('   |   ');
      const max = CW - 20;
      const lines = !one ? [] : width(clean(one), bold, 9.5) <= max ? [one] : [...wrap(lab.address, max, bold, 9.5, 2), ...wrap(contact, max, bold, 9.5, 2)];
      const bandTop = top - areaH - 8;
      if (!lines.length) {
        hline(bandTop, accent, 1.6);
        return bandTop - 4;
      }
      const bandH = lines.length * 12 + 8;
      page.drawRectangle({ x: M, y: bandTop - bandH, width: CW, height: bandH, color: tint, borderColor: accent, borderWidth: 0.9 });
      lines.forEach((l, i) => center(l, bandTop - 13.5 - i * 12, 9.5, bold, C.ink));
      return bandTop - bandH;
    }

    function drawPatientBlock(headerBottom) {
      let top = headerBottom - 7;
      const title = draft ? 'DRAFT REPORT - NOT VERIFIED' : amended ? `TEST REPORT  (AMENDED - REVISION ${data.version})` : 'TEST REPORT';
      const tw = width(title, bold, 9) + 28;
      page.drawRectangle({ x: (W - tw) / 2, y: top - 15, width: tw, height: 15, color: draft || amended ? C.draft : accent });
      center(title, top - 11, 9, bold, C.white);
      top -= 21;
      const LH = 14.5;
      const boxH = 5 * LH + 8;
      page.drawRectangle({ x: M, y: top - boxH, width: CW, height: boxH, borderColor: accent, borderWidth: 0.9 });
      const row = (label, value, lx, vx, maxW, i, f = font, size = 9.5) => {
        const yy = top - 14 - i * LH;
        text(label, lx, yy, 9, font, C.gray);
        text(':', vx - 7, yy, 9, font, C.gray);
        // Shrink a long value (order numbers, long names) before cutting it short.
        const v = clean(value || '-');
        const s = Math.max(7, Math.min(size, Math.floor((size * maxW * 10) / width(v, f, size)) / 10));
        text(fit(v, maxW, f, s), vx, yy, s, f);
      };
      const p = data.patient || {};
      [
        ['Patient Name', p.name, bold, 10.5],
        ['Age / Sex', [p.age, p.gender].filter(Boolean).join(' | ')],
        p.mobile && ['Mobile No.', p.mobile],
        p.address && ['Address', p.address],
        ['Referred By', p.referredBy, bold],
      ].filter(Boolean).forEach(([label, value, f, size], i) => row(label, value, M + 8, M + 78, 162, i, f, size));
      [
        ['Report No', data.orderNo, bold],
        ['Patient ID', p.id],
        ['Registered', fmtDate(data.registeredAt)],
        ['Collected', fmtDate(data.collectedAt)],
        ['Reported', fmtDate(data.reportedAt) || (draft ? 'Pending' : '-')],
      ].forEach(([label, value, f], i) => row(label, value, M + 248, M + 306, 108, i, f));
      if (barcode) {
        // 1D barcode: full column width, bars stretched to a scannable height.
        const bx = M + 420;
        page.drawImage(barcode, { x: bx, y: top - 44, width: R - 8 - bx, height: 32 });
        center(data.orderNo, top - 55, 7.5, font, C.gray, (bx + R - 8) / 2);
      }
      y = top - boxH - 10;
    }

    function drawTableHead() {
      page.drawRectangle({ x: M, y: y - 18, width: CW, height: 18, color: tint, borderColor: accent, borderWidth: 0.8 });
      text('TEST NAME', COL.name, y - 12.5, 9, bold, dark);
      text('RESULT', COL.value, y - 12.5, 9, bold, dark);
      text('UNIT', COL.unit, y - 12.5, 9, bold, dark);
      text('REFERENCE RANGE', COL.range, y - 12.5, 9, bold, dark);
      y -= 22;
    }

    function newPage() {
      page = doc.addPage([W, H]);
      drawPatientBlock(drawLetterhead());
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

    function testTitle(t) {
      center(fit(t, CW, bold, 11.5), y - 12, 11.5, bold, C.ink);
      y -= 18;
    }
    function contd(test) {
      testTitle(`${test.name} (contd.)`);
      drawTableHead();
    }

    newPage();
    let department = null;
    for (const test of data.tests || []) {
      if (test.department && test.department !== department) {
        ensure(70 + LS * 2);
        department = test.department;
        const label = clean(department.toUpperCase());
        const lw = width(label, bold, 11);
        center(label, y - 12, 11, bold, accent);
        hline(y - 8.5, accent, 0.7, M, (W - lw) / 2 - 10);
        hline(y - 8.5, accent, 0.7, (W + lw) / 2 + 10, R);
        y -= 22;
      }
      const meta = [test.sample && `Sample: ${test.sample}`, test.method && `Method: ${test.method}`].filter(Boolean).join('      ');
      ensure((meta ? 58 : 46) + LS * 2);
      testTitle(test.name);
      if (meta) {
        center(fit(meta, CW, font, 8.5), y - 6, 8.5, font, C.gray);
        y -= 14;
      }
      drawTableHead();

      for (const r of test.rows || []) {
        if (r.header) {
          if (ensure(LS * 3)) contd(test);
          text(fit(r.name, CW - 12, bold, FS), COL.name, y - FS - 1, FS, bold, dark);
          y -= LS + 3;
          continue;
        }
        const dir = r.flag === 'H' || r.flag === 'L' ? r.flag : r.flag === 'C' ? r.dir : null;
        const color = dir === 'L' ? C.low : r.flag ? C.high : C.ink;
        const vf = r.flag ? bold : font;
        // A text result with no unit or range ("Within normal limits") may use the whole right side.
        const wide = !r.unit && !r.range;
        const valueLines = wide ? wrap(r.value, R - COL.value - 4, vf, FS) : [fit(r.value, COLW.value - (r.flag === 'C' ? 34 : 0), vf, FS)];
        const nameLines = wrap(r.name, COL.value - FS - 6 - COL.name, font, FS); // clear of the arrow
        const rangeLines = wrap(r.range, COLW.range, font, FS - 0.5);
        const h = Math.max(nameLines.length, rangeLines.length, valueLines.length, 1) * LS + 4;
        if (ensure(h)) contd(test);
        const base = y - FS - 1;
        nameLines.forEach((l, i) => text(l, COL.name, base - i * LS, FS));
        if (dir) arrow(dir, COL.value - FS - 1, base, FS, color);
        valueLines.forEach((l, i) => text(l, COL.value, base - i * LS, FS, vf, color));
        if (r.flag === 'C') text('Critical', COL.value + width(valueLines[0], vf, FS) + 4, base, FS * 0.7, bold, C.high);
        if (!wide) text(fit(r.unit, COLW.unit, font, FS - 0.5), COL.unit, base, FS - 0.5, font, C.gray);
        rangeLines.forEach((l, i) => text(l, COL.range, base - i * LS, FS - 0.5, font, C.gray));
        y -= h;
        hline(y + 2, C.line, 0.3);
      }
      y -= 10;
    }

    // End of report, then the signatures across the bottom of the last page.
    const SIG_H = 84;
    if (y - 18 < bottomLimit + SIG_H) newPage();
    center('---------------  End of Report  ---------------', y - 10, 8.5, italic, C.gray);
    const sy = bottomLimit + SIG_H; // top of the signature band
    hline(sy, C.line, 0.5);
    let sx = M;
    if (qr) {
      page.drawImage(qr, { x: M, y: sy - 72, width: 66, height: 66 });
      text('Scan to verify', M + 9, sy - 80, 7, font, C.gray);
      sx = M + 78;
    }
    if (draft) {
      text('Not verified by a pathologist. Not valid for clinical use.', sx, sy - 32, 10, bold, C.draft);
    } else {
      const people = data.signatories?.length ? data.signatories : [{ role: 'Authorised Signatory', name: '', qualification: '', regNo: '' }];
      const colW = (R - sx) / people.length;
      for (const [i, person] of people.entries()) {
        const cx = sx + colW * i + colW / 2;
        const sig = opts.printSignatures !== false ? await embed(person.image, assets) : null;
        if (sig) {
          const s = contain(sig, Math.min(120, colW - 10), 34);
          page.drawImage(sig, { x: cx - s.width / 2, y: sy - 42, ...s });
        }
        hline(sy - 46, C.ink, 0.4, cx - Math.min(64, colW / 2 - 6), cx + Math.min(64, colW / 2 - 6));
        const mid = (t, yy, size, f, color) => {
          const s = fit(t, colW - 8, f, size);
          page.drawText(s, { x: cx - width(s, f, size) / 2, y: yy, size, font: f, color });
        };
        mid(person.name || ' ', sy - 57, 10, bold, C.ink);
        if (person.qualification) mid(person.qualification, sy - 67, 8, font, C.gray);
        mid([person.role, person.regNo && `Reg. ${person.regNo}`].filter(Boolean).join('  |  '), sy - 77, 7.5, italic, C.gray);
      }
    }

    // Footer on every page of this report.
    const pages = doc.getPages().slice(firstPage);
    const printed = `Printed ${fmtDate(new Date().toISOString())}`;
    pages.forEach((pg, i) => {
      page = pg;
      hline(footerBase + 40, accent, 0.6);
      for (const [j, line] of wrap(lab.footer || DEFAULT_FOOTER, CW - 90, italic, 7, 2).entries()) {
        text(line, M, footerBase + 30 - j * 8.5, 7, italic, C.gray);
      }
      right(`Page ${i + 1} of ${pages.length}`, R, footerBase + 30, 8, bold, dark);
      right(printed, R, footerBase + 20, 6.5, font, C.gray);
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
