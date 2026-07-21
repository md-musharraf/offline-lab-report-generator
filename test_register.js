const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Testing registration query sequence...');
  
  // Fetch a user from the database to ensure we have a valid createdBy ID
  const testUser = await prisma.user.findFirst();
  if (!testUser) {
    console.error('No users found in database! Please run setup first.');
    return;
  }
  const userId = testUser.id;

  // Find a test
  const test = await prisma.test.findFirst();
  if (!test) {
    console.error('No tests found in database! Please run seed first.');
    return;
  }
  console.log('Found test:', test.name, 'with ID:', test.id);

  const registerDate = new Date();
  const year = registerDate.getFullYear();
  const dateStr = registerDate.toISOString().slice(0, 10).replace(/-/g, '');

  // 1. Patient ID
  const count = await prisma.patient.count({
    where: { id: { startsWith: `LAB-${year}` } }
  });
  const newId = `LAB-${year}-${String(count + 1).padStart(5, '0')}`;
  console.log('Generated patient ID:', newId);

  // 2. Patient Creation
  console.log('Creating Patient...');
  const newPatient = await prisma.patient.create({
    data: {
      id: newId,
      name: "Test Patient",
      age: 30,
      ageUnit: "YEARS",
      gender: "MALE",
      mobile: "1234567890",
      referredDoctor: "Self",
      referredDoctorId: null,
      createdBy: userId,
      registeredAt: registerDate.toISOString()
    }
  });
  console.log('Patient created successfully:', newPatient.id);

  // 3. Bill Creation
  console.log('Creating Bill...');
  const billsToday = await prisma.bill.findMany({
    where: { billNo: { contains: `LAB-BIL-${dateStr}` } }
  });
  const billNo = `LAB-BIL-${dateStr}-${String((billsToday?.length || 0) + 1).padStart(4, '0')}`;

  const bill = await prisma.bill.create({
    data: {
      billNo,
      patientId: newPatient.id,
      subtotal: test.price,
      discountType: 'FLAT',
      discountValue: 0,
      discountAmount: 0,
      gstPercent: 18,
      gstAmount: test.price * 0.18,
      totalAmount: test.price * 1.18,
      paidAmount: test.price * 1.18,
      dueAmount: 0,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      referralCommission: null,
      createdAt: registerDate.toISOString()
    }
  });
  console.log('Bill created successfully:', bill.id, bill.billNo);

  // 4. Payment Creation
  console.log('Creating Payment...');
  const payment = await prisma.payment.create({
    data: {
      billId: bill.id,
      amount: test.price * 1.18,
      method: 'CASH',
      receivedBy: userId,
      paidAt: registerDate.toISOString()
    }
  });
  console.log('Payment created successfully:', payment.id);

  // 5. Order Creation
  console.log('Creating Order...');
  const ordersToday = await prisma.testOrder.findMany({
    where: { orderNo: { contains: `LAB-ORD-${dateStr}` } }
  });
  const orderNo = `LAB-ORD-${dateStr}-${String((ordersToday?.length || 0) + 1).padStart(4, '0')}`;

  const order = await prisma.testOrder.create({
    data: {
      orderNo,
      patientId: newPatient.id,
      billId: bill.id,
      priority: 'ROUTINE',
      status: 'PENDING',
      createdAt: registerDate.toISOString(),
      items: {
        create: [
          { testId: test.id }
        ]
      }
    }
  });
  console.log('Order created successfully:', order.id, order.orderNo);

  // Clean up test data
  console.log('Cleaning up test data...');
  await prisma.testOrderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.testOrder.delete({ where: { id: order.id } });
  await prisma.payment.delete({ where: { id: payment.id } });
  await prisma.bill.delete({ where: { id: bill.id } });
  await prisma.patient.delete({ where: { id: newPatient.id } });
  console.log('Cleanup completed successfully.');
}

main()
  .catch(e => {
    console.error('Error during query execution:');
    console.error(e);
  })
  .finally(() => prisma.$disconnect());
