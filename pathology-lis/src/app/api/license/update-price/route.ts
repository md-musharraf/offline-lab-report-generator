import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * POST /api/license/update-price
 * Body: { id: number, price: number }
 *
 * Updates the price field of a license record.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, price } = body as { id: number; price: number };

    if (!id || typeof id !== 'number') {
      return NextResponse.json(
        { success: false, error: 'A valid license id is required.' },
        { status: 400 }
      );
    }

    if (price === undefined || price === null || typeof price !== 'number' || price < 0) {
      return NextResponse.json(
        { success: false, error: 'A valid non-negative price is required.' },
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

    const updated = await prisma.license.update({
      where: { id },
      data: { price },
    });

    return NextResponse.json({
      success: true,
      license: updated,
      message: 'Price updated successfully.',
    });
  } catch (error) {
    console.error('License price update error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update price.';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
