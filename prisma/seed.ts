const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { defaultTests: allDefaultTests } = require('../lib/default-tests');

const prisma = new PrismaClient();

async function seedTestWithParameters(testData: any, parameters: any[]) {
  // 1. Upsert test
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

  // 2. Clear existing parameters for this test to avoid duplicates on re-run
  const existingParams = await prisma.testParameter.findMany({
    where: { testId: test.id },
  });
  
  for (const p of existingParams) {
    // Delete reference ranges first
    await prisma.referenceRange.deleteMany({
      where: { parameterId: p.id },
    });
  }
  
  await prisma.testParameter.deleteMany({
    where: { testId: test.id },
  });

  // 3. Create parameters and reference ranges
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

  console.log(`Seeded test: ${test.code} - ${test.name}`);
}

async function main() {
  const hashedPassword = await bcrypt.hash('Admin@123', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@lab.com' },
    update: {},
    create: {
      email: 'admin@lab.com',
      name: 'Admin Owner',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
    },
  });

  const staffPassword = await bcrypt.hash('Staff@123', 12);

  const receptionist = await prisma.user.upsert({
    where: { email: 'receptionist@lab.com' },
    update: {},
    create: {
      email: 'receptionist@lab.com',
      name: 'Rahul Kumar (Receptionist)',
      password: staffPassword,
      role: 'RECEPTIONIST',
    },
  });

  const technician = await prisma.user.upsert({
    where: { email: 'technician@lab.com' },
    update: {},
    create: {
      email: 'technician@lab.com',
      name: 'Dr. Amit Shah (Technician)',
      password: staffPassword,
      role: 'TECHNICIAN',
    },
  });

  console.log({ admin, receptionist, technician });

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

  // Seed all default tests
  for (const t of allDefaultTests) {
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

  console.log('Seed executed successfully');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
