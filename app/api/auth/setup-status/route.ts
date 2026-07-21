import { NextResponse } from 'next/server';
import { PrismaClient } from '../../../../prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const userCount = await prisma.user.count({
      where: {
        role: {
          in: ['SUPER_ADMIN', 'ADMIN']
        },
        deletedAt: null
      }
    });

    return NextResponse.json({
      success: true,
      isSetupRequired: userCount === 0
    });
  } catch (error: any) {
    console.error('Setup status check error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
