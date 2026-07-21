import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore
import bwipjs from 'bwip-js';
import crypto from 'crypto';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';

function shortenMedicalName(name: string): string {
  const map: Record<string, string> = {
    'Complete Blood Count (CBC)': 'CBC',
    'Complete Blood Count': 'CBC',
    'Liver Function Test (LFT)': 'LFT',
    'Liver Function Test': 'LFT',
    'Renal Function Test (RFT)': 'RFT',
    'Renal Function Test': 'RFT',
    'Thyroid Profile': 'Thyroid',
    'Lipid Profile': 'Lipid',
    'Hemoglobin (Hb)': 'Hb',
    'Erythrocyte (RBC) Count': 'RBC',
    'Packed Cell Volume (PCV)': 'PCV',
    'Total Leucocytes (WBC) Count': 'WBC',
    'Mean Cell Volume (MCV)': 'MCV',
    'Mean Cell Haemoglobin (MCH)': 'MCH',
    'Mean Corpuscular Hb Concn. (MCHC)': 'MCHC',
    'Red Cell Distribution Width (RDW)': 'RDW',
    'Differential Leucocyte Count (DLC)': 'DLC',
    'Platelet count': 'Platelets',
    'Platelet Count': 'Platelets',
    'Neutrophils': 'Neutro',
    'Lymphocytes': 'Lympho',
    'Monocytes': 'Mono',
    'Eosinophils': 'Eosino',
    'Basophils': 'Baso',
    'Blood Sugar (Fasting)': 'Sugar Fasting',
    'Blood Sugar (PP)': 'Sugar PP',
    'Blood Sugar': 'Sugar',
    'HbA1c (Glycated Hemoglobin)': 'HbA1c',
    'Estimated Avg Glucose': 'eAG',
    'Serum Creatinine': 'Creatinine',
    'Uric Acid': 'Uric Acid',
    'Blood Urea': 'Urea',
    'Sodium (Na+)': 'Sodium',
    'Potassium (K+)': 'Potassium',
    'Chloride (Cl-)': 'Chloride',
    'Total Cholesterol': 'Cholesterol',
    'Triglycerides': 'Triglycerides',
    'HDL Cholesterol': 'HDL',
    'LDL Cholesterol': 'LDL',
    'VLDL Cholesterol': 'VLDL',
    'Total/HDL Ratio': 'Chol/HDL',
    'SGOT (AST)': 'SGOT',
    'SGPT (ALT)': 'SGPT',
    'Alkaline Phosphatase': 'ALP',
    'Total Bilirubin': 'Bilirubin Total',
    'Direct Bilirubin': 'Bilirubin Direct',
    'Indirect Bilirubin': 'Bilirubin Indirect',
    'Total Protein': 'Protein Total',
    'Albumin': 'Albumin',
    'Globulin': 'Globulin',
    'A/G Ratio': 'A/G Ratio',
    'T3 (Triiodothyronine)': 'T3',
    'T4 (Thyroxine)': 'T4',
    'TSH': 'TSH'
  };
  return map[name] || name;
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    if (!data.orderNo || !data.patientName) {
      return NextResponse.json({ success: false, error: 'orderNo and patientName are required' }, { status: 400 });
    }

    const SECRET_SALT = process.env.LICENSE_SECRET_SALT || 'Musharraf_709121SaltKey';

    // Construct compact metadata payload to keep QR density low
    const compactData = {
      o: data.orderNo,
      n: data.patientName,
      a: data.age || '',
      g: data.gender || '',
      d: data.date || '',
      l: data.labName || 'Diagnostic Centre',
      r: data.approvedBy || '',
      t: (data.tests || []).map((t: any) => ({
        n: shortenMedicalName(t.testName),
        p: (t.parameters || []).map((p: any) => ({
          n: shortenMedicalName(p.name),
          v: p.value,
          f: p.flag
        }))
      }))
    };

    const jsonStr = JSON.stringify(compactData);
    const compressed = zlib.deflateSync(jsonStr);
    const base64Data = compressed.toString('base64');
    
    // Generate signature and use a shortened version (16 characters) to save space
    const fullSignature = crypto.createHmac('sha256', SECRET_SALT).update(base64Data).digest('hex');
    const signature = fullSignature.substring(0, 16);

    const ADMIN_DASHBOARD_URL = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || 'https://adminlabmanagement.vercel.app';
    const verifyUrl = `${ADMIN_DASHBOARD_URL}/verify?p=${encodeURIComponent(base64Data)}&s=${signature}`;

    if (data.getUrlOnly) {
      return NextResponse.json({ success: true, verifyUrl });
    }

    // Generate QR code buffer offline with eclevel 'L' to maximize block size
    const qrPngBuffer = await bwipjs.toBuffer({
      bcid: 'qrcode',
      text: verifyUrl,
      scale: 2,
      eclevel: 'L',
    });

    return new NextResponse(qrPngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    console.error('QR code generation error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
