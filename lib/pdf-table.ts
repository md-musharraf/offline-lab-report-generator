// On-demand PDF registers (expenses, stock, outsourcing, home-collection run sheets), made on this PC with
// pdf-lib: no internet, nothing stored. Lab name header, table with page breaks, totals row, page numbers.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { db } from '@/lib/db';

export interface PdfColumn {
  header: string;
  width: number; // relative width
  align?: 'left' | 'right';
}

// The built-in PDF fonts only cover Latin-1, so ₹ becomes "Rs." and other characters are dropped.
// ponytail: names typed in Devanagari print as "?"; embed a Unicode font (fontkit + TTF) if labs need it.
const clean = (v: unknown) =>
  String(v ?? '')
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

function fit(text: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

export async function makeTablePdf(opts: {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: unknown[][];
  totals?: unknown[];
  notes?: string[]; // lines printed under the table
  lab?: { labName?: string; address?: string; mobile?: string; gstNumber?: string } | null; // default: current Settings
  landscape?: boolean;
}): Promise<Uint8Array> {
  const lab = opts.lab || (await db.query('labSettings', 'findFirst', { where: { id: 1 } }).catch(() => null));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = opts.landscape ? [842, 595] : [595, 842];
  const M = 36;
  const unit = (W - 2 * M) / opts.columns.reduce((a, c) => a + c.width, 0);
  const cols = opts.columns.map(c => ({ ...c, w: c.width * unit }));
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.38, 0.43, 0.5);
  const line = rgb(0.85, 0.88, 0.92);
  const blue = rgb(0.11, 0.31, 0.85);
  const size = 8.5;
  const rowH = 16;

  const pages: ReturnType<typeof doc.addPage>[] = [];
  let page = doc.addPage([W, H]);
  let y = 0;

  const header = (first: boolean) => {
    pages.push(page);
    y = H - M;
    page.drawText(clean(lab?.labName || 'JharLab'), { x: M, y: y - 12, size: 14, font: bold, color: blue });
    const contact = [lab?.address, lab?.mobile && `Ph: ${lab.mobile}`, lab?.gstNumber && `GSTIN: ${lab.gstNumber}`].filter(Boolean).join('  |  ');
    if (contact) page.drawText(fit(clean(contact), font, 8, W - 2 * M), { x: M, y: y - 25, size: 8, font, color: muted });
    y -= 44;
    if (first) {
      page.drawText(clean(opts.title), { x: M, y, size: 12, font: bold, color: ink });
      if (opts.subtitle) page.drawText(clean(opts.subtitle), { x: M, y: y - 13, size: 8.5, font, color: muted });
      y -= opts.subtitle ? 28 : 18;
    }
    page.drawRectangle({ x: M, y: y - rowH + 4, width: W - 2 * M, height: rowH, color: rgb(0.94, 0.95, 0.97) });
    drawRow(cols.map(c => c.header.toUpperCase()), bold, 7.5, muted);
  };

  const drawRow = (cells: unknown[], f: PDFFont, s: number, color = ink) => {
    let x = M;
    cols.forEach((c, i) => {
      const text = fit(clean(cells[i]), f, s, c.w - 8);
      const tx = c.align === 'right' ? x + c.w - 4 - f.widthOfTextAtSize(text, s) : x + 4;
      page.drawText(text, { x: tx, y: y - rowH + 9, size: s, font: f, color });
      x += c.w;
    });
    y -= rowH;
  };

  header(true);
  if (!opts.rows.length) {
    page.drawText('No records for this selection.', { x: M + 4, y: y - 12, size, font, color: muted });
    y -= rowH;
  }
  for (const row of opts.rows) {
    if (y < M + 40) {
      page = doc.addPage([W, H]);
      header(false);
    }
    drawRow(row, font, size);
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.4, color: line });
  }
  if (opts.totals) {
    if (y < M + 40) {
      page = doc.addPage([W, H]);
      header(false);
    }
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 1, color: ink });
    drawRow(opts.totals, bold, size);
  }
  for (const note of opts.notes || []) {
    if (y < M + 40) {
      page = doc.addPage([W, H]);
      header(false);
    }
    y -= 4;
    page.drawText(fit(clean(note), font, 8.5, W - 2 * M), { x: M + 4, y: y - 10, size: 8.5, font, color: muted });
    y -= 12;
  }

  const stamp = `Generated ${new Date().toLocaleString('en-IN')} by JharLab`;
  pages.forEach((p, i) => {
    p.drawText(clean(stamp), { x: M, y: 20, size: 7, font, color: muted });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: W - M - font.widthOfTextAtSize(n, 7), y: 20, size: 7, font, color: muted });
  });
  return doc.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const rupees = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
