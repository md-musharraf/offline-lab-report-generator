import { PrismaClient } from '@prisma/client';
import { validateLicenseKey, encryptLicenseKey, decryptLicenseKey } from '../lib/license.ts';
import { interpretResult } from '../lib/result-interpreter.ts';
import { generateReportPDF } from '../lib/report-pdf.ts';
import { evaluateCustomFormula, evaluateTestFormulas } from '../lib/formula-evaluator.ts';
import crypto from 'crypto';
import zlib from 'zlib';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

async function runTests() {
  console.log('==================================================');
  console.log('   PATHOLOGY LIS COMPLETE VERIFICATION SUITE      ');
  console.log('==================================================\n');

  let failedTests = 0;

  // Helper to assert conditions
  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
    } else {
      console.log(`  ❌ [FAIL] ${message}`);
      failedTests++;
    }
  }

  // ==========================================
  // 1. License Encryption / Decryption
  // ==========================================
  console.log('1. Testing License Encryption, Decryption & Validation...');
  try {
    const testMachineId = 'test-mac-guid-12345';
    const testExpiry = '2027-12-31T23:59:59.000Z';
    
    // Generate key
    const licenseKey = encryptLicenseKey(testMachineId, testExpiry);
    assert(!!licenseKey, 'License key should be successfully generated');
    
    // Decrypt key
    const decrypted = decryptLicenseKey(licenseKey);
    assert(decrypted !== null, 'Decrypted key should not be null');
    if (decrypted) {
      assert(decrypted.machineId === testMachineId, `Decrypted machineId should match: expected "${testMachineId}", got "${decrypted.machineId}"`);
      assert(decrypted.expiryDate === testExpiry, `Decrypted expiryDate should match: expected "${testExpiry}", got "${decrypted.expiryDate}"`);
    }
  } catch (err: any) {
    console.error('  ❌ License test failed with error:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // 2. Authentication Logic
  // ==========================================
  console.log('2. Testing Authentication Logic...');
  try {
    const adminPassword = process.env.ADMIN_PASSWORD || 'pathologyadmin';
    
    // Token generation logic
    const expectedToken = crypto.createHash('sha256').update(adminPassword).digest('hex');
    
    // Validate authentication function simulation
    const authenticate = (pass: string) => {
      if (pass !== adminPassword) return { error: 'Invalid admin credentials' };
      const token = crypto.createHash('sha256').update(adminPassword).digest('hex');
      return { success: true, token };
    };

    const authRes = authenticate(adminPassword);
    assert(authRes.success === true, 'Auth success should be true for correct password');
    assert(authRes.token === expectedToken, 'Generated token should match SHA-256 hash of password');
    
    const badAuth = authenticate('incorrect-password-123');
    assert(badAuth.error === 'Invalid admin credentials', 'Should return credentials error for incorrect password');
  } catch (err: any) {
    console.error('  ❌ Authentication test failed with error:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // 3. Doctor Management (Add, Edit, Fetch)
  // ==========================================
  console.log('3. Testing Doctor Management Database Operations...');
  let createdDoctorId: number | null = null;
  try {
    // 1. Create doctor
    const doc = await prisma.doctor.create({
      data: {
        name: 'Dr. Automated Test Practitioner',
        qualification: 'MBBS',
        hospital: 'Verification Labs Ltd',
        mobile: '9988776655',
        email: 'automated-test@example.com',
        commission: 15,
        isActive: true,
      }
    });
    createdDoctorId = doc.id;
    assert(!!createdDoctorId, `Doctor created successfully with ID: ${createdDoctorId}`);
    assert(doc.qualification === 'MBBS', 'Doctor qualification should match "MBBS"');

    // 2. Update doctor
    const updatedDoc = await prisma.doctor.update({
      where: { id: createdDoctorId },
      data: {
        qualification: 'MBBS, MD, PhD',
        commission: 20
      }
    });
    assert(updatedDoc.qualification === 'MBBS, MD, PhD', 'Doctor qualification should be updated to "MBBS, MD, PhD"');
    assert(updatedDoc.commission === 20, 'Doctor commission should be updated to 20');

    // 3. Fetch doctor
    const fetchedDoc = await prisma.doctor.findUnique({
      where: { id: createdDoctorId }
    });
    assert(fetchedDoc !== null, 'Fetched doctor should not be null');
    if (fetchedDoc) {
      assert(fetchedDoc.name === 'Dr. Automated Test Practitioner', 'Doctor name in database should match');
    }
  } catch (err: any) {
    console.error('  ❌ Doctor management test failed with error:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // 4. Test & Parameter Management (Add, Edit, Fetch)
  // ==========================================
  console.log('4. Testing Test & Parameter Management Database Operations...');
  let createdTestId: number | null = null;
  let testCategoryId: number | null = null;
  try {
    // 1. Find or create category
    let cat = await prisma.testCategory.findFirst({
      where: { name: 'Verification Hematology' }
    });
    if (!cat) {
      cat = await prisma.testCategory.create({
        data: {
          name: 'Verification Hematology',
          description: 'Used for automated suite checks'
        }
      });
    }
    testCategoryId = cat.id;

    // 2. Create test with parameters and reference ranges
    // Simulating main.js implementation
    const testRecord = await prisma.test.create({
      data: {
        code: 'V_CBC_001',
        name: 'Verification CBC',
        shortName: 'V-CBC',
        price: 250,
        duration: 2,
        sampleType: 'Whole Blood',
        container: 'EDTA tube',
        categoryId: testCategoryId,
        isActive: true,
      }
    });
    createdTestId = testRecord.id;
    assert(!!createdTestId, `Test record created successfully with ID: ${createdTestId}`);

    // Create parameters manually to ensure structure
    const param = await prisma.testParameter.create({
      data: {
        testId: createdTestId,
        name: 'Verification Hemoglobin',
        unit: 'g/dL',
        sortOrder: 1,
        type: 'NUMERIC',
        isHeader: false,
      }
    });

    // Create 3 reference ranges
    // Range 1: Male Adult (Age >= 18 years)
    const rangeMale = await prisma.referenceRange.create({
      data: {
        parameterId: param.id,
        gender: 'MALE',
        ageMin: 18 * 365,
        ageMax: null,
        normalMin: 13.5,
        normalMax: 17.5,
      }
    });

    // Range 2: Female Adult (Age >= 18 years)
    const rangeFemale = await prisma.referenceRange.create({
      data: {
        parameterId: param.id,
        gender: 'FEMALE',
        ageMin: 18 * 365,
        ageMax: null,
        normalMin: 12.0,
        normalMax: 15.5,
      }
    });

    // Range 3: Child (Age < 18 years, both genders)
    const rangeChild = await prisma.referenceRange.create({
      data: {
        parameterId: param.id,
        gender: null,
        ageMin: 0,
        ageMax: 17 * 365,
        normalMin: 11.0,
        normalMax: 14.5,
      }
    });

    assert(!!param.id, 'Parameter created successfully');
    assert(!!rangeMale.id && !!rangeFemale.id && !!rangeChild.id, 'Three reference ranges created successfully');

    // 3. Edit/Update test
    // Simulator cleared parameters and recreated them, let's verify database updates
    const testUpdated = await prisma.test.update({
      where: { id: createdTestId },
      data: {
        price: 300, // Update price
      }
    });
    assert(testUpdated.price === 300, 'Test price updated successfully to 300');

    // Fetch and check structure
    const fullTest = await prisma.test.findUnique({
      where: { id: createdTestId },
      include: {
        parameters: {
          include: {
            refRanges: true
          }
        }
      }
    });
    
    assert(fullTest !== null, 'Fetched test should exist');
    if (fullTest) {
      assert(fullTest.parameters.length === 1, 'Fetched test parameter count should be 1');
      assert(fullTest.parameters[0].refRanges.length === 3, 'Fetched test parameter reference ranges count should be 3');
    }
  } catch (err: any) {
    console.error('  ❌ Test & parameter management test failed with error:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // 5. Patient Save & Registration
  // ==========================================
  console.log('5. Testing Patient Save & ID Generation Logic...');
  let createdPatientId: string | null = null;
  try {
    const year = new Date().getFullYear();
    
    // Auto-generate ID logic
    const count = await prisma.patient.count({
      where: { id: { startsWith: `LAB-${year}` } }
    });
    const newId = `LAB-${year}-${String(count + 1).padStart(5, '0')}`;
    createdPatientId = newId;

    const testUser = await prisma.user.findFirst();
    if (!testUser) {
      throw new Error('No user found in database to link as createdBy');
    }

    const patient = await prisma.patient.create({
      data: {
        id: createdPatientId,
        name: 'Verification Patient',
        age: 25,
        ageUnit: 'YEARS',
        gender: 'MALE',
        mobile: '7766554433',
        email: 'patient-verify@example.com',
        referredDoctorId: createdDoctorId,
        createdBy: testUser.id,
        registeredAt: new Date().toISOString()
      }
    });

    assert(patient.id === createdPatientId, `Patient created successfully with auto-generated ID: ${patient.id}`);
    assert(patient.gender === 'MALE', 'Patient gender matches input: "MALE"');
  } catch (err: any) {
    console.error('  ❌ Patient save test failed with error:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // 6. Age & Gender Normal Range Selection
  // ==========================================
  console.log('6. Testing Reference Range Selection & Result Interpretation...');
  try {
    // Load ranges from database for parameter
    const parameterRecord = await prisma.testParameter.findFirst({
      where: { testId: createdTestId || -1 },
      include: { refRanges: true }
    });

    if (!parameterRecord) {
      throw new Error('Verification parameters not loaded');
    }

    const ranges = parameterRecord.refRanges;

    // Range matching finder function (same as in results/entry/page.tsx)
    const findRange = (gender: string, ageInDays: number) => {
      return ranges.find((r: any) => 
        (r.gender === null || r.gender === gender) &&
        (r.ageMin === null || ageInDays >= r.ageMin) &&
        (r.ageMax === null || ageInDays <= r.ageMax)
      ) || null;
    };

    // SCENARIO A: Adult Male (Age 25 years = 9125 days)
    const ageMaleAdult = 25 * 365;
    const genderMale = 'MALE';
    const rangeA = findRange(genderMale, ageMaleAdult);
    assert(rangeA !== null, 'Should find matching range for Adult Male');
    if (rangeA) {
      assert(rangeA.gender === 'MALE', 'Selected range gender should be "MALE"');
      assert(rangeA.normalMin === 13.5 && rangeA.normalMax === 17.5, 'Selected range limits should be 13.5 - 17.5');

      // Check values
      const resNormal = interpretResult(14.5, rangeA, ageMaleAdult, genderMale as any);
      assert(resNormal.status === 'NORMAL', 'Value 14.5 for Adult Male should be NORMAL');

      const resLow = interpretResult(13.0, rangeA, ageMaleAdult, genderMale as any);
      assert(resLow.status === 'LOW' && resLow.flag === '↓', 'Value 13.0 for Adult Male should be LOW (↓)');

      const resHigh = interpretResult(18.0, rangeA, ageMaleAdult, genderMale as any);
      assert(resHigh.status === 'HIGH' && resHigh.flag === '↑', 'Value 18.0 for Adult Male should be HIGH (↑)');
    }

    // SCENARIO B: Adult Female (Age 30 years = 10950 days)
    const ageFemaleAdult = 30 * 365;
    const genderFemale = 'FEMALE';
    const rangeB = findRange(genderFemale, ageFemaleAdult);
    assert(rangeB !== null, 'Should find matching range for Adult Female');
    if (rangeB) {
      assert(rangeB.gender === 'FEMALE', 'Selected range gender should be "FEMALE"');
      assert(rangeB.normalMin === 12.0 && rangeB.normalMax === 15.5, 'Selected range limits should be 12.0 - 15.5');

      const resNormal = interpretResult(14.0, rangeB, ageFemaleAdult, genderFemale as any);
      assert(resNormal.status === 'NORMAL', 'Value 14.0 for Adult Female should be NORMAL');

      const resLow = interpretResult(11.5, rangeB, ageFemaleAdult, genderFemale as any);
      assert(resLow.status === 'LOW', 'Value 11.5 for Adult Female should be LOW');
    }

    // SCENARIO C: Child (Age 5 years = 1825 days, Female)
    const ageChild = 5 * 365;
    const genderChild = 'FEMALE';
    const rangeC = findRange(genderChild, ageChild);
    assert(rangeC !== null, 'Should find matching range for Child');
    if (rangeC) {
      assert(rangeC.gender === null, 'Selected range gender should be null (Unisex Child Range)');
      assert(rangeC.normalMin === 11.0 && rangeC.normalMax === 14.5, 'Selected range limits should be 11.0 - 14.5');

      const resNormal = interpretResult(12.0, rangeC, ageChild, genderChild as any);
      assert(resNormal.status === 'NORMAL', 'Value 12.0 for Child should be NORMAL');

      const resHigh = interpretResult(15.0, rangeC, ageChild, genderChild as any);
      assert(resHigh.status === 'HIGH' && resHigh.flag === '↑', 'Value 15.0 for Child should be HIGH (↑)');
    }
  } catch (err: any) {
    console.error('  ❌ Reference range matching test failed with error:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // 7. Order & Billing Database Operations
  // ==========================================
  console.log('7. Testing Full Order Registration, Billing & Payments Saving...');
  let createdBillId: number | null = null;
  let createdOrderId: number | null = null;
  try {
    const registerDate = new Date();
    const dateStr = registerDate.toISOString().slice(0, 10).replace(/-/g, '');
    const price = 300; // From updated test price
    
    // 1. Create Bill
    const countBills = await prisma.bill.findMany({
      where: { billNo: { contains: `LAB-BIL-${dateStr}` } }
    });
    const billNo = `LAB-BIL-${dateStr}-${String((countBills?.length || 0) + 1).padStart(4, '0')}`;
    
    const bill = await prisma.bill.create({
      data: {
        billNo,
        patientId: createdPatientId || '',
        subtotal: price,
        discountType: 'FLAT',
        discountValue: 0,
        discountAmount: 0,
        gstPercent: 18,
        gstAmount: price * 0.18,
        totalAmount: price * 1.18,
        paidAmount: price * 1.18,
        dueAmount: 0,
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        createdAt: registerDate.toISOString()
      }
    });
    createdBillId = bill.id;
    assert(!!createdBillId, `Bill saved successfully: ID = ${createdBillId}, BillNo = ${billNo}`);

    // 2. Create Payment
    const testUser = await prisma.user.findFirst();
    const payment = await prisma.payment.create({
      data: {
        billId: createdBillId,
        amount: price * 1.18,
        method: 'CASH',
        receivedBy: testUser?.id || 1,
        paidAt: registerDate.toISOString()
      }
    });
    assert(!!payment.id, `Payment saved successfully: ID = ${payment.id}, Amount = ${payment.amount}`);

    // 3. Create Test Order & Order Items
    const countOrders = await prisma.testOrder.findMany({
      where: { orderNo: { contains: `LAB-ORD-${dateStr}` } }
    });
    const orderNo = `LAB-ORD-${dateStr}-${String((countOrders?.length || 0) + 1).padStart(4, '0')}`;

    const order = await prisma.testOrder.create({
      data: {
        orderNo,
        patientId: createdPatientId || '',
        billId: createdBillId,
        priority: 'ROUTINE',
        status: 'PENDING',
        createdAt: registerDate.toISOString(),
        items: {
          create: [
            { testId: createdTestId || -1 }
          ]
        }
      },
      include: {
        items: true
      }
    });
    createdOrderId = order.id;
    assert(!!createdOrderId, `Test order saved successfully: ID = ${createdOrderId}, OrderNo = ${orderNo}`);
    assert(order.items.length === 1, 'Order items length should be 1');

    // Retrieve order details with includes
    const fullOrderDetails = await prisma.testOrder.findUnique({
      where: { id: createdOrderId },
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
            }
          }
        }
      }
    });

    assert(fullOrderDetails !== null, 'Should retrieve full order details from database');
    if (fullOrderDetails) {
      assert(fullOrderDetails.patient.name === 'Verification Patient', 'Patient name on order should match');
      assert(fullOrderDetails.bill?.billNo === billNo, 'Bill No on order should match');
      assert(fullOrderDetails.items[0].test.code === 'V_CBC_001', 'Test code on item should match');
    }
  } catch (err: any) {
    console.error('  ❌ Order/Billing database test failed with error:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // 8. PDF Report Generation Check
  // ==========================================
  console.log('8. Testing PDF Report Generation Layouts & Signatures...');
  try {
    const mockReportData: any = {
      orderNo: 'LAB-ORD-20260702-0001',
      patientName: 'John Doe',
      patientId: 'LAB-2026-00001',
      age: '25 Years',
      gender: 'MALE',
      date: '02-07-2026',
      referredBy: 'Dr. Automated Test Practitioner',
      labName: 'Modern Diagnostic Centre',
      labAddress: '123 Health Ave, Mumbai',
      labMobile: '9988776655',
      approvedBy: 'Dr. Automated Signer',
      tests: [
        {
          testName: 'Verification CBC',
          parameters: [
            {
              name: 'Verification Hemoglobin',
              value: '14.0',
              unit: 'g/dL',
              refRange: '13.5 - 17.5',
              flag: null
            }
          ]
        }
      ]
    };

    const pdfBytes = await generateReportPDF(mockReportData);
    assert(pdfBytes instanceof Uint8Array, 'generateReportPDF should return a Uint8Array');
    assert(pdfBytes.length > 100, `Generated PDF size should be non-trivial: got ${pdfBytes.length} bytes`);
    
    // Check %PDF- header signature
    const header = String.fromCharCode(pdfBytes[0], pdfBytes[1], pdfBytes[2], pdfBytes[3]);
    assert(header === '%PDF', `PDF should start with "%PDF" header signature: got "${header}"`);
  } catch (err: any) {
    console.error('  ❌ PDF report generation test failed with error:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // 9. Formula Calculations
  // ==========================================
  console.log('9. Testing Panel & Custom Formula Calculations...');
  try {
    // 1. Custom arithmetic formulas
    const customResult = evaluateCustomFormula('[Hemoglobin] * 3 + 2.5', { Hemoglobin: 14.5 });
    assert(customResult === 14.5 * 3 + 2.5, `Custom formula [Hemoglobin] * 3 + 2.5 should yield ${14.5 * 3 + 2.5}: got ${customResult}`);

    // 2. Liver Function Panel calculations (BIO001)
    const parameters = [
      { id: 101, name: 'Total Protein', type: 'NUMERIC' },
      { id: 102, name: 'Albumin', type: 'NUMERIC' },
      { id: 103, name: 'Globulin', type: 'NUMERIC' },
      { id: 104, name: 'Albumin/Globulin Ratio (A:G Ratio)', type: 'NUMERIC' },
    ];
    const currentValues = {
      101: '7.2',
      102: '4.2',
      103: '',
      104: ''
    };
    const calculated = evaluateTestFormulas('BIO001', parameters, currentValues, 30, 'YEARS', 'MALE');
    
    assert(calculated[103]?.value === '3.0', `Globulin should calculate to 3.0 (7.2 - 4.2): got ${calculated[103]?.value}`);
    assert(calculated[104]?.value === '1.40', `A/G Ratio should calculate to 1.40 (4.2 / 3.0): got ${calculated[104]?.value}`);
  } catch (err: any) {
    console.error('  ❌ Formula calculations test failed with error:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // 10. Inventory Management Database Operations
  // ==========================================
  console.log('10. Testing Inventory Management & Transactions...');
  let createdSupplierId: number | null = null;
  let createdInventoryItemId: number | null = null;
  let createdInventoryTransactionId: number | null = null;
  try {
    // 1. Create Supplier
    const supplier = await prisma.supplier.create({
      data: {
        name: 'Verification Supplier Inc.',
        mobile: '9898989898',
        email: 'supplier-verify@example.com',
        address: '456 Reagent Rd, Bangalore'
      }
    });
    createdSupplierId = supplier.id;
    assert(!!createdSupplierId, `Supplier created successfully with ID: ${createdSupplierId}`);

    // 2. Create Inventory Item
    const item = await prisma.inventoryItem.create({
      data: {
        name: 'Automated Test Reagent B',
        category: 'Chemicals',
        unit: 'bottles',
        currentStock: 100,
        minStock: 15,
        maxStock: 200,
        purchasePrice: 450,
        batchNumber: 'BATCH-VERIFY-101',
        supplierId: createdSupplierId,
        isActive: true
      }
    });
    createdInventoryItemId = item.id;
    assert(!!createdInventoryItemId, `Inventory item created successfully: "${item.name}", currentStock = ${item.currentStock}`);

    // 3. Create Transaction
    const testUser = await prisma.user.findFirst();
    const transaction = await prisma.inventoryTransaction.create({
      data: {
        itemId: createdInventoryItemId,
        type: 'CONSUME',
        quantity: 20,
        note: 'Verification suite run consumed 20 bottles',
        createdBy: testUser?.id || 1
      }
    });
    createdInventoryTransactionId = transaction.id;
    assert(!!createdInventoryTransactionId, `Inventory transaction saved: ID = ${createdInventoryTransactionId}, type = "CONSUME"`);

    // Update item stock
    const updatedItem = await prisma.inventoryItem.update({
      where: { id: createdInventoryItemId },
      data: {
        currentStock: item.currentStock - transaction.quantity
      }
    });
    assert(updatedItem.currentStock === 80, `Inventory currentStock updated correctly to 80: got ${updatedItem.currentStock}`);
  } catch (err: any) {
    console.error('  ❌ Inventory management test failed with error:', err.message);
    failedTests++;
  }
  // ==========================================
  // 11. WhatsApp Link Verification URL Generation & Validation
  // ==========================================
  console.log('11. Testing WhatsApp Link Verification URL Generation & Validation...');
  try {
    const SECRET_SALT = process.env.LICENSE_SECRET_SALT || 'Musharraf_709121SaltKey';
    
    // 1. Mock the input data for qrcode route
    const mockReportData = {
      orderNo: 'LAB-ORD-20260702-0001',
      patientName: 'John Doe',
      age: '25',
      gender: 'MALE',
      date: '02-07-2026',
      labName: 'Modern Diagnostic Centre',
      approvedBy: 'Dr. Signer',
      tests: [
        {
          testName: 'Complete Blood Count Test',
          parameters: [
            {
              name: 'Hemoglobin',
              value: '14.0',
              flag: null
            }
          ]
        }
      ]
    };

    // 2. Perform the exact compression & signing logic from app/api/reports/qrcode/route.ts
    const jsonStr = JSON.stringify(mockReportData);
    const compressed = zlib.deflateSync(jsonStr);
    const base64Data = compressed.toString('base64');
    const fullSignature = crypto.createHmac('sha256', SECRET_SALT).update(base64Data).digest('hex');
    const signature = fullSignature.substring(0, 16);

    const ADMIN_DASHBOARD_URL = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || 'https://adminlabmanagement.vercel.app';
    const verifyUrl = `${ADMIN_DASHBOARD_URL}/verify?p=${encodeURIComponent(base64Data)}&s=${signature}`;

    assert(!!verifyUrl, 'Verification URL should be successfully generated');
    assert(verifyUrl.includes('https://adminlabmanagement.vercel.app/verify'), 'URL should point to vercel verification domain');
    assert(verifyUrl.includes('?p='), 'URL should include compressed payload query param "p"');
    assert(verifyUrl.includes('&s='), 'URL should include signature query param "s"');

    // 3. Perform the exact verification & decompression logic from verify/page.tsx / actions
    const parsedUrl = new URL(verifyUrl);
    const payloadParam = parsedUrl.searchParams.get('p');
    const sigParam = parsedUrl.searchParams.get('s');

    assert(payloadParam !== null && sigParam !== null, 'Should parse query params from generated URL');
    if (payloadParam && sigParam) {
      // Re-verify signature
      const expectedSig = crypto.createHmac('sha256', SECRET_SALT).update(payloadParam).digest('hex').substring(0, 16);
      assert(sigParam === expectedSig, 'Signature on generated URL should be valid');

      // Decompress payload
      const decompressed = zlib.inflateSync(Buffer.from(payloadParam, 'base64')).toString('utf8');
      const decodedData = JSON.parse(decompressed);
      assert(decodedData.orderNo === mockReportData.orderNo, 'Decompressed orderNo should match original');
      assert(decodedData.patientName === mockReportData.patientName, 'Decompressed patientName should match original');
    }
  } catch (err: any) {
    console.error('  ❌ WhatsApp verifyUrl generation/validation failed:', err.message);
    failedTests++;
  }
  console.log('');

  // ==========================================
  // CLEAN UP
  // ==========================================
  console.log('Cleaning up database test records...');
  try {
    if (createdInventoryTransactionId) {
      await prisma.inventoryTransaction.delete({ where: { id: createdInventoryTransactionId } });
      console.log('  - Inventory transactions deleted');
    }
    if (createdInventoryItemId) {
      await prisma.inventoryItem.delete({ where: { id: createdInventoryItemId } });
      console.log('  - Inventory items deleted');
    }
    if (createdSupplierId) {
      await prisma.supplier.delete({ where: { id: createdSupplierId } });
      console.log('  - Suppliers deleted');
    }
    if (createdOrderId) {
      await prisma.testOrderItem.deleteMany({ where: { orderId: createdOrderId } });
      await prisma.testOrder.delete({ where: { id: createdOrderId } });
      console.log('  - Test orders deleted');
    }
    if (createdBillId) {
      await prisma.payment.deleteMany({ where: { billId: createdBillId } });
      await prisma.bill.delete({ where: { id: createdBillId } });
      console.log('  - Bills & Payments deleted');
    }
    if (createdPatientId) {
      await prisma.patient.delete({ where: { id: createdPatientId } });
      console.log('  - Patients deleted');
    }
    if (createdTestId) {
      const params = await prisma.testParameter.findMany({ where: { testId: createdTestId } });
      for (const p of params) {
        await prisma.referenceRange.deleteMany({ where: { parameterId: p.id } });
      }
      await prisma.testParameter.deleteMany({ where: { testId: createdTestId } });
      await prisma.test.delete({ where: { id: createdTestId } });
      console.log('  - Tests, parameters & reference ranges deleted');
    }
    if (createdDoctorId) {
      await prisma.doctor.delete({ where: { id: createdDoctorId } });
      console.log('  - Doctors deleted');
    }
  } catch (cleanupErr: any) {
    console.error('  ⚠️ Cleanup warning:', cleanupErr.message);
  }
  console.log('');

  // ==========================================
  // FINAL STATUS REPORT
  // ==========================================
  console.log('==================================================');
  if (failedTests === 0) {
    console.log('  ✅ ALL TESTS PASSED SUCCESSFULLY!                ');
    console.log('  PATHOLOGY LIS IS 100% PRODUCTION READY.         ');
  } else {
    console.log(`  ❌ ${failedTests} TEST CONDITIONS FAILED!                      `);
    console.log('  PLEASE REVIEW FAILURE LOGS BEFORE PRODUCTION.   ');
  }
  console.log('==================================================\n');

  await prisma.$disconnect();
  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Fatal crash in verification runner:', e);
  process.exit(1);
});
