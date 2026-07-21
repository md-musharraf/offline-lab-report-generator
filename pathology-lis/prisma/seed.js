const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Lab Settings
  await prisma.labSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      labName: 'Default Pathology Lab',
      taxPercent: 0,
    },
  });

  // 2. Users
  const superAdminPassword = await bcrypt.hash('Admin@123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@lab.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@lab.com',
      password: superAdminPassword,
      role: 'SUPER_ADMIN',
    },
  });

  const techPassword = await bcrypt.hash('Tech@123', 12);
  await prisma.user.upsert({
    where: { email: 'tech@lab.com' },
    update: {},
    create: {
      name: 'Technician',
      email: 'tech@lab.com',
      password: techPassword,
      role: 'TECHNICIAN',
    },
  });

  const receptionPassword = await bcrypt.hash('Reception@123', 12);
  await prisma.user.upsert({
    where: { email: 'reception@lab.com' },
    update: {},
    create: {
      name: 'Reception',
      email: 'reception@lab.com',
      password: receptionPassword,
      role: 'RECEPTIONIST',
    },
  });

  // 3. Test Categories
  const categories = [
    { code: 'HEM', name: 'Hematology', color: '#EF4444' },
    { code: 'BIO', name: 'Biochemistry', color: '#3B82F6' },
    { code: 'SER', name: 'Serology', color: '#8B5CF6' },
    { code: 'HOR', name: 'Hormones', color: '#EC4899' },
    { code: 'URI', name: 'Urine Analysis', color: '#F59E0B' },
    { code: 'STL', name: 'Stool Analysis', color: '#78716C' },
    { code: 'MIC', name: 'Microbiology', color: '#10B981' },
    { code: 'HIS', name: 'Histopathology', color: '#6366F1' },
    { code: 'CYT', name: 'Cytology', color: '#14B8A6' },
    { code: 'MOL', name: 'Molecular', color: '#F97316' },
  ];

  for (const cat of categories) {
    await prisma.testCategory.upsert({
      where: { code: cat.code },
      update: {},
      create: cat,
    });
  }

  // 4. Example Test: CBC
  const hemCat = await prisma.testCategory.findUnique({ where: { code: 'HEM' } });
  if (hemCat) {
    const cbcTest = await prisma.test.upsert({
      where: { code: 'HEM001' },
      update: {},
      create: {
        code: 'HEM001',
        name: 'Complete Blood Count (CBC)',
        categoryId: hemCat.id,
        price: 350.0,
      },
    });

    const cbcParams = [
      { name: 'Hemoglobin', unit: 'g/dL', type: 'NUMERIC', normalMin: 13.0, normalMax: 17.0, criticalMin: 7.0, criticalMax: 20.0 },
      { name: 'WBC Count', unit: '10³/µL', type: 'NUMERIC', normalMin: 4.0, normalMax: 11.0, criticalMin: 2.0, criticalMax: 30.0 },
      { name: 'Platelet Count', unit: '10³/µL', type: 'NUMERIC', normalMin: 150, normalMax: 400, criticalMin: 50, criticalMax: 1000 },
      { name: 'Hematocrit (PCV)', unit: '%', type: 'NUMERIC', normalMin: 40, normalMax: 50 },
      { name: 'MCV', unit: 'fL', type: 'NUMERIC', normalMin: 83, normalMax: 101 },
      { name: 'MCH', unit: 'pg', type: 'NUMERIC', normalMin: 27, normalMax: 32 },
      { name: 'MCHC', unit: 'g/dL', type: 'NUMERIC', normalMin: 31.5, normalMax: 34.5 },
      { name: 'RDW', unit: '%', type: 'NUMERIC', normalMin: 11.6, normalMax: 14.0 },
      { name: 'Neutrophils', unit: '%', type: 'NUMERIC', normalMin: 40, normalMax: 80 },
      { name: 'Lymphocytes', unit: '%', type: 'NUMERIC', normalMin: 20, normalMax: 40 },
      { name: 'Monocytes', unit: '%', type: 'NUMERIC', normalMin: 2, normalMax: 10 },
      { name: 'Eosinophils', unit: '%', type: 'NUMERIC', normalMin: 1, normalMax: 6 },
      { name: 'Basophils', unit: '%', type: 'NUMERIC', normalMin: 0, normalMax: 2 },
    ];

    for (const param of cbcParams) {
      // Find existing by testId and name
      const existing = await prisma.testParameter.findFirst({
        where: { testId: cbcTest.id, name: param.name },
      });
      if (!existing) {
        await prisma.testParameter.create({
          data: {
            ...param,
            testId: cbcTest.id,
          },
        });
      }
    }
  }

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
