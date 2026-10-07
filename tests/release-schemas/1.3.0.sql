-- CreateTable
CREATE TABLE "LabSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "labName" TEXT NOT NULL,
    "logo" BLOB,
    "address" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "website" TEXT,
    "gstNumber" TEXT,
    "registrationNo" TEXT,
    "reportFooter" TEXT,
    "doctorName" TEXT,
    "doctorQualification" TEXT,
    "doctorRegNo" TEXT,
    "pathologyDoctorName" TEXT,
    "pathologyDoctorQualification" TEXT,
    "pathologyDoctorRegNo" TEXT,
    "technicianName" TEXT,
    "technicianQualification" TEXT,
    "technicianRegNo" TEXT,
    "signature" BLOB,
    "technicianSignature" BLOB,
    "pathologyDoctorSignature" BLOB,
    "stamp" BLOB,
    "printHeader" TEXT,
    "nablNumber" TEXT,
    "printShowLogo" BOOLEAN NOT NULL DEFAULT true,
    "printShowQR" BOOLEAN NOT NULL DEFAULT true,
    "printSignatures" BOOLEAN NOT NULL DEFAULT true,
    "letterhead" BOOLEAN NOT NULL DEFAULT false,
    "letterheadTopMm" INTEGER NOT NULL DEFAULT 40,
    "letterheadBottomMm" INTEGER NOT NULL DEFAULT 20,
    "coSigning" BOOLEAN NOT NULL DEFAULT false,
    "licenseKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "recoveryHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'RECEPTIONIST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" DATETIME,
    "avatar" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "ageUnit" TEXT NOT NULL DEFAULT 'YEARS',
    "gender" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "bloodGroup" TEXT,
    "emergencyContact" TEXT,
    "referredDoctor" TEXT,
    "referredDoctorId" INTEGER,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER NOT NULL,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Patient_referredDoctorId_fkey" FOREIGN KEY ("referredDoctorId") REFERENCES "Doctor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Patient_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Test" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "categoryId" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "duration" INTEGER NOT NULL,
    "sampleType" TEXT NOT NULL,
    "container" TEXT,
    "volume" TEXT,
    "instructions" TEXT,
    "methodology" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPanel" BOOLEAN NOT NULL DEFAULT false,
    "panelTests" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Test_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TestCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestParameter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "testId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'NUMERIC',
    "options" TEXT,
    "formula" TEXT,
    "isHeader" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestParameter_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferenceRange" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parameterId" INTEGER NOT NULL,
    "gender" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "normalMin" REAL,
    "normalMax" REAL,
    "criticalMin" REAL,
    "criticalMax" REAL,
    "textNormal" TEXT,
    "unit" TEXT,
    "interpretation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReferenceRange_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderNo" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "billId" INTEGER,
    "collectedAt" DATETIME,
    "expectedAt" DATETIME,
    "deliveredAt" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "barcodeData" TEXT,
    "qrData" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestOrder_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestOrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "testId" INTEGER NOT NULL,
    "selectedParameters" TEXT,
    "price" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "enteredBy" INTEGER,
    "verifiedBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TestOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestOrderItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderItemId" INTEGER NOT NULL,
    "parameterId" INTEGER NOT NULL,
    "numericValue" REAL,
    "textValue" TEXT,
    "status" TEXT NOT NULL,
    "flag" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "isAbnormal" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredBy" INTEGER NOT NULL,
    CONSTRAINT "TestResult_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "TestOrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "billNo" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "subtotal" REAL NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'FLAT',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "gstPercent" REAL NOT NULL DEFAULT 0,
    "gstAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "dueAmount" REAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "referralCommission" REAL,
    "notes" TEXT,
    "lab" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bill_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "billId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" INTEGER NOT NULL,
    CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "pdfData" BLOB,
    "snapshot" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" INTEGER,
    "approvedAt" DATETIME,
    "deliveredAt" DATETIME,
    "deliveryMethod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Report_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TestOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportAsset" (
    "hash" TEXT NOT NULL PRIMARY KEY,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "qualification" TEXT,
    "hospital" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "commission" REAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "mobile" TEXT,
    "salary" REAL,
    "joinedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" INTEGER,
    "shift" TEXT,
    "shiftStart" TEXT,
    "shiftEnd" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "staffId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "inTime" TEXT,
    "outTime" TEXT,
    "note" TEXT,
    CONSTRAINT "Attendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentStock" REAL NOT NULL,
    "minStock" REAL NOT NULL,
    "maxStock" REAL,
    "expiryDate" DATETIME,
    "supplierId" INTEGER,
    "supplierName" TEXT,
    "batchNumber" TEXT,
    "purchasePrice" REAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER NOT NULL,
    CONSTRAINT "InventoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "details" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "QcResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "testName" TEXT NOT NULL,
    "parameterName" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "expectedValue" REAL NOT NULL,
    "measuredValue" REAL NOT NULL,
    "deviation" REAL NOT NULL,
    "cv" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paidTo" TEXT,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "createdBy" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HomeCollection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientName" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT NOT NULL,
    "tests" TEXT,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assignedTo" INTEGER,
    "assignedName" TEXT,
    "notes" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OutsourceLab" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OutsourcedTest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "labId" INTEGER NOT NULL,
    "patientName" TEXT NOT NULL,
    "orderNo" TEXT,
    "testName" TEXT NOT NULL,
    "cost" REAL NOT NULL DEFAULT 0,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultReceivedAt" DATETIME,
    "notes" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutsourcedTest_labId_fkey" FOREIGN KEY ("labId") REFERENCES "OutsourceLab" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Corporate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Patient_name_idx" ON "Patient"("name");

-- CreateIndex
CREATE INDEX "Patient_mobile_idx" ON "Patient"("mobile");

-- CreateIndex
CREATE INDEX "Patient_registeredAt_idx" ON "Patient"("registeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TestCategory_name_key" ON "TestCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Test_code_key" ON "Test"("code");

-- CreateIndex
CREATE INDEX "TestParameter_testId_idx" ON "TestParameter"("testId");

-- CreateIndex
CREATE INDEX "ReferenceRange_parameterId_idx" ON "ReferenceRange"("parameterId");

-- CreateIndex
CREATE UNIQUE INDEX "TestOrder_orderNo_key" ON "TestOrder"("orderNo");

-- CreateIndex
CREATE INDEX "TestOrder_patientId_idx" ON "TestOrder"("patientId");

-- CreateIndex
CREATE INDEX "TestOrder_status_idx" ON "TestOrder"("status");

-- CreateIndex
CREATE INDEX "TestOrder_createdAt_idx" ON "TestOrder"("createdAt");

-- CreateIndex
CREATE INDEX "TestOrderItem_orderId_idx" ON "TestOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "TestResult_orderItemId_idx" ON "TestResult"("orderItemId");

-- CreateIndex
CREATE INDEX "TestResult_parameterId_idx" ON "TestResult"("parameterId");

-- CreateIndex
CREATE INDEX "TestResult_enteredBy_enteredAt_idx" ON "TestResult"("enteredBy", "enteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_billNo_key" ON "Bill"("billNo");

-- CreateIndex
CREATE INDEX "Bill_patientId_idx" ON "Bill"("patientId");

-- CreateIndex
CREATE INDEX "Bill_createdAt_idx" ON "Bill"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_billId_idx" ON "Payment"("billId");

-- CreateIndex
CREATE INDEX "Payment_receivedBy_paidAt_idx" ON "Payment"("receivedBy", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_orderId_key" ON "Report"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_key" ON "Staff"("userId");

-- CreateIndex
CREATE INDEX "Attendance_staffId_date_idx" ON "Attendance"("staffId", "date");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "HomeCollection_scheduledAt_idx" ON "HomeCollection"("scheduledAt");

-- CreateIndex
CREATE INDEX "HomeCollection_status_idx" ON "HomeCollection"("status");

-- CreateIndex
CREATE INDEX "OutsourcedTest_labId_idx" ON "OutsourcedTest"("labId");

-- CreateIndex
CREATE INDEX "OutsourcedTest_sentAt_idx" ON "OutsourcedTest"("sentAt");

