
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  Serializable: 'Serializable'
});

exports.Prisma.LabSettingsScalarFieldEnum = {
  id: 'id',
  labName: 'labName',
  logo: 'logo',
  address: 'address',
  mobile: 'mobile',
  email: 'email',
  website: 'website',
  gstNumber: 'gstNumber',
  registrationNo: 'registrationNo',
  reportFooter: 'reportFooter',
  doctorName: 'doctorName',
  doctorQualification: 'doctorQualification',
  doctorRegNo: 'doctorRegNo',
  pathologyDoctorName: 'pathologyDoctorName',
  pathologyDoctorQualification: 'pathologyDoctorQualification',
  pathologyDoctorRegNo: 'pathologyDoctorRegNo',
  technicianName: 'technicianName',
  technicianQualification: 'technicianQualification',
  technicianRegNo: 'technicianRegNo',
  signature: 'signature',
  technicianSignature: 'technicianSignature',
  pathologyDoctorSignature: 'pathologyDoctorSignature',
  stamp: 'stamp',
  printHeader: 'printHeader',
  licenseKey: 'licenseKey',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  name: 'name',
  email: 'email',
  password: 'password',
  role: 'role',
  isActive: 'isActive',
  lastLogin: 'lastLogin',
  avatar: 'avatar',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.PatientScalarFieldEnum = {
  id: 'id',
  name: 'name',
  age: 'age',
  ageUnit: 'ageUnit',
  gender: 'gender',
  mobile: 'mobile',
  email: 'email',
  address: 'address',
  bloodGroup: 'bloodGroup',
  emergencyContact: 'emergencyContact',
  referredDoctor: 'referredDoctor',
  referredDoctorId: 'referredDoctorId',
  isEmergency: 'isEmergency',
  createdBy: 'createdBy',
  registeredAt: 'registeredAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.TestCategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  sortOrder: 'sortOrder',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TestScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  shortName: 'shortName',
  categoryId: 'categoryId',
  price: 'price',
  duration: 'duration',
  sampleType: 'sampleType',
  container: 'container',
  volume: 'volume',
  instructions: 'instructions',
  methodology: 'methodology',
  isActive: 'isActive',
  isPanel: 'isPanel',
  panelTests: 'panelTests',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.TestParameterScalarFieldEnum = {
  id: 'id',
  testId: 'testId',
  name: 'name',
  shortName: 'shortName',
  unit: 'unit',
  sortOrder: 'sortOrder',
  type: 'type',
  options: 'options',
  formula: 'formula',
  isHeader: 'isHeader',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReferenceRangeScalarFieldEnum = {
  id: 'id',
  parameterId: 'parameterId',
  gender: 'gender',
  ageMin: 'ageMin',
  ageMax: 'ageMax',
  normalMin: 'normalMin',
  normalMax: 'normalMax',
  criticalMin: 'criticalMin',
  criticalMax: 'criticalMax',
  textNormal: 'textNormal',
  unit: 'unit',
  interpretation: 'interpretation',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TestOrderScalarFieldEnum = {
  id: 'id',
  orderNo: 'orderNo',
  patientId: 'patientId',
  billId: 'billId',
  collectedAt: 'collectedAt',
  expectedAt: 'expectedAt',
  deliveredAt: 'deliveredAt',
  priority: 'priority',
  status: 'status',
  barcodeData: 'barcodeData',
  qrData: 'qrData',
  note: 'note',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TestOrderItemScalarFieldEnum = {
  id: 'id',
  orderId: 'orderId',
  testId: 'testId',
  selectedParameters: 'selectedParameters',
  status: 'status',
  enteredBy: 'enteredBy',
  verifiedBy: 'verifiedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TestResultScalarFieldEnum = {
  id: 'id',
  orderItemId: 'orderItemId',
  parameterId: 'parameterId',
  numericValue: 'numericValue',
  textValue: 'textValue',
  status: 'status',
  flag: 'flag',
  isCritical: 'isCritical',
  isAbnormal: 'isAbnormal',
  note: 'note',
  enteredAt: 'enteredAt',
  enteredBy: 'enteredBy'
};

exports.Prisma.BillScalarFieldEnum = {
  id: 'id',
  billNo: 'billNo',
  patientId: 'patientId',
  subtotal: 'subtotal',
  discountType: 'discountType',
  discountValue: 'discountValue',
  discountAmount: 'discountAmount',
  gstPercent: 'gstPercent',
  gstAmount: 'gstAmount',
  totalAmount: 'totalAmount',
  paidAmount: 'paidAmount',
  dueAmount: 'dueAmount',
  paymentMethod: 'paymentMethod',
  paymentStatus: 'paymentStatus',
  referralCommission: 'referralCommission',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PaymentScalarFieldEnum = {
  id: 'id',
  billId: 'billId',
  amount: 'amount',
  method: 'method',
  reference: 'reference',
  paidAt: 'paidAt',
  receivedBy: 'receivedBy'
};

exports.Prisma.ReportScalarFieldEnum = {
  id: 'id',
  orderId: 'orderId',
  pdfData: 'pdfData',
  printCount: 'printCount',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  deliveredAt: 'deliveredAt',
  deliveryMethod: 'deliveryMethod',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DoctorScalarFieldEnum = {
  id: 'id',
  name: 'name',
  qualification: 'qualification',
  hospital: 'hospital',
  mobile: 'mobile',
  email: 'email',
  commission: 'commission',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StaffScalarFieldEnum = {
  id: 'id',
  name: 'name',
  role: 'role',
  mobile: 'mobile',
  salary: 'salary',
  joinedAt: 'joinedAt',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttendanceScalarFieldEnum = {
  id: 'id',
  staffId: 'staffId',
  date: 'date',
  status: 'status',
  inTime: 'inTime',
  outTime: 'outTime',
  note: 'note'
};

exports.Prisma.InventoryItemScalarFieldEnum = {
  id: 'id',
  name: 'name',
  category: 'category',
  unit: 'unit',
  currentStock: 'currentStock',
  minStock: 'minStock',
  maxStock: 'maxStock',
  expiryDate: 'expiryDate',
  supplierId: 'supplierId',
  batchNumber: 'batchNumber',
  purchasePrice: 'purchasePrice',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierScalarFieldEnum = {
  id: 'id',
  name: 'name',
  mobile: 'mobile',
  email: 'email',
  address: 'address',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InventoryTransactionScalarFieldEnum = {
  id: 'id',
  itemId: 'itemId',
  type: 'type',
  quantity: 'quantity',
  note: 'note',
  createdAt: 'createdAt',
  createdBy: 'createdBy'
};

exports.Prisma.ActivityLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  action: 'action',
  module: 'module',
  details: 'details',
  ip: 'ip',
  createdAt: 'createdAt'
};

exports.Prisma.BackupLogScalarFieldEnum = {
  id: 'id',
  filename: 'filename',
  sizeBytes: 'sizeBytes',
  type: 'type',
  status: 'status',
  createdAt: 'createdAt',
  createdBy: 'createdBy'
};

exports.Prisma.QcResultScalarFieldEnum = {
  id: 'id',
  testName: 'testName',
  parameterName: 'parameterName',
  batchNumber: 'batchNumber',
  level: 'level',
  expectedValue: 'expectedValue',
  measuredValue: 'measuredValue',
  deviation: 'deviation',
  cv: 'cv',
  status: 'status',
  date: 'date'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  LabSettings: 'LabSettings',
  User: 'User',
  Patient: 'Patient',
  TestCategory: 'TestCategory',
  Test: 'Test',
  TestParameter: 'TestParameter',
  ReferenceRange: 'ReferenceRange',
  TestOrder: 'TestOrder',
  TestOrderItem: 'TestOrderItem',
  TestResult: 'TestResult',
  Bill: 'Bill',
  Payment: 'Payment',
  Report: 'Report',
  Doctor: 'Doctor',
  Staff: 'Staff',
  Attendance: 'Attendance',
  InventoryItem: 'InventoryItem',
  Supplier: 'Supplier',
  InventoryTransaction: 'InventoryTransaction',
  ActivityLog: 'ActivityLog',
  BackupLog: 'BackupLog',
  QcResult: 'QcResult'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
