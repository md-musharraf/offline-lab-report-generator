import { NextResponse } from 'next/server';
import { PrismaClient } from '../../../../prisma/client';
import { validateLicenseKey } from '../../../../lib/license';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const { licenseKey } = await request.json();

    if (!licenseKey) {
      return NextResponse.json({ success: false, error: 'License key is required' }, { status: 400 });
    }

    const validation = validateLicenseKey(licenseKey);
    if (!validation.valid) {
      return NextResponse.json({ 
        success: false, 
        error: validation.reason || 'Invalid license key' 
      }, { status: 400 });
    }

    // Save the key to lab settings (id: 1)
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

    return NextResponse.json({
      success: true,
      expiryDate: validation.expiryDate,
      message: 'License activated successfully!'
    });
  } catch (error: any) {
    console.error('License activation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to activate license'
    }, { status: 500 });
  }
}
