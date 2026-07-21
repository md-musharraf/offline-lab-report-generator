// lib/report-pdf.ts
// PDF Report Generator for Lab Reports using pdf-lib
// Design: Modern diagnostic centre format with colored status indicators

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFImage } from 'pdf-lib';

export interface ReportData {
  orderNo: string;
  patientName: string;
  patientId: string;
  age: string;
  gender: string;
  date: string;
  referredBy: string;
  tests: TestReportData[];
  labName: string;
  labAddress: string;
  labMobile: string;
  approvedBy: string;
  labEmail?: string;
  labWebsite?: string;
  gstNumber?: string;
  registrationNo?: string;
  logo?: string;
  doctorQualification?: string;
  doctorName?: string;
  doctorRegNo?: string;
  printShowLogo?: boolean;
  doctorSignatureEnabled?: boolean;
  coSigningEnabled?: boolean;
  technicianName?: string;
  technicianQualification?: string;
  technicianRegNo?: string;
  pathologyDoctorName?: string;
  pathologyDoctorQualification?: string;
  pathologyDoctorRegNo?: string;
  doctorSignatureImage?: string;
  technicianSignatureImage?: string;
  pathologyDoctorSignatureImage?: string;
  sampleCollected?: string;
  reportDate?: string;
  printShowQR?: boolean;
}

export interface TestReportData {
  testName: string;
  parameters: ParameterResult[];
}

export interface ParameterResult {
  name: string;
  value: string;
  unit: string;
  refRange: string;
  flag: string | null;
  isHeader?: boolean;
}

// ── Premium Color Palette ──
const C = {
  navy:       rgb(0.07, 0.18, 0.35),
  navyLight:  rgb(0.10, 0.24, 0.44),
  teal:       rgb(0.00, 0.55, 0.53),
  tealLight:  rgb(0.00, 0.65, 0.62),
  tealBg:     rgb(0.90, 0.97, 0.97),
  green:      rgb(0.13, 0.64, 0.30),
  greenDot:   rgb(0.18, 0.72, 0.35),
  red:        rgb(0.82, 0.15, 0.15),
  redDot:     rgb(0.90, 0.20, 0.20),
  orange:     rgb(0.88, 0.52, 0.02),
  orangeDot:  rgb(0.95, 0.58, 0.08),
  text:       rgb(0.12, 0.12, 0.15),
  textMed:    rgb(0.35, 0.35, 0.40),
  gray:       rgb(0.50, 0.50, 0.55),
  lightGray:  rgb(0.88, 0.88, 0.90),
  bgLight:    rgb(0.96, 0.97, 0.98),
  white:      rgb(1, 1, 1),
  rowEven:    rgb(0.98, 0.98, 0.99),
  rowOdd:     rgb(1, 1, 1),
};

// ── Helper: draw a horizontal line ──
function drawLine(page: PDFPage, x1: number, y: number, x2: number, color = C.lightGray, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

// ── Helper: draw a filled rectangle ──
function drawBox(page: PDFPage, x: number, y: number, w: number, h: number, color: any, borderColor?: any) {
  page.drawRectangle({ x, y, width: w, height: h, color, borderColor, borderWidth: borderColor ? 0.6 : 0 });
}

// ── Helper: draw a small circle (status dot) ──
function drawDot(page: PDFPage, cx: number, cy: number, r: number, color: any) {
  page.drawCircle({ x: cx, y: cy, size: r, color });
}

// ── KEY HELPER: Fit text within a pixel-width limit ──
// Measures actual rendered width and truncates with '..' if needed
function fitText(text: string, maxWidthPx: number, fnt: PDFFont, size: number): string {
  if (!text) return '';
  const w = fnt.widthOfTextAtSize(text, size);
  if (w <= maxWidthPx) return text;
  // Progressively shorten until it fits
  for (let len = text.length - 1; len > 0; len--) {
    const t = text.substring(0, len) + '..';
    if (fnt.widthOfTextAtSize(t, size) <= maxWidthPx) {
      return t;
    }
  }
  return '..';
}

// ── Helper: draw text that is guaranteed to fit within [x, x+maxWidth] ──
function drawFittedText(
  page: PDFPage, text: string, x: number, y: number,
  maxWidth: number, size: number, fnt: PDFFont, color: any
) {
  const fitted = fitText(text || '', maxWidth, fnt, size);
  page.drawText(fitted, { x, y, size, font: fnt, color });
}

export async function generateReportPDF(data: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN = 36;
  const CONTENT_W = PAGE_W - MARGIN * 2; // 523.28
  const RIGHT_EDGE = PAGE_W - MARGIN;     // 559.28

  // ── Embed Logo ──
  const embedImageHelper = async (base64DataStr: string | undefined) => {
    if (!base64DataStr) return undefined;
    try {
      const base64Str = base64DataStr.split(';base64,').pop() || '';
      const imageBytes = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
      if (base64DataStr.includes('image/png')) {
        return await doc.embedPng(imageBytes);
      } else {
        return await doc.embedJpg(imageBytes);
      }
    } catch (e) {
      console.error('Failed to embed image:', e);
      return undefined;
    }
  };

  const logoImage = data.printShowLogo ? await embedImageHelper(data.logo) : undefined;

  const isApproved = data.approvedBy !== 'Draft Report (Pending Approval)';
  const showSignatures = isApproved && data.doctorSignatureEnabled !== false;

  const techSigImage = showSignatures ? await embedImageHelper(data.technicianSignatureImage) : undefined;
  const docSigImage = showSignatures ? await embedImageHelper(data.doctorSignatureImage) : undefined;
  const pathSigImage = showSignatures ? await embedImageHelper(data.pathologyDoctorSignatureImage) : undefined;

  // Generate and embed QR Code image. Use Electron IPC in Electron, fallback to local API route.
  let qrImage: PDFImage | undefined = undefined;
  if (data.printShowQR !== false) {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.generateQrCode) {
        const qrPngBuffer = await (window as any).electronAPI.generateQrCode(data);
        qrImage = await doc.embedPng(qrPngBuffer);
      } else {
        const qrResponse = await fetch('/api/reports/qrcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (qrResponse.ok) {
          const qrBytes = new Uint8Array(await qrResponse.arrayBuffer());
          qrImage = await doc.embedPng(qrBytes);
        }
      }
    } catch (e) {
      console.error('Failed to retrieve QR code image:', e);
    }
  }


  const drawHeaderAndPatientInfo = (page: PDFPage) => {
    // =====================================================
    //  SECTION 1: HEADER — Dark navy with lab name
    // =====================================================
    const HEADER_H = 95;
    drawBox(page, 0, PAGE_H - HEADER_H, PAGE_W, HEADER_H, C.navy);

    // Logo on left
    let headerTextX = MARGIN + 8;
    if (logoImage) {
      const logoSize = 48;
      drawBox(page, MARGIN, PAGE_H - HEADER_H + 19, logoSize + 8, logoSize + 8, C.white);
      page.drawImage(logoImage, {
        x: MARGIN + 4,
        y: PAGE_H - HEADER_H + 23,
        width: logoSize,
        height: logoSize
      });
      headerTextX = MARGIN + logoSize + 20;
    }

    // QR Code on right
    const qrSize = 75;
    if (qrImage) {
      // Draw white background box for QR Code (centered vertically in 95px header)
      drawBox(page, RIGHT_EDGE - qrSize - 2, PAGE_H - HEADER_H + 8, qrSize + 4, qrSize + 4, C.white);
      page.drawImage(qrImage, {
        x: RIGHT_EDGE - qrSize,
        y: PAGE_H - HEADER_H + 10,
        width: qrSize,
        height: qrSize
      });
    }

    // Right side info width reservation (for Reg/GST)
    const rightInfoW = 160;
    const textRightLimit = qrImage ? (RIGHT_EDGE - qrSize - 12) : RIGHT_EDGE;
    const headerMaxTextW = textRightLimit - headerTextX - 10;

    // Lab name — large bold white (fitted to available space)
    const labNameDisplay = data.labName.toUpperCase();
    drawFittedText(page, labNameDisplay, headerTextX, PAGE_H - 40, headerMaxTextW, 17, fontBold, C.white);

    // Subtitle line — teal accent
    drawFittedText(page, 'Advanced Pathology Services', headerTextX, PAGE_H - 57, headerMaxTextW, 9, fontItalic, C.tealLight);

    // Registration / NABL on right side of header (right-aligned, fitted)
    if (data.registrationNo) {
      const regText = `Reg: ${data.registrationNo}`;
      const fitted = fitText(regText, rightInfoW, font, 7);
      const regW = font.widthOfTextAtSize(fitted, 7);
      page.drawText(fitted, { x: textRightLimit - regW, y: PAGE_H - 34, size: 7, font, color: rgb(0.75, 0.80, 0.88) });
    }
    if (data.gstNumber) {
      const gstText = `GSTIN: ${data.gstNumber}`;
      const fitted = fitText(gstText, rightInfoW, font, 7);
      const gstW = font.widthOfTextAtSize(fitted, 7);
      page.drawText(fitted, { x: textRightLimit - gstW, y: PAGE_H - 47, size: 7, font, color: rgb(0.75, 0.80, 0.88) });
    }

    // =====================================================
    //  SECTION 2: CONTACT INFO BAR
    // =====================================================
    const CONTACT_BAR_H = 18;
    drawBox(page, 0, PAGE_H - HEADER_H - CONTACT_BAR_H, PAGE_W, CONTACT_BAR_H, C.teal);

    const contactItems: string[] = [];
    if (data.labAddress) contactItems.push(data.labAddress);
    if (data.labMobile) contactItems.push(data.labMobile);
    if (data.labEmail) contactItems.push(data.labEmail);

    const contactStr = contactItems.join('   |   ');
    const maxContactW = PAGE_W - 20; // 10px padding each side
    const contactFitted = fitText(contactStr, maxContactW, font, 7.5);
    const contactW = font.widthOfTextAtSize(contactFitted, 7.5);
    page.drawText(contactFitted, {
      x: (PAGE_W - contactW) / 2,
      y: PAGE_H - HEADER_H - CONTACT_BAR_H + 5.5,
      size: 7.5,
      font,
      color: C.white
    });

    const localY = PAGE_H - HEADER_H - CONTACT_BAR_H - 12;

    // =====================================================
    //  SECTION 3: PATIENT DETAILS + REPORT SUMMARY
    // =====================================================
    const PATIENT_BOX_H = 92;
    const SUMMARY_W = 195;
    const PATIENT_W = CONTENT_W - SUMMARY_W - 12; // ~316px

    // Patient Details Box (left)
    drawBox(page, MARGIN, localY - PATIENT_BOX_H, PATIENT_W, PATIENT_BOX_H, C.bgLight, C.lightGray);

    // "PATIENT DETAILS" title
    const pdTitleY = localY - 13;
    page.drawText('PATIENT DETAILS', { x: MARGIN + 10, y: pdTitleY, size: 8.5, font: fontBold, color: C.navy });
    drawLine(page, MARGIN + 10, pdTitleY - 5, MARGIN + PATIENT_W - 10, C.lightGray, 0.4);

    // Patient info rows — pixel-fitted
    const infoStartY = pdTitleY - 18;
    const labelX = MARGIN + 12;
    const valueX = MARGIN + 100;
    const lineSpacing = 14;
    const patientValueMaxW = PATIENT_W - (valueX - MARGIN) - 10; // available px for value text

    const drawPatientRow = (label: string, value: string, rowY: number) => {
      page.drawText(label, { x: labelX, y: rowY, size: 7.5, font: fontBold, color: C.textMed });
      drawFittedText(page, ':  ' + value, valueX, rowY, patientValueMaxW, 8, font, C.text);
    };

    drawPatientRow('Patient Name', data.patientName, infoStartY);
    drawPatientRow('Patient ID', data.patientId, infoStartY - lineSpacing);
    drawPatientRow('Age / Gender', `${data.age} / ${data.gender}`, infoStartY - lineSpacing * 2);
    drawPatientRow('Ref. Doctor', data.referredBy, infoStartY - lineSpacing * 3);

    // Report Summary Box (right)
    const summaryX = MARGIN + PATIENT_W + 12;
    // Header bar for summary
    drawBox(page, summaryX, localY - 18, SUMMARY_W, 18, C.navy);
    page.drawText('REPORT SUMMARY', { x: summaryX + 8, y: localY - 14, size: 8, font: fontBold, color: C.white });
    // Body
    drawBox(page, summaryX, localY - PATIENT_BOX_H, SUMMARY_W, PATIENT_BOX_H - 18, C.bgLight, C.lightGray);

    const sumLabelX = summaryX + 8;
    const sumValueX = summaryX + 90;
    const sumStartY = localY - 32;
    const sumValueMaxW = SUMMARY_W - (sumValueX - summaryX) - 8; // available px for value

    const drawSumRow = (label: string, value: string, rowY: number) => {
      page.drawText(label, { x: sumLabelX, y: rowY, size: 7, font, color: C.textMed });
      drawFittedText(page, ':  ' + value, sumValueX, rowY, sumValueMaxW, 7.5, fontBold, C.text);
    };

    drawSumRow('Report No.', data.orderNo, sumStartY);
    const sampleCollected = data.sampleCollected || data.date;
    drawSumRow('Sample Collected', sampleCollected, sumStartY - 13);
    const reportDate = data.reportDate || new Date().toLocaleDateString('en-GB');
    drawSumRow('Report Date', reportDate, sumStartY - 26);

    // Barcode-like visual for order number
    const barcodeY = sumStartY - 44;
    const barcodeStartX = sumLabelX;
    const barcodeMaxX = summaryX + SUMMARY_W - 15;
    const barcodeWidths = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1, 1];
    let bx = barcodeStartX;
    for (let i = 0; i < barcodeWidths.length && bx < barcodeMaxX; i++) {
      if (i % 2 === 0) {
        drawBox(page, bx, barcodeY, barcodeWidths[i], 12, C.navy);
      }
      bx += barcodeWidths[i] + 0.5;
    }
    // Order number under barcode
    drawFittedText(page, data.orderNo, barcodeStartX, barcodeY - 9, barcodeMaxX - barcodeStartX, 6.5, font, C.textMed);
  };

  let page = doc.addPage([PAGE_W, PAGE_H]);
  drawHeaderAndPatientInfo(page);
  let y = PAGE_H - 229;

  // =====================================================
  //  SECTION 4: TEST RESULTS
  // =====================================================
  // Column positions and their available widths
  const COL_PARAM    = MARGIN + 10;
  const COL_RESULT   = MARGIN + 215;
  const COL_UNIT     = MARGIN + 300;
  const COL_REF      = MARGIN + 370;
  const COL_STATUS   = MARGIN + 460;

  // Available pixel widths per column (gap = next column start - this column start - small padding)
  const W_PARAM    = COL_RESULT - COL_PARAM - 8;    // ~197px
  const W_RESULT   = COL_UNIT   - COL_RESULT - 8;   // ~77px
  const W_UNIT     = COL_REF    - COL_UNIT - 8;      // ~62px
  const W_REF      = COL_STATUS - COL_REF - 8;       // ~82px
  const W_STATUS   = RIGHT_EDGE - COL_STATUS - 4;    // ~95px

  for (const test of data.tests) {
    // Check if we need a new page
    if (y < 160) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      drawHeaderAndPatientInfo(page);
      y = PAGE_H - 229;
    }

    // ── Test Name Header Bar ──
    drawBox(page, MARGIN, y - 22, CONTENT_W, 22, C.navy);
    const testTitle = `TEST : ${test.testName.toUpperCase()}`;
    drawFittedText(page, testTitle, MARGIN + 10, y - 16, CONTENT_W - 20, 9, fontBold, C.white);
    y -= 28;

    // ── Column Headers Row ──
    drawBox(page, MARGIN, y - 18, CONTENT_W, 18, C.bgLight);
    page.drawText('Parameter',       { x: COL_PARAM,  y: y - 13, size: 7.5, font: fontBold, color: C.navy });
    page.drawText('Result',          { x: COL_RESULT, y: y - 13, size: 7.5, font: fontBold, color: C.navy });
    page.drawText('Unit',            { x: COL_UNIT,   y: y - 13, size: 7.5, font: fontBold, color: C.navy });
    page.drawText('Reference Range', { x: COL_REF,    y: y - 13, size: 7.5, font: fontBold, color: C.navy });
    page.drawText('Status',          { x: COL_STATUS,  y: y - 13, size: 7.5, font: fontBold, color: C.navy });
    drawLine(page, MARGIN, y - 18, RIGHT_EDGE, C.navy, 0.6);
    y -= 22;

    // ── Parameter Rows ──
    let rowIndex = 0;
    for (const param of test.parameters) {
      if (y < 85) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        drawHeaderAndPatientInfo(page);
        y = PAGE_H - 229;

        // Draw continued Test Name Header Bar
        drawBox(page, MARGIN, y - 22, CONTENT_W, 22, C.navy);
        const testTitle = `TEST : ${test.testName.toUpperCase()} (Continued)`;
        drawFittedText(page, testTitle, MARGIN + 10, y - 16, CONTENT_W - 20, 9, fontBold, C.white);
        y -= 28;

        // Draw Column Headers Row
        drawBox(page, MARGIN, y - 18, CONTENT_W, 18, C.bgLight);
        page.drawText('Parameter',       { x: COL_PARAM,  y: y - 13, size: 7.5, font: fontBold, color: C.navy });
        page.drawText('Result',          { x: COL_RESULT, y: y - 13, size: 7.5, font: fontBold, color: C.navy });
        page.drawText('Unit',            { x: COL_UNIT,   y: y - 13, size: 7.5, font: fontBold, color: C.navy });
        page.drawText('Reference Range', { x: COL_REF,    y: y - 13, size: 7.5, font: fontBold, color: C.navy });
        page.drawText('Status',          { x: COL_STATUS,  y: y - 13, size: 7.5, font: fontBold, color: C.navy });
        drawLine(page, MARGIN, y - 18, RIGHT_EDGE, C.navy, 0.6);
        y -= 22;
      }

      const ROW_H = 18;

      if (param.isHeader) {
        // Section header row
        drawBox(page, MARGIN, y - ROW_H, CONTENT_W, ROW_H, C.tealBg);
        drawFittedText(page, param.name, COL_PARAM, y - 13, CONTENT_W - 20, 8, fontBold, C.navy);
        y -= ROW_H + 1;
        continue;
      }

      // Alternating row background
      const rowBg = rowIndex % 2 === 0 ? C.rowOdd : C.rowEven;
      drawBox(page, MARGIN, y - ROW_H, CONTENT_W, ROW_H, rowBg);

      // Parameter name — fitted to column width
      drawFittedText(page, param.name, COL_PARAM, y - 13, W_PARAM, 8, font, C.text);

      // Determine status
      const isAbnormal = !!param.flag;
      const isLow = param.flag === '↓' || param.flag === 'L';
      const isHigh = param.flag === '↑' || param.flag === 'H';
      const isCritical = param.flag === '!!';

      // Result value — fitted to column width
      const resultColor = isCritical ? C.red : isHigh ? C.red : isLow ? C.orange : C.text;
      const resultFont = isAbnormal ? fontBold : font;
      drawFittedText(page, param.value, COL_RESULT, y - 13, W_RESULT, 8.5, resultFont, resultColor);

      // Unit — fitted to column width
      drawFittedText(page, param.unit || '', COL_UNIT, y - 13, W_UNIT, 7.5, font, C.gray);

      // Reference Range — fitted to column width
      drawFittedText(page, param.refRange || '', COL_REF, y - 13, W_REF, 7.5, font, C.gray);

      // ── Status Column with colored dot + text — fitted ──
      if (param.value) {
        const dotX = COL_STATUS + 4;
        const dotY = y - 9;
        const textX = COL_STATUS + 12;
        const statusMaxW = W_STATUS - 16;

        if (isCritical) {
          drawDot(page, dotX, dotY, 3.5, C.redDot);
          drawFittedText(page, 'Critical', textX, y - 12, statusMaxW, 6.5, fontBold, C.red);
        } else if (isHigh) {
          drawDot(page, dotX, dotY, 3.5, C.redDot);
          drawFittedText(page, 'High', textX, y - 12, statusMaxW, 6.5, fontBold, C.red);
        } else if (isLow) {
          drawDot(page, dotX, dotY, 3.5, C.orangeDot);
          drawFittedText(page, 'Low', textX, y - 12, statusMaxW, 6.5, fontBold, C.orange);
        } else {
          drawDot(page, dotX, dotY, 3.5, C.greenDot);
          drawFittedText(page, 'Normal', textX, y - 12, statusMaxW, 6.5, font, C.green);
        }
      }

      // Bottom border for row
      drawLine(page, MARGIN + 5, y - ROW_H, RIGHT_EDGE - 5, C.lightGray, 0.3);

      y -= ROW_H;
      rowIndex++;
    }

    y -= 8;
  }

  // =====================================================
  //  SECTION 5: OBSERVATION & CLINICAL COMMENT BOXES
  // =====================================================
  if (y < 200) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    drawHeaderAndPatientInfo(page);
    y = PAGE_H - 229;
  }

  y -= 4;
  const OBS_BOX_H = 40;
  const OBS_BOX_W = (CONTENT_W - 12) / 2; // ~255px each
  const obsTextMaxW = OBS_BOX_W - 20; // 10px padding each side

  // Observation Box (left)
  drawBox(page, MARGIN, y - OBS_BOX_H, OBS_BOX_W, OBS_BOX_H, C.tealBg, C.teal);
  drawBox(page, MARGIN, y - 14, 4, 14, C.teal);
  page.drawText('OBSERVATION', { x: MARGIN + 10, y: y - 12, size: 7.5, font: fontBold, color: C.teal });

  const allNormal = data.tests.every(t => t.parameters.every(p => !p.flag || p.isHeader));
  const obsText = allNormal
    ? 'All parameters are within normal reference range.'
    : 'Some parameters are outside normal range.';
  drawFittedText(page, obsText, MARGIN + 10, y - 28, obsTextMaxW, 7, font, C.textMed);

  // Clinical Comment Box (right)
  const clinX = MARGIN + OBS_BOX_W + 12;
  drawBox(page, clinX, y - OBS_BOX_H, OBS_BOX_W, OBS_BOX_H, C.bgLight, C.lightGray);
  drawBox(page, clinX, y - 14, 4, 14, C.navy);
  page.drawText('CLINICAL COMMENT', { x: clinX + 10, y: y - 12, size: 7.5, font: fontBold, color: C.navy });

  const clinText = allNormal
    ? 'No significant abnormality detected.'
    : 'Abnormal values detected. Further evaluation needed.';
  drawFittedText(page, clinText, clinX + 10, y - 28, obsTextMaxW, 7, font, C.textMed);

  y -= OBS_BOX_H + 8;

  // =====================================================
  //  SECTION 6: SIGNATURES — Technician (left) + Doctor (right)
  // =====================================================
  const sigBlockH = showSignatures ? 60 : 25;
  const BOTTOM_BAR_H = 24;
  const FOOTER_NOTE_H = 18;
  const totalFooterH = sigBlockH + BOTTOM_BAR_H + FOOTER_NOTE_H + 12;

  if (y < totalFooterH + 10) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    drawHeaderAndPatientInfo(page);
    y = PAGE_H - 229;
  }

  const sigSectionY = BOTTOM_BAR_H + FOOTER_NOTE_H + sigBlockH + 8;

  drawLine(page, MARGIN, sigSectionY + 5, RIGHT_EDGE, C.lightGray, 0.5);

  if (showSignatures) {
    const nameY = sigSectionY - sigBlockH + 22;

    // Column width for signature blocks
    const sigColW = data.coSigningEnabled ? (CONTENT_W / 3 - 10) : (CONTENT_W / 2 - 10);

    // 1. Lab Technician (Left)
    const techName = data.technicianName || 'Medical Lab Technician';
    const techQual = data.technicianQualification || 'DMLT, BMLT';
    const techReg = data.technicianRegNo || '';

    page.drawText('Lab Technician', { x: MARGIN, y: nameY + 30, size: 6.5, font, color: C.gray });
    if (techSigImage) {
      try {
        page.drawImage(techSigImage, {
          x: MARGIN,
          y: nameY + 18,
          width: 65,
          height: 20
        });
      } catch (err) {
        console.error('Failed to draw technician signature:', err);
      }
    }
    drawFittedText(page, techName, MARGIN, nameY + 12, sigColW, 9, fontBold, C.text);
    drawFittedText(page, techQual, MARGIN, nameY + 2, sigColW, 7, font, C.textMed);
    if (techReg) {
      drawFittedText(page, `Reg No: ${techReg}`, MARGIN, nameY - 7, sigColW, 6.5, font, C.gray);
    }

    if (data.coSigningEnabled) {
      // 3-Column Layout
      const docName = data.doctorName || data.approvedBy;
      const docQual = data.doctorQualification || 'MD (Pathologist)';
      const docReg = data.doctorRegNo || '';
      const midX = MARGIN + CONTENT_W / 3 + 10;

      page.drawText('Pathologist', { x: midX, y: nameY + 30, size: 6.5, font, color: C.gray });
      if (docSigImage) {
        try {
          page.drawImage(docSigImage, {
            x: midX,
            y: nameY + 18,
            width: 65,
            height: 20
          });
        } catch (err) {
          console.error('Failed to draw doctor signature:', err);
        }
      }
      drawFittedText(page, docName, midX, nameY + 12, sigColW, 9, fontBold, C.text);
      drawFittedText(page, docQual, midX, nameY + 2, sigColW, 7, font, C.textMed);
      if (docReg) {
        drawFittedText(page, `Reg No: ${docReg}`, midX, nameY - 7, sigColW, 6.5, font, C.gray);
      }

      const pathName = data.pathologyDoctorName || 'Dr. Vimal Shah';
      const pathQual = data.pathologyDoctorQualification || 'MD (Pathologist)';
      const pathReg = data.pathologyDoctorRegNo || '';
      const rightX = MARGIN + (CONTENT_W / 3) * 2 + 10;

      page.drawText('Sr. Pathologist', { x: rightX, y: nameY + 30, size: 6.5, font, color: C.gray });
      if (pathSigImage) {
        try {
          page.drawImage(pathSigImage, {
            x: rightX,
            y: nameY + 18,
            width: 65,
            height: 20
          });
        } catch (err) {
          console.error('Failed to draw pathology doctor signature:', err);
        }
      }
      drawFittedText(page, pathName, rightX, nameY + 12, sigColW, 9, fontBold, C.text);
      drawFittedText(page, pathQual, rightX, nameY + 2, sigColW, 7, font, C.textMed);
      if (pathReg) {
        drawFittedText(page, `Reg No: ${pathReg}`, rightX, nameY - 7, sigColW, 6.5, font, C.gray);
      }
    } else {
      // 2-Column Layout: Technician (left) + Doctor (right)
      const docName = data.doctorName || data.approvedBy;
      const docQual = data.doctorQualification || 'MD (Pathologist)';
      const docReg = data.doctorRegNo || '';
      const rightX = RIGHT_EDGE - sigColW;

      page.drawText('Consultant Pathologist', { x: rightX, y: nameY + 30, size: 6.5, font, color: C.gray });
      if (docSigImage) {
        try {
          page.drawImage(docSigImage, {
            x: rightX,
            y: nameY + 18,
            width: 65,
            height: 20
          });
        } catch (err) {
          console.error('Failed to draw doctor signature:', err);
        }
      }
      drawFittedText(page, docName, rightX, nameY + 12, sigColW, 9, fontBold, C.text);
      drawFittedText(page, docQual, rightX, nameY + 2, sigColW, 7, font, C.textMed);
      if (docReg) {
        drawFittedText(page, `Reg No: ${docReg}`, rightX, nameY - 7, sigColW, 6.5, font, C.gray);
      }
    }
  } else {
    page.drawText('Draft Report — Pending Approval', {
      x: MARGIN,
      y: sigSectionY - 15,
      size: 10,
      font: fontItalic,
      color: C.red
    });
  }

  // Draw footer elements on ALL pages
  const totalPages = doc.getPageCount();
  const pagesList = doc.getPages();
  pagesList.forEach((p, index) => {
    // 1. Draw Bottom Bar
    drawBox(p, 0, 0, PAGE_W, BOTTOM_BAR_H, C.navy);

    // Contact info on left
    const bottomContactParts: string[] = [];
    if (data.labMobile) bottomContactParts.push(`Ph: ${data.labMobile}`);
    if (data.labEmail) bottomContactParts.push(`Email: ${data.labEmail}`);
    if (data.labWebsite) bottomContactParts.push(data.labWebsite);
    const bottomContactStr = bottomContactParts.join('  |  ');
    const bottomContactMaxW = PAGE_W * 0.55;
    drawFittedText(p, bottomContactStr, MARGIN, 9, bottomContactMaxW, 6.5, font, rgb(0.70, 0.75, 0.82));

    // Thank you message on right
    const thankText = 'Thank you for trusting us with your health';
    const thankMaxW = PAGE_W * 0.38;
    const thankFitted = fitText(thankText, thankMaxW - 16, fontBold, 7.5);
    const thankFittedW = fontBold.widthOfTextAtSize(thankFitted, 7.5);
    const thankBoxW = thankFittedW + 20;
    drawBox(p, RIGHT_EDGE - thankBoxW, 3, thankBoxW, 18, C.teal);
    p.drawText(thankFitted, {
      x: RIGHT_EDGE - thankBoxW + 10,
      y: 9,
      size: 7.5,
      font: fontBold,
      color: C.white
    });

    // 2. Draw Footer Note
    const footerNoteY = BOTTOM_BAR_H + FOOTER_NOTE_H + 2; // 24 + 18 + 2 = 44
    drawLine(p, MARGIN, footerNoteY, RIGHT_EDGE, C.lightGray, 0.3);
    const footerMaxW = CONTENT_W - 80; // reserve space for page number
    drawFittedText(p, 'This is a computer-generated report. Kindly correlate clinically. Re-testing may be advised if clinically required.',
      MARGIN, footerNoteY - 10, footerMaxW, 6, fontItalic, C.gray);
    drawFittedText(p, `Report generated on: ${new Date().toLocaleString('en-IN')}`,
      MARGIN, footerNoteY - 18, footerMaxW, 6, font, C.gray);

    // 3. Draw Page Number on the right side of the footer note area
    const pageNumText = `Page ${index + 1} of ${totalPages}`;
    const pageNumW = font.widthOfTextAtSize(pageNumText, 7);
    p.drawText(pageNumText, {
      x: RIGHT_EDGE - pageNumW,
      y: footerNoteY - 12,
      size: 7,
      font: fontBold,
      color: C.navy
    });
  });

  return await doc.save();
}

// Build mock report data for demo
export function getMockReportData(report: any): ReportData {
  const testMap: Record<string, TestReportData> = {
    'CBC': {
      testName: 'Complete Blood Count (CBC)',
      parameters: [
        { name: 'COMPLETE BLOOD COUNT', value: '', unit: '', refRange: '', flag: null, isHeader: true },
        { name: 'Hemoglobin (Hb)', value: '14.2', unit: 'g/dL', refRange: '13.0 - 17.0', flag: null },
        { name: 'Total RBC Count', value: '5.1', unit: 'mill/cumm', refRange: '4.5 - 5.5', flag: null },
        { name: 'PCV / Hematocrit', value: '42', unit: '%', refRange: '40 - 50', flag: null },
        { name: 'MCV', value: '82.4', unit: 'fL', refRange: '83 - 101', flag: '↓' },
        { name: 'MCH', value: '27.8', unit: 'pg', refRange: '27 - 32', flag: null },
        { name: 'MCHC', value: '33.8', unit: 'g/dL', refRange: '31.5 - 34.5', flag: null },
        { name: 'Total WBC Count', value: '7800', unit: '/cumm', refRange: '4000 - 10000', flag: null },
        { name: 'DIFFERENTIAL COUNT', value: '', unit: '', refRange: '', flag: null, isHeader: true },
        { name: 'Neutrophils', value: '62', unit: '%', refRange: '40 - 70', flag: null },
        { name: 'Lymphocytes', value: '30', unit: '%', refRange: '20 - 40', flag: null },
        { name: 'Monocytes', value: '5', unit: '%', refRange: '2 - 8', flag: null },
        { name: 'Eosinophils', value: '2', unit: '%', refRange: '1 - 4', flag: null },
        { name: 'Basophils', value: '1', unit: '%', refRange: '0 - 1', flag: null },
        { name: 'Platelet Count', value: '2.8', unit: 'lakhs/cumm', refRange: '1.5 - 4.0', flag: null },
        { name: 'ESR', value: '12', unit: 'mm/hr', refRange: '0 - 15', flag: null },
      ],
    },
    'LFT': {
      testName: 'Liver Function Test (LFT)',
      parameters: [
        { name: 'Total Bilirubin', value: '0.9', unit: 'mg/dL', refRange: '0.1 - 1.2', flag: null },
        { name: 'Direct Bilirubin', value: '0.2', unit: 'mg/dL', refRange: '0.0 - 0.3', flag: null },
        { name: 'Indirect Bilirubin', value: '0.7', unit: 'mg/dL', refRange: '0.1 - 1.0', flag: null },
        { name: 'SGOT (AST)', value: '68', unit: 'U/L', refRange: '5 - 40', flag: '↑' },
        { name: 'SGPT (ALT)', value: '72', unit: 'U/L', refRange: '7 - 56', flag: '↑' },
        { name: 'Alkaline Phosphatase', value: '85', unit: 'U/L', refRange: '44 - 147', flag: null },
        { name: 'Total Protein', value: '7.2', unit: 'g/dL', refRange: '6.0 - 8.3', flag: null },
        { name: 'Albumin', value: '4.1', unit: 'g/dL', refRange: '3.5 - 5.5', flag: null },
        { name: 'Globulin', value: '3.1', unit: 'g/dL', refRange: '2.0 - 3.5', flag: null },
        { name: 'A/G Ratio', value: '1.3', unit: '', refRange: '1.1 - 2.5', flag: null },
      ],
    },
    'Thyroid Profile': {
      testName: 'Thyroid Function Test',
      parameters: [
        { name: 'T3 (Triiodothyronine)', value: '1.2', unit: 'ng/mL', refRange: '0.8 - 2.0', flag: null },
        { name: 'T4 (Thyroxine)', value: '8.5', unit: 'µg/dL', refRange: '5.1 - 14.1', flag: null },
        { name: 'TSH', value: '6.8', unit: 'µIU/mL', refRange: '0.27 - 4.2', flag: '↑' },
      ],
    },
    'RFT': {
      testName: 'Renal Function Test (RFT)',
      parameters: [
        { name: 'Blood Urea', value: '32', unit: 'mg/dL', refRange: '15 - 40', flag: null },
        { name: 'Serum Creatinine', value: '0.9', unit: 'mg/dL', refRange: '0.7 - 1.3', flag: null },
        { name: 'Uric Acid', value: '5.8', unit: 'mg/dL', refRange: '3.4 - 7.0', flag: null },
        { name: 'BUN', value: '14.9', unit: 'mg/dL', refRange: '6 - 20', flag: null },
        { name: 'Sodium (Na+)', value: '140', unit: 'mEq/L', refRange: '136 - 145', flag: null },
        { name: 'Potassium (K+)', value: '4.2', unit: 'mEq/L', refRange: '3.5 - 5.1', flag: null },
        { name: 'Chloride (Cl-)', value: '102', unit: 'mEq/L', refRange: '98 - 106', flag: null },
      ],
    },
    'Lipid Profile': {
      testName: 'Lipid Profile',
      parameters: [
        { name: 'Total Cholesterol', value: '245', unit: 'mg/dL', refRange: '< 200', flag: '↑' },
        { name: 'Triglycerides', value: '180', unit: 'mg/dL', refRange: '< 150', flag: '↑' },
        { name: 'HDL Cholesterol', value: '42', unit: 'mg/dL', refRange: '> 40', flag: null },
        { name: 'LDL Cholesterol', value: '167', unit: 'mg/dL', refRange: '< 100', flag: '↑' },
        { name: 'VLDL Cholesterol', value: '36', unit: 'mg/dL', refRange: '< 30', flag: '↑' },
        { name: 'Total/HDL Ratio', value: '5.8', unit: '', refRange: '< 5.0', flag: '↑' },
      ],
    },
    'Blood Sugar': {
      testName: 'Blood Sugar',
      parameters: [
        { name: 'Blood Sugar (Fasting)', value: '128', unit: 'mg/dL', refRange: '70 - 100', flag: '↑' },
        { name: 'Blood Sugar (PP)', value: '185', unit: 'mg/dL', refRange: '< 140', flag: '↑' },
      ],
    },
    'HbA1c': {
      testName: 'HbA1c (Glycated Hemoglobin)',
      parameters: [
        { name: 'HbA1c', value: '7.2', unit: '%', refRange: '< 5.7 (Normal)', flag: '↑' },
        { name: 'Estimated Avg Glucose', value: '160', unit: 'mg/dL', refRange: '< 117', flag: '↑' },
      ],
    },
  };

  const patientAges: Record<string, string> = {
    'LAB-2024-00001': '45 Years',
    'LAB-2024-00002': '32 Years',
    'LAB-2024-00003': '28 Years',
    'LAB-2024-00004': '55 Years',
    'LAB-2024-00005': '60 Years',
  };

  const patientGenders: Record<string, string> = {
    'LAB-2024-00001': 'Male',
    'LAB-2024-00002': 'Female',
    'LAB-2024-00003': 'Male',
    'LAB-2024-00004': 'Female',
    'LAB-2024-00005': 'Male',
  };

  const testNames = report.tests.split(',').map((t: string) => t.trim());
  const tests: TestReportData[] = testNames.map((name: string) => testMap[name] || {
    testName: name,
    parameters: [{ name: 'Result', value: 'Normal', unit: '', refRange: '', flag: null }],
  });

  return {
    orderNo: report.orderNo,
    patientName: report.patientName,
    patientId: report.patientId,
    age: patientAges[report.patientId] || '35 Years',
    gender: patientGenders[report.patientId] || 'Male',
    date: report.date,
    referredBy: report.approvedBy || 'Self',
    tests,
    labName: 'JharLab',
    labAddress: '123 Main Street, City, State - 400001',
    labMobile: '9876543210',
    approvedBy: report.approvedBy || 'Dr. Admin',
  };
}

function getBase64Image(imgField: any): string | undefined {
  if (!imgField) return undefined;
  if (imgField.type === 'Buffer' && Array.isArray(imgField.data)) {
    return `data:image/png;base64,${Buffer.from(imgField.data).toString('base64')}`;
  } else if (imgField instanceof Uint8Array || imgField instanceof ArrayBuffer || Buffer.isBuffer(imgField)) {
    return `data:image/png;base64,${Buffer.from(imgField as any).toString('base64')}`;
  } else if (typeof imgField === 'string') {
    return imgField.startsWith('data:') ? imgField : `data:image/png;base64,${imgField}`;
  }
  return undefined;
}

export function buildReportDataFromDb(order: any, settings?: any): ReportData {
  const ageInDays = order.patient.ageUnit === 'YEARS' ? order.patient.age * 365 :
                    order.patient.ageUnit === 'MONTHS' ? order.patient.age * 30 : order.patient.age;

  const tests: TestReportData[] = (order.items || []).map((item: any) => {
    const rawParamIds = item.selectedParameters && item.selectedParameters.trim() !== ''
      ? item.selectedParameters.split(',').map(Number).filter((n: number) => !isNaN(n) && n > 0)
      : null;
    const allowedParamIds = rawParamIds && rawParamIds.length > 0 ? rawParamIds : null;

    const sortedParams = [...(item.test?.parameters || [])]
      .filter((param: any) => {
        if (param.isHeader) return true;
        if (allowedParamIds && !allowedParamIds.includes(param.id)) return false;
        return true;
      })
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder);

    let parameters: ParameterResult[] = sortedParams.map((param: any) => {
      if (param.isHeader) {
        return {
          name: param.name,
          value: '',
          unit: '',
          refRange: '',
          flag: null,
          isHeader: true
        };
      }

      const result = item.results?.find((r: any) => r.parameterId === param.id);
      const value = result ? (result.textValue || (result.numericValue !== null ? String(result.numericValue) : '')) : '';

      const range = param.refRanges?.find((r: any) =>
        (r.gender == null || r.gender === order.patient.gender) &&
        (r.ageMin == null || ageInDays >= r.ageMin) &&
        (r.ageMax == null || ageInDays <= r.ageMax)
      );

      let refRangeStr = '';
      if (range) {
        if (param.type === 'NUMERIC' || param.type === 'CALCULATED') {
          if (range.normalMin !== null && range.normalMax !== null) {
            refRangeStr = `${range.normalMin} - ${range.normalMax}`;
          } else if (range.normalMin !== null) {
            refRangeStr = `>= ${range.normalMin}`;
          } else if (range.normalMax !== null) {
            refRangeStr = `<= ${range.normalMax}`;
          }
        } else {
          refRangeStr = range.textNormal || '';
        }
      }

      return {
        name: param.name,
        value,
        unit: param.unit || '',
        refRange: refRangeStr,
        flag: result ? (result.flag || null) : null
      };
    });

    // Filter out headers that have no parameters under them
    parameters = parameters.filter((p, idx) => {
      if (!p.isHeader) return true;
      const nextNonHeader = parameters.slice(idx + 1).find(x => !x.isHeader);
      return !!nextNonHeader;
    });

    return {
      testName: item.test?.name || 'Test',
      parameters
    };
  });

  const logoBase64 = getBase64Image(settings?.logo);
  const isApproved = order.status === 'APPROVED' || order.status === 'DELIVERED';

  return {
    orderNo: order.orderNo,
    patientName: order.patient.name,
    patientId: order.patientId,
    age: `${order.patient.age} ${order.patient.ageUnit === 'YEARS' ? 'Years' : order.patient.ageUnit === 'MONTHS' ? 'Months' : 'Days'}`,
    gender: order.patient.gender === 'MALE' ? 'Male' : order.patient.gender === 'FEMALE' ? 'Female' : 'Other',
    date: new Date(order.createdAt).toLocaleDateString('en-GB'),
    referredBy: order.patient.doctor?.name || order.patient.referredDoctor || 'Self',
    tests,
    labName: settings?.labName || 'JharLab Diagnostics',
    labAddress: settings?.address || '456 Healthcare Plaza, New Delhi - 110001',
    labMobile: settings?.mobile || '9988776655',
    labEmail: settings?.email || undefined,
    labWebsite: settings?.website || undefined,
    gstNumber: settings?.gstNumber || undefined,
    registrationNo: settings?.registrationNo || undefined,
    logo: logoBase64,
    approvedBy: isApproved
      ? (settings?.doctorName || 'Dr. Anjali Verma')
      : 'Draft Report (Pending Approval)',
    doctorName: isApproved ? (settings?.doctorName || 'Dr. Anjali Verma') : undefined,
    doctorQualification: isApproved
      ? (settings?.doctorQualification || 'MD (Pathologist)')
      : '',
    doctorRegNo: isApproved
      ? (settings?.doctorRegNo || 'MMC/REG/12345')
      : '',
    printShowLogo: settings?.printShowLogo !== false,
    doctorSignatureEnabled: settings?.doctorSignature !== 'Disabled',
    coSigningEnabled: settings?.coSigningEnabled === true,
    technicianName: settings?.technicianName || 'Medical Lab Technician',
    technicianQualification: settings?.technicianQualification || 'DMLT, BMLT',
    technicianRegNo: settings?.technicianRegNo || '',
    pathologyDoctorName: settings?.pathologyDoctorName || 'Dr. Vimal Shah',
    pathologyDoctorQualification: settings?.pathologyDoctorQualification || 'MD (Pathologist)',
    pathologyDoctorRegNo: settings?.pathologyDoctorRegNo || 'MMC/REG/67890',
    doctorSignatureImage: getBase64Image(settings?.signature),
    technicianSignatureImage: getBase64Image(settings?.technicianSignature),
    pathologyDoctorSignatureImage: getBase64Image(settings?.pathologyDoctorSignature),
    printShowQR: settings?.printShowQR !== false
  };
}

export async function generateCombinedReportsPDF(reportsList: ReportData[]): Promise<Uint8Array> {
  const combinedDoc = await PDFDocument.create();
  for (const data of reportsList) {
    const singleDocBytes = await generateReportPDF(data);
    const singleDoc = await PDFDocument.load(singleDocBytes);
    const pages = await combinedDoc.copyPages(singleDoc, singleDoc.getPageIndices());
    pages.forEach(p => combinedDoc.addPage(p));
  }
  return await combinedDoc.save();
}
