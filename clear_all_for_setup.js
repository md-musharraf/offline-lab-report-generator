const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all users, settings, and catalog to test onboarding setup...');
  
  // 1. Delete operational tables
  await prisma.activityLog.deleteMany({});
  await prisma.backupLog.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.testResult.deleteMany({});
  await prisma.report.deleteMany({});
  await prisma.testOrderItem.deleteMany({});
  await prisma.testOrder.deleteMany({});
  await prisma.bill.deleteMany({});
  await prisma.patient.deleteMany({});
  await prisma.doctor.deleteMany({});
  
  // 2. Delete configuration tables (will be re-created by setup page)
  await prisma.referenceRange.deleteMany({});
  await prisma.testParameter.deleteMany({});
  await prisma.test.deleteMany({});
  await prisma.testCategory.deleteMany({});
  await prisma.labSettings.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Database completely reset. Start the app to view the Onboarding Setup Wizard.');
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
