import { NextResponse } from 'next/server';
import { PrismaClient } from '../../../../prisma/client';
import { getMachineId, validateLicenseKey } from '../../../../lib/license';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const machineId = getMachineId();
    
    // Find settings row with id 1
    let settings = await prisma.labSettings.findFirst({
      where: { id: 1 }
    });

    if (!settings) {
      // Create a default settings row if it doesn't exist
      settings = await prisma.labSettings.create({
        data: {
          id: 1,
          labName: 'JharLab',
          address: '123 Street Name',
          mobile: '9876543210'
        }
      });
    }

    if (!settings.licenseKey) {
      return NextResponse.json({
        valid: false,
        machineId,
        reason: 'Software has not been activated. Please enter a license key.'
      });
    }

    const validation = validateLicenseKey(settings.licenseKey);
    return NextResponse.json({
      valid: validation.valid,
      machineId,
      expiryDate: validation.expiryDate,
      reason: validation.reason
    });
  } catch (error: any) {
    console.error('License check error:', error);
    return NextResponse.json({
      valid: false,
      machineId: getMachineId(),
      error: error.message,
      reason: 'Failed to verify license from database'
    }, { status: 500 });
  }
}
