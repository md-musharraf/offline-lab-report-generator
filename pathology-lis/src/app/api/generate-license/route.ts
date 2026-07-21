import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { encryptLicenseKey } from '@/lib/license';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function POST(request: Request) {
  try {
    const { machineId, expiryDate } = await request.json();

    if (!machineId || !expiryDate) {
      return NextResponse.json(
        { success: false, error: 'Machine ID and Expiry Date are required' },
        { status: 400 }
      );
    }

    // Verify date is valid format
    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid expiry date format' },
        { status: 400 }
      );
    }

    // Standardize expiry string to YYYY-MM-DD
    const expiryStr = expiry.toISOString().slice(0, 10);

    // Generate license key using cryptography helper
    const licenseKey = encryptLicenseKey(machineId.trim(), expiryStr);

    // Save generated license into the database
    const savedLicense = await prisma.license.create({
      data: {
        machineId: machineId.trim(),
        expiryDate: expiryStr,
        licenseKey,
      },
    });

    return NextResponse.json({
      success: true,
      licenseKey: savedLicense.licenseKey,
      expiryDate: savedLicense.expiryDate,
      machineId: savedLicense.machineId,
      id: savedLicense.id,
      message: 'License generated successfully!',
    });
  } catch (error) {
    console.error('License generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate license';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Return list of all generated licenses
    const licenses = await prisma.license.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      licenses,
    });
  } catch (error) {
    console.error('Failed to fetch generated licenses:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch generated licenses';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
