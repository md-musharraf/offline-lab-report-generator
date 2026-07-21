import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const dynamic = 'force-dynamic';

/**
 * GET /api/license/status?machineId=...
 * Called by the client app's remote-check proxy to determine
 * the current license status for a given machine.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');

    if (!machineId) {
      return NextResponse.json(
        { success: false, error: 'machineId parameter is required' },
        { status: 400 }
      );
    }

    // Find the most recent license for this machineId
    const license = await prisma.license.findFirst({
      where: { machineId: machineId.trim() },
      orderBy: { createdAt: 'desc' },
    });

    if (!license) {
      return NextResponse.json(
        { success: false, status: 'DELETED', reason: 'This machine is not registered in the database.' },
        { status: 404 }
      );
    }

    // If the license has been soft-deleted, report it as DELETED
    if (license.status === 'DELETED') {
      return NextResponse.json(
        { success: false, status: 'DELETED', reason: 'This machine\'s license registration has been deleted by the administrator.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      status: license.status,
      licenseKey: license.licenseKey,
      expiryDate: license.expiryDate,
      machineId: license.machineId,
    });
  } catch (error) {
    console.error('License status check error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
