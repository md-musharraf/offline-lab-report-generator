// ═══════════════════════════════════════════════════════════
// PATHOLOGY LIS — SHARED TYPES
// Single source of truth for all TypeScript types
// ═══════════════════════════════════════════════════════════

// ─── ENUMS ───────────────────────────────────────────────

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  TECHNICIAN = 'TECHNICIAN',
  RECEPTIONIST = 'RECEPTIONIST',
  PHLEBOTOMIST = 'PHLEBOTOMIST',
  ACCOUNTANT = 'ACCOUNTANT',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum AgeUnit {
  YEARS = 'YEARS',
  MONTHS = 'MONTHS',
  DAYS = 'DAYS',
}

export enum OrderStatus {
  REGISTERED = 'REGISTERED',
  SAMPLE_COLLECTED = 'SAMPLE_COLLECTED',
  PROCESSING = 'PROCESSING',
  PARTIAL_RESULT = 'PARTIAL_RESULT',
  COMPLETED = 'COMPLETED',
  VERIFIED = 'VERIFIED',
  APPROVED = 'APPROVED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum SampleStatus {
  PENDING = 'PENDING',
  COLLECTED = 'COLLECTED',
  REJECTED = 'REJECTED',
  PROCESSING = 'PROCESSING',
}

export enum ResultStatus {
  PENDING = 'PENDING',
  ENTERED = 'ENTERED',
  NORMAL = 'NORMAL',
  LOW = 'LOW',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
  PANIC = 'PANIC',
  ABNORMAL = 'ABNORMAL',
}

export enum ParameterType {
  NUMERIC = 'NUMERIC',
  TEXT = 'TEXT',
  DROPDOWN = 'DROPDOWN',
  FORMULA = 'FORMULA',
  HEADER = 'HEADER',
  NARRATIVE = 'NARRATIVE',
}

export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  CARD = 'CARD',
  NEFT = 'NEFT',
  CHEQUE = 'CHEQUE',
  CREDIT = 'CREDIT',
}

export enum PaymentStatus {
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  UNPAID = 'UNPAID',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

export enum DiscountType {
  FLAT = 'FLAT',
  PERCENT = 'PERCENT',
}

export enum Priority {
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  EMERGENCY = 'EMERGENCY',
}

export enum ReportType {
  TABULAR = 'TABULAR',
  NARRATIVE = 'NARRATIVE',
  CULTURE_SENSITIVITY = 'CULTURE_SENSITIVITY',
  URINE_MICROSCOPY = 'URINE_MICROSCOPY',
  CUMULATIVE = 'CUMULATIVE',
}

export enum DeliveryMethod {
  PRINT = 'PRINT',
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PORTAL = 'PORTAL',
}

export enum QCStatus {
  PASS = 'PASS',
  FAIL = 'FAIL',
  WARNING = 'WARNING',
}

export enum CollectionStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  IN_TRANSIT = 'IN_TRANSIT',
  COLLECTED = 'COLLECTED',
  DELIVERED_TO_LAB = 'DELIVERED_TO_LAB',
  CANCELLED = 'CANCELLED',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  HALFDAY = 'HALFDAY',
  LEAVE = 'LEAVE',
  HOLIDAY = 'HOLIDAY',
}

export enum TxType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUST = 'ADJUST',
  EXPIRED = 'EXPIRED',
  RETURN = 'RETURN',
}

export enum BackupType {
  MANUAL = 'MANUAL',
  AUTO = 'AUTO',
  SCHEDULED = 'SCHEDULED',
  CLOUD = 'CLOUD',
}

export enum NotificationType {
  REGISTRATION = 'REGISTRATION',
  SAMPLE_COLLECTED = 'SAMPLE_COLLECTED',
  REPORT_READY = 'REPORT_READY',
  CRITICAL_ALERT = 'CRITICAL_ALERT',
  PAYMENT_DUE = 'PAYMENT_DUE',
  CUSTOM = 'CUSTOM',
}

export enum NotifStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  QUEUED = 'QUEUED',
}

export enum CommissionType {
  FLAT = 'FLAT',
  PERCENT = 'PERCENT',
}

export enum SampleRejectionReason {
  HEMOLYZED = 'HEMOLYZED',
  CLOTTED = 'CLOTTED',
  INSUFFICIENT_VOLUME = 'INSUFFICIENT_VOLUME',
  WRONG_CONTAINER = 'WRONG_CONTAINER',
  UNLABELED = 'UNLABELED',
  LIPEMIC = 'LIPEMIC',
  TEMPERATURE_ISSUE = 'TEMPERATURE_ISSUE',
  OTHER = 'OTHER',
}

// ─── MODEL INTERFACES ────────────────────────────────────

export interface LabSettings {
  id: number;
  labName: string;
  logo: string | null;
  address: string;
  mobile: string;
  email: string | null;
  website: string | null;
  nablNumber: string | null;
  gstNumber: string | null;
  registrationNo: string | null;
  taxPercent: number;
  reportFooter: string | null;
  headerTemplate: string | null;
  doctorName: string | null;
  doctorQualification: string | null;
  doctorRegNo: string | null;
  signature: string | null;
  stamp: string | null;
  printHeader: string | null;
  smsApiKey: string | null;
  smsProvider: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  password?: string;
  role: Role;
  isActive: boolean;
  lastLogin: string | null;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  ageUnit: AgeUnit;
  gender: Gender;
  mobile: string;
  email: string | null;
  address: string | null;
  city: string | null;
  bloodGroup: string | null;
  emergencyContact: string | null;
  referredDoctorId: number | null;
  corporateId: number | null;
  patientType: string;
  isEmergency: boolean;
  createdBy: number;
  registeredAt: string;
  updatedAt: string;
  deletedAt: string | null;
  orders?: TestOrder[];
  bills?: Bill[];
  doctor?: Doctor;
}

export interface TestCategory {
  id: number;
  name: string;
  code: string;
  color: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  tests?: Test[];
  createdAt: string;
  updatedAt: string;
}

export interface Test {
  id: number;
  code: string;
  name: string;
  shortName: string | null;
  categoryId: number;
  category?: TestCategory;
  price: number;
  costPrice: number | null;
  duration: number;
  sampleType: string;
  container: string | null;
  volume: string | null;
  instructions: string | null;
  methodology: string | null;
  reportType: ReportType;
  department: string | null;
  isActive: boolean;
  isPanel: boolean;
  isOutsourced: boolean;
  outsourceLabId: number | null;
  parameters?: TestParameter[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TestParameter {
  id: number;
  testId: number;
  name: string;
  shortName: string | null;
  unit: string | null;
  sortOrder: number;
  type: ParameterType;
  options: string | null;
  formula: string | null;
  isHeader: boolean;
  defaultValue: string | null;
  refRanges?: ReferenceRange[];
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceRange {
  id: number;
  parameterId: number;
  gender: Gender | null;
  ageMin: number | null;
  ageMax: number | null;
  normalMin: number | null;
  normalMax: number | null;
  criticalMin: number | null;
  criticalMax: number | null;
  panicMin: number | null;
  panicMax: number | null;
  textNormal: string | null;
  unit: string | null;
  interpretation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestOrder {
  id: number;
  orderNo: string;
  patientId: string;
  patient?: Patient;
  billId: number | null;
  collectedAt: string | null;
  collectedBy: number | null;
  expectedAt: string | null;
  deliveredAt: string | null;
  priority: Priority;
  status: OrderStatus;
  barcodeData: string | null;
  qrData: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
  report?: Report;
  bill?: Bill;
}

export interface OrderItem {
  id: number;
  orderId: number;
  testId: number;
  test?: Test;
  order?: TestOrder;
  results?: TestResult[];
  status: string;
  sampleStatus: SampleStatus;
  sampleCollectedAt: string | null;
  sampleRejectedReason: string | null;
  enteredBy: number | null;
  verifiedBy: number | null;
  approvedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  id: number;
  orderItemId: number;
  parameterId: number;
  parameter?: TestParameter;
  numericValue: number | null;
  textValue: string | null;
  status: ResultStatus;
  flag: string | null;
  isCritical: boolean;
  isAbnormal: boolean;
  isPanic: boolean;
  criticalAcknowledgedBy: string | null;
  criticalAcknowledgedAt: string | null;
  note: string | null;
  enteredAt: string;
  enteredBy: number;
  amendedFrom: number | null;
  amendmentReason: string | null;
  version: number;
}

export interface Report {
  id: number;
  orderId: number;
  order?: TestOrder;
  reportType: ReportType;
  pdfData: string | null;
  printCount: number;
  version: number;
  approvedBy: number | null;
  approvedAt: string | null;
  verifiedBy: number | null;
  verifiedAt: string | null;
  deliveredAt: string | null;
  deliveryMethod: DeliveryMethod | null;
  doctorComments: string | null;
  isAmended: boolean;
  amendmentReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Doctor {
  id: number;
  name: string;
  qualification: string | null;
  hospital: string | null;
  specialization: string | null;
  mobile: string | null;
  email: string | null;
  commissionType: CommissionType;
  commissionValue: number;
  defaultDiscount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorCommission {
  id: number;
  doctorId: number;
  doctor?: Doctor;
  billId: number;
  orderId: number;
  amount: number;
  isPaid: boolean;
  paidAt: string | null;
  paidReference: string | null;
  createdAt: string;
}

export interface Bill {
  id: number;
  billNo: string;
  patientId: string;
  patient?: Patient;
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  discountReason: string | null;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  dueDate: string | null;
  paymentStatus: PaymentStatus;
  referralCommission: number | null;
  notes: string | null;
  isCancelled: boolean;
  cancelledReason: string | null;
  cancelledAt: string | null;
  cancelledBy: number | null;
  refundAmount: number;
  createdAt: string;
  updatedAt: string;
  orders?: TestOrder[];
  payments?: Payment[];
  items?: BillItem[];
}

export interface BillItem {
  id: number;
  billId: number;
  testId: number;
  test?: Test;
  testName: string;
  price: number;
  quantity: number;
  amount: number;
}

export interface Payment {
  id: number;
  billId: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  receivedBy: number;
}

export interface HealthPackage {
  id: number;
  name: string;
  code: string;
  description: string | null;
  price: number;
  originalPrice: number;
  isActive: boolean;
  tests?: Test[];
  createdAt: string;
  updatedAt: string;
}

export interface Corporate {
  id: number;
  name: string;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
  creditDays: number;
  discountPercent: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HomeCollection {
  id: number;
  orderId: number;
  order?: TestOrder;
  phlebotomistId: number;
  scheduledDate: string;
  scheduledTime: string;
  address: string;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  status: CollectionStatus;
  collectedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutsourceLab {
  id: number;
  name: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QCRecord {
  id: number;
  testId: number;
  test?: Test;
  parameterId: number;
  parameter?: TestParameter;
  batchNo: string | null;
  controlLevel: string;
  expectedValue: number;
  measuredValue: number;
  deviation: number;
  percentCV: number | null;
  status: QCStatus;
  instrument: string | null;
  performedBy: number;
  performedAt: string;
  notes: string | null;
  createdAt: string;
}

export interface Staff {
  id: number;
  name: string;
  role: Role;
  mobile: string | null;
  email: string | null;
  salary: number | null;
  joinedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Attendance {
  id: number;
  staffId: number;
  staff?: Staff;
  date: string;
  status: AttendanceStatus;
  inTime: string | null;
  outTime: string | null;
  note: string | null;
  createdAt: string;
}

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minStock: number;
  maxStock: number | null;
  expiryDate: string | null;
  supplierId: number | null;
  supplier?: Supplier;
  batchNumber: string | null;
  purchasePrice: number | null;
  sellingPrice: number | null;
  isActive: boolean;
  alertSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: number;
  name: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  gst: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: number;
  itemId: number;
  item?: InventoryItem;
  type: TxType;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  note: string | null;
  invoice: string | null;
  createdAt: string;
  createdBy: number;
}

export interface Expenditure {
  id: number;
  category: string;
  description: string;
  amount: number;
  paidTo: string | null;
  paymentMethod: PaymentMethod;
  reference: string | null;
  expenseDate: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: number;
  orderId: number | null;
  type: NotificationType;
  recipient: string;
  channel: string;
  message: string;
  status: NotifStatus;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface ActivityLog {
  id: number;
  userId: number;
  user?: User;
  action: string;
  module: string;
  entityId: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

export interface BackupLog {
  id: number;
  filename: string;
  sizeBytes: number;
  type: BackupType;
  status: string;
  path: string | null;
  createdAt: string;
  createdBy: number;
}

// ─── RESULT INTERPRETATION ───────────────────────────────

export interface InterpretationResult {
  status: ResultStatus;
  flag: '↑↑' | '↓↓' | '↑' | '↓' | '!!' | null;
  isCritical: boolean;
  isPanic: boolean;
  isAbnormal: boolean;
  colorClass: string;
  bgColorClass: string;
  borderClass: string;
  badgeVariant: string;
  label: string;
  shouldAlert: boolean;
}

// ─── DASHBOARD TYPES ─────────────────────────────────────

export interface DashboardStats {
  todayPatients: number;
  pendingResults: number;
  todayRevenue: number;
  criticalCases: number;
  monthlyRevenue: number;
  dueCollection: number;
  reportsDelivered: number;
  testsDoneToday: number;
}

export interface StatusPipeline {
  registered: number;
  collected: number;
  processing: number;
  approved: number;
  delivered: number;
}

// ─── IPC RESPONSE ────────────────────────────────────────

export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── FORM TYPES ──────────────────────────────────────────

export interface PatientFormData {
  name: string;
  age: number;
  ageUnit: AgeUnit;
  gender: Gender;
  mobile: string;
  email?: string;
  address?: string;
  city?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  referredDoctorId?: number;
  corporateId?: number;
  patientType: string;
  isEmergency: boolean;
  tests: number[];
  priority: Priority;
}

export interface BillFormData {
  patientId: string;
  tests: number[];
  discountType: DiscountType;
  discountValue: number;
  discountReason?: string;
  payments: { method: PaymentMethod; amount: number; reference?: string }[];
  notes?: string;
}

export interface ResultEntryData {
  orderItemId: number;
  parameterId: number;
  numericValue?: number;
  textValue?: string;
  note?: string;
}
