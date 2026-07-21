const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING NESTED PRISMA FLOW TEST ---');
  
  // Fetch a user from the database to ensure we have a valid createdBy ID
  const testUser = await prisma.user.findFirst();
  if (!testUser) {
    throw new Error('No users found in database. Run setup/seed first.');
  }
  const userId = testUser.id;

  // 1. Doctors
  const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
  console.log('Doctors count:', doctors.length);

  // 2. Tests
  const tests = await prisma.test.findMany({ where: { isActive: true }, include: { category: true } });
  console.log('Tests count:', tests.length);
  if (tests.length === 0) {
    throw new Error('No active tests found. Run seed.');
  }

  // 3. Patient Count
  const year = new Date().getFullYear();
  const count = await prisma.patient.count({
    where: { id: { startsWith: `LAB-${year}` } }
  });
  console.log('Patient count for startsWith:', count);

  const newId = `LAB-${year}-${String(count + 1).padStart(5, '0')}`;
  console.log('Generated ID:', newId);

  // 4. Create Patient
  const newPatient = await prisma.patient.create({
    data: {
      id: newId,
      name: 'Nested Test Patient',
      age: 25,
      ageUnit: 'YEARS',
      gender: 'FEMALE',
      mobile: '9876543210',
      referredDoctor: 'Self',
      referredDoctorId: null,
      createdBy: userId,
      registeredAt: new Date().toISOString()
    }
  });
  console.log('Patient created:', newPatient.id);

  // 5. Bill count
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const billsToday = await prisma.bill.findMany({
    where: { billNo: { contains: `LAB-BIL-${dateStr}` } }
  });
  const billNo = `LAB-BIL-${dateStr}-${String((billsToday?.length || 0) + 1).padStart(4, '0')}`;
  console.log('Generated billNo:', billNo);

  // 6. Order count
  const ordersToday = await prisma.testOrder.findMany({
    where: { orderNo: { contains: `LAB-ORD-${dateStr}` } }
  });
  const orderNo = `LAB-ORD-${dateStr}-${String((ordersToday?.length || 0) + 1).padStart(4, '0')}`;
  console.log('Generated orderNo:', orderNo);

  // 7. Create Bill
  const bill = await prisma.bill.create({
    data: {
      billNo,
      patientId: newPatient.id,
      subtotal: tests[0].price,
      discountType: 'FLAT',
      discountValue: 0,
      discountAmount: 0,
      gstPercent: 18,
      gstAmount: tests[0].price * 0.18,
      totalAmount: tests[0].price * 1.18,
      paidAmount: tests[0].price * 1.18,
      dueAmount: 0,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      referralCommission: null,
      createdAt: new Date().toISOString()
    }
  });
  console.log('Bill created:', bill.id, bill.billNo);

  // 8. Create Payment
  const payment = await prisma.payment.create({
    data: {
      billId: bill.id,
      amount: tests[0].price * 1.18,
      method: 'CASH',
      receivedBy: userId,
      paidAt: new Date().toISOString()
    }
  });
  console.log('Payment created:', payment.id);

  // 9. Create Order
  const order = await prisma.testOrder.create({
    data: {
      orderNo,
      patientId: newPatient.id,
      billId: bill.id,
      priority: 'ROUTINE',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      items: {
        create: [
          { testId: tests[0].id }
        ]
      }
    }
  });
  console.log('Order created:', order.id, order.orderNo);

  // 10. Find unique with full include tree
  console.log('Running testOrder.findUnique...');
  const orderDetails = await prisma.testOrder.findUnique({
    where: { id: order.id },
    include: {
      patient: true,
      bill: true,
      items: {
        include: {
          test: {
            include: {
              parameters: {
                include: { refRanges: true }
              }
            }
          },
          results: true
        }
      }
    }
  });
  
  console.log('Query result structure verification:');
  console.log('- Patient:', orderDetails.patient?.name);
  console.log('- Bill:', orderDetails.bill?.billNo);
  console.log('- Items count:', orderDetails.items?.length);
  const firstItem = orderDetails.items?.[0];
  console.log('  - First item test:', firstItem?.test?.name);
  console.log('  - First item test parameters count:', firstItem?.test?.parameters?.length);
  const firstParam = firstItem?.test?.parameters?.[0];
  console.log('    - First parameter name:', firstParam?.name);
  console.log('    - First parameter refRanges count:', firstParam?.refRanges?.length);

  // Cleanup
  console.log('--- CLEANING UP ---');
  await prisma.testOrderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.testOrder.delete({ where: { id: order.id } });
  await prisma.payment.delete({ where: { id: payment.id } });
  await prisma.bill.delete({ where: { id: bill.id } });
  await prisma.patient.delete({ where: { id: newPatient.id } });
  console.log('Cleanup completed successfully.');
}

main()
  .catch(err => {
    console.error('ERROR OCCURRED IN FLOW:');
    console.error(err);
  })
  .finally(() => prisma.$disconnect());
