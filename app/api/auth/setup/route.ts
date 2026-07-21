import { NextResponse } from 'next/server';
import { PrismaClient } from '../../../../prisma/client';
import bcrypt from 'bcryptjs';
import { defaultTests } from '../../../../lib/default-tests';

const prisma = new PrismaClient();

async function seedTestWithParameters(testData: any, parameters: any[]) {
  const test = await prisma.test.upsert({
    where: { code: testData.code },
    update: {
      name: testData.name,
      shortName: testData.shortName,
      categoryId: testData.categoryId,
      price: testData.price,
      duration: testData.duration,
      sampleType: testData.sampleType,
      container: testData.container,
    },
    create: testData,
  });

  const existingParams = await prisma.testParameter.findMany({
    where: { testId: test.id },
  });
  
  for (const p of existingParams) {
    await prisma.referenceRange.deleteMany({
      where: { parameterId: p.id },
    });
  }
  
  await prisma.testParameter.deleteMany({
    where: { testId: test.id },
  });

  for (const param of parameters) {
    await prisma.testParameter.create({
      data: {
        testId: test.id,
        name: param.name,
        unit: param.unit,
        sortOrder: param.sortOrder,
        type: param.type || 'NUMERIC',
        isHeader: param.isHeader || false,
        refRanges: {
          create: param.refRanges || []
        }
      }
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      labName, mobile, address, email,
      ownerName, ownerEmail, ownerPassword 
    } = body;

    if (!labName || !mobile || !address || !ownerName || !ownerEmail || !ownerPassword) {
      return NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      );
    }

    const existingAdmins = await prisma.user.count({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN'] },
        deletedAt: null
      }
    });

    if (existingAdmins > 0) {
      return NextResponse.json(
        { success: false, error: 'Setup is already complete. Owner registration blocked.' },
        { status: 400 }
      );
    }

    // 1. Create LabSettings (Prisma SQLite fields only)
    await prisma.labSettings.create({
      data: {
        labName,
        mobile,
        address,
        email: email || null
      }
    });

    // 2. Hash Password and Create Owner User
    const hashedPassword = await bcrypt.hash(ownerPassword, 12);
    const owner = await prisma.user.create({
      data: {
        name: ownerName,
        email: ownerEmail.toLowerCase().trim(),
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
        lastLogin: new Date()
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    // 3. Seed Default Test Categories & Tests Catalog
    const categories = [
      'Hematology', 'Biochemistry', 'Serology', 'Microbiology', 'Clinical Pathology', 'Immunology'
    ];

    const categoryMap: Record<string, number> = {};

    for (const cat of categories) {
      const c = await prisma.testCategory.upsert({
        where: { name: cat },
        update: {},
        create: { name: cat },
      });
      categoryMap[cat] = c.id;
    }

    for (const t of defaultTests) {
      await seedTestWithParameters(
        {
          code: t.code,
          name: t.name,
          shortName: t.shortName || null,
          categoryId: categoryMap[t.category],
          price: Number(t.price),
          duration: t.duration || 1,
          sampleType: t.sampleType || 'Whole Blood',
          container: t.container || null,
        },
        t.parameters.map((p: any, pIdx: number) => ({
          name: p.name,
          unit: p.unit || null,
          sortOrder: p.sortOrder || (pIdx + 1),
          type: p.type || 'NUMERIC',
          options: p.options || null,
          isHeader: p.isHeader || false,
          refRanges: (p.refRanges || []).map((r: any) => ({
            gender: r.gender || null,
            normalMin: r.normalMin !== undefined ? r.normalMin : null,
            normalMax: r.normalMax !== undefined ? r.normalMax : null,
            criticalMin: r.criticalMin !== undefined ? r.criticalMin : null,
            criticalMax: r.criticalMax !== undefined ? r.criticalMax : null,
            textNormal: r.textNormal || null
          }))
        }))
      );
    }

    return NextResponse.json({
      success: true,
      user: owner
    });
  } catch (error: any) {
    console.error('Setup wizard process error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error during setup' },
      { status: 500 }
    );
  }
}
