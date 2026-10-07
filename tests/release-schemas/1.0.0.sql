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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TestCategory_name_key" ON "TestCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Test_code_key" ON "Test"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TestOrder_orderNo_key" ON "TestOrder"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_billNo_key" ON "Bill"("billNo");

-- CreateIndex
CREATE UNIQUE INDEX "Report_orderId_key" ON "Report"("orderId");

