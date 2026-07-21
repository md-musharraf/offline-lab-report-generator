const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Clearing demo data from database...');
  
  // Delete all operational data
  await prisma.activityLog.deleteMany({});
  await prisma.backupLog.deleteMany({});
  
  await prisma.inventoryTransaction.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  await prisma.supplier.deleteMany({});
  
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
  
  // Keep Admin user
  // Keep TestCategories
  // Keep Tests
  // Keep TestParameters
  // Keep ReferenceRanges
  // Keep LabSettings

  console.log('Database operational tables cleared successfully.');
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
