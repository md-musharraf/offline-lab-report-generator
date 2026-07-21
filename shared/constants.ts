// ═══════════════════════════════════════════════════════════
// PATHOLOGY LIS — SHARED CONSTANTS
// ═══════════════════════════════════════════════════════════

export const APP_NAME = 'JharLab';
export const APP_VERSION = '3.0.0';

// ─── ID FORMATS ──────────────────────────────────────────

export const PATIENT_ID_PREFIX = 'LAB';
export const BILL_PREFIX = 'BILL';
export const ORDER_PREFIX = 'LAB-ORD';

export function generatePatientId(year: number, sequence: number): string {
  return `${PATIENT_ID_PREFIX}-${year}-${String(sequence).padStart(5, '0')}`;
}

export function generateBillNo(year: number, sequence: number): string {
  return `${BILL_PREFIX}-${year}-${String(sequence).padStart(5, '0')}`;
}

export function generateOrderNo(date: string, sequence: number): string {
  return `${ORDER_PREFIX}-${date}-${String(sequence).padStart(4, '0')}`;
}

// ─── TEST CATEGORY COLORS ────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  HEM: '#EF4444',
  BIO: '#3B82F6',
  SER: '#8B5CF6',
  HOR: '#EC4899',
  URI: '#F59E0B',
  STL: '#78716C',
  MIC: '#10B981',
  HIS: '#6366F1',
  CYT: '#14B8A6',
  MOL: '#F97316',
};

export const CATEGORY_NAMES: Record<string, string> = {
  HEM: 'Hematology',
  BIO: 'Biochemistry',
  SER: 'Serology',
  HOR: 'Hormones',
  URI: 'Urine Analysis',
  STL: 'Stool Analysis',
  MIC: 'Microbiology',
  HIS: 'Histopathology',
  CYT: 'Cytology',
  MOL: 'Molecular',
};

// ─── STATUS COLORS ───────────────────────────────────────

export const ORDER_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  REGISTERED: { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-300 dark:border-blue-700' },
  SAMPLE_COLLECTED: { bg: 'bg-indigo-100 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-700' },
  PROCESSING: { bg: 'bg-yellow-100 dark:bg-yellow-950/50', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-300 dark:border-yellow-700' },
  PARTIAL_RESULT: { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-700' },
  COMPLETED: { bg: 'bg-teal-100 dark:bg-teal-950/50', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-300 dark:border-teal-700' },
  VERIFIED: { bg: 'bg-cyan-100 dark:bg-cyan-950/50', text: 'text-cyan-700 dark:text-cyan-400', border: 'border-cyan-300 dark:border-cyan-700' },
  APPROVED: { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-400', border: 'border-green-300 dark:border-green-700' },
  DELIVERED: { bg: 'bg-emerald-100 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700' },
  CANCELLED: { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-400', border: 'border-red-300 dark:border-red-700' },
};

export const PAYMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PAID: { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-400' },
  PARTIAL: { bg: 'bg-yellow-100 dark:bg-yellow-950/50', text: 'text-yellow-700 dark:text-yellow-400' },
  UNPAID: { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-400' },
  REFUNDED: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-400' },
  CANCELLED: { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-400' },
};

// ─── CURRENCY ────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num);
}

// ─── DATE FORMATS ────────────────────────────────────────

export const DATE_FORMAT = 'dd/MM/yyyy';
export const DATE_TIME_FORMAT = 'dd/MM/yyyy hh:mm a';
export const TIME_FORMAT = 'hh:mm a';
export const API_DATE_FORMAT = 'yyyy-MM-dd';

// ─── SAMPLE CONTAINERS ──────────────────────────────────

export const SAMPLE_CONTAINERS = [
  'EDTA (Purple)',
  'Plain (Red)',
  'Fluoride (Grey)',
  'Citrate (Blue)',
  'Heparin (Green)',
  'Urine Container',
  'Stool Container',
  'Swab',
  'Sputum Container',
  'Blood Culture Bottle',
];

export const SAMPLE_TYPES = [
  'Blood',
  'Serum',
  'Plasma',
  'Urine',
  'Stool',
  'CSF',
  'Sputum',
  'Swab',
  'Tissue',
  'Fluid',
  'Other',
];

// ─── BLOOD GROUPS ────────────────────────────────────────

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// ─── GENDER OPTIONS ──────────────────────────────────────

export const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

// ─── GST ─────────────────────────────────────────────────

export const HSN_CODE = '999315'; // Medical diagnostic services
export const DEFAULT_GST_PERCENT = 18;

// ─── INVENTORY CATEGORIES ────────────────────────────────

export const INVENTORY_CATEGORIES = [
  'REAGENT',
  'TUBE',
  'CHEMICAL',
  'KIT',
  'CONSUMABLE',
  'EQUIPMENT',
];

// ─── EXPENDITURE CATEGORIES ──────────────────────────────

export const EXPENDITURE_CATEGORIES = [
  'SALARY',
  'REAGENT',
  'RENT',
  'EQUIPMENT',
  'MAINTENANCE',
  'UTILITY',
  'MISC',
];
