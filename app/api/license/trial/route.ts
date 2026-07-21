import { NextResponse } from 'next/server';
import { PrismaClient } from '../../../../prisma/client';
import { getMachineId, encryptLicenseKey } from '../../../../lib/license';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function POST() {
  try {
    const trialFilePath = path.join(process.cwd(), 'trial.json');
    
    if (fs.existsSync(trialFilePath)) {
      return NextResponse.json({
        success: false,
        error: 'Trial license has already been activated on this system.'
      });
    }

    const machineId = getMachineId();

    // Calculate expiry date: 7 days from now
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    const expiryStr = expiry.toISOString().slice(0, 10);

    // Generate license key
    const licenseKey = encryptLicenseKey(machineId, expiryStr);

    // Save to database
    await prisma.labSettings.upsert({
      where: { id: 1 },
      update: { licenseKey },
      create: {
        id: 1,
        labName: 'JharLab',
        address: '123 Street Name',
        mobile: '9876543210',
        licenseKey
      }
    });

    // Write trial.json file to local directory
    fs.writeFileSync(trialFilePath, JSON.stringify({ activated: true, date: Date.now(), expiry: expiryStr }, null, 2));

    return NextResponse.json({
      success: true,
      expiryDate: expiryStr,
      message: '7-Day Free Trial activated successfully!'
    });
  } catch (error: any) {
    console.error('License trial activation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to activate trial'
    }, { status: 500 });
  }
}
