import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const VALID_ACTIONS = ['PAUSE', 'RESUME', 'STOP', 'DELETE'] as const;
type LicenseAction = typeof VALID_ACTIONS[number];

const ACTION_TO_STATUS: Record<LicenseAction, string> = {
  PAUSE: 'PAUSED',
  RESUME: 'ACTIVE',
  STOP: 'STOPPED',
  DELETE: 'DELETED',
};

/**
 * POST /api/license/action
 * Body: { id: number, action: "PAUSE" | "RESUME" | "STOP" | "DELETE" }
 *
 * Updates the status field of a license record.
 * DELETE performs a soft-delete by setting status to "DELETED".
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, action } = body as { id: number; action: string };

    if (!id || typeof id !== 'number') {
      return NextResponse.json(
        { success: false, error: 'A valid license id is required.' },
        { status: 400 }
      );
    }

    if (!action || !VALID_ACTIONS.includes(action as LicenseAction)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify the license exists
    const existing = await prisma.license.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'License not found.' },
        { status: 404 }
      );
    }

    const newStatus = ACTION_TO_STATUS[action as LicenseAction];

    const updated = await prisma.license.update({
      where: { id },
      data: { status: newStatus },
    });

    return NextResponse.json({
      success: true,
      license: updated,
      message: `License ${action.toLowerCase()}d successfully.`,
    });
  } catch (error) {
    console.error('License action error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to perform license action.';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
