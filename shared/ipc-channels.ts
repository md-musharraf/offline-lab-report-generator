// ═══════════════════════════════════════════════════════════
// PATHOLOGY LIS — IPC CHANNEL CONSTANTS
// All IPC channels in module:action format
// ═══════════════════════════════════════════════════════════

export const IPC = {
  // Database generic
  DB_QUERY: 'db-query',

  // Patients
  PATIENTS_LIST: 'patients:list',
  PATIENTS_GET_BY_ID: 'patients:getById',
  PATIENTS_CREATE: 'patients:create',
  PATIENTS_UPDATE: 'patients:update',
  PATIENTS_DELETE: 'patients:delete',
  PATIENTS_SEARCH: 'patients:search',
  PATIENTS_NEXT_ID: 'patients:nextId',

  // Billing
  BILLING_LIST: 'billing:list',
  BILLING_GET_BY_ID: 'billing:getById',
  BILLING_CREATE: 'billing:create',
  BILLING_CANCEL: 'billing:cancel',
  BILLING_ADD_PAYMENT: 'billing:addPayment',
  BILLING_DAY_CLOSE: 'billing:dayClose',
  BILLING_NEXT_NO: 'billing:nextNo',

  // Orders
  ORDERS_LIST: 'orders:list',
  ORDERS_GET_BY_ID: 'orders:getById',
  ORDERS_CREATE: 'orders:create',
  ORDERS_UPDATE_STATUS: 'orders:updateStatus',
  ORDERS_NEXT_NO: 'orders:nextNo',

  // Samples
  SAMPLES_GET_QUEUE: 'samples:getQueue',
  SAMPLES_COLLECT: 'samples:collect',
  SAMPLES_REJECT: 'samples:reject',

  // Results
  RESULTS_GET_BY_ORDER: 'results:getByOrder',
  RESULTS_ENTER: 'results:enter',
  RESULTS_SAVE: 'results:save',
  RESULTS_VERIFY: 'results:verify',
  RESULTS_APPROVE: 'results:approve',

  // Reports
  REPORTS_GENERATE: 'reports:generate',
  REPORTS_GET_BY_ORDER: 'reports:getByOrder',
  REPORTS_AMEND: 'reports:amend',
  REPORTS_DELIVER: 'reports:deliver',

  // Doctors
  DOCTORS_LIST: 'doctors:list',
  DOCTORS_CREATE: 'doctors:create',
  DOCTORS_UPDATE: 'doctors:update',
  DOCTORS_DELETE: 'doctors:delete',
  DOCTORS_COMMISSIONS: 'doctors:commissions',

  // Tests
  TESTS_LIST: 'tests:list',
  TESTS_CREATE: 'tests:create',
  TESTS_UPDATE: 'tests:update',
  TESTS_DELETE: 'tests:delete',
  TESTS_GET_PARAMETERS: 'tests:getParameters',
  TESTS_CATEGORIES: 'tests:categories',

  // Inventory
  INVENTORY_LIST: 'inventory:list',
  INVENTORY_CREATE: 'inventory:create',
  INVENTORY_UPDATE: 'inventory:update',
  INVENTORY_UPDATE_STOCK: 'inventory:updateStock',
  INVENTORY_TRANSACTIONS: 'inventory:transactions',
  INVENTORY_LOW_STOCK: 'inventory:lowStock',

  // Suppliers
  SUPPLIERS_LIST: 'suppliers:list',
  SUPPLIERS_CREATE: 'suppliers:create',
  SUPPLIERS_UPDATE: 'suppliers:update',

  // Staff
  STAFF_LIST: 'staff:list',
  STAFF_CREATE: 'staff:create',
  STAFF_UPDATE: 'staff:update',
  STAFF_ATTENDANCE: 'staff:attendance',
  STAFF_MARK_ATTENDANCE: 'staff:markAttendance',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // Analytics
  ANALYTICS_DASHBOARD: 'analytics:dashboard',
  ANALYTICS_REVENUE: 'analytics:revenue',
  ANALYTICS_PATIENTS: 'analytics:patients',
  ANALYTICS_TESTS: 'analytics:tests',
  ANALYTICS_QUALITY: 'analytics:quality',

  // Quality Control
  QC_LIST: 'qc:list',
  QC_CREATE: 'qc:create',
  QC_GET_CHART: 'qc:getChart',

  // Home Collection
  HOME_COLLECTION_LIST: 'home-collection:list',
  HOME_COLLECTION_CREATE: 'home-collection:create',
  HOME_COLLECTION_UPDATE_STATUS: 'home-collection:updateStatus',

  // Outsource
  OUTSOURCE_LIST: 'outsource:list',
  OUTSOURCE_CREATE: 'outsource:create',
  OUTSOURCE_UPDATE: 'outsource:update',

  // Corporate
  CORPORATE_LIST: 'corporate:list',
  CORPORATE_CREATE: 'corporate:create',
  CORPORATE_UPDATE: 'corporate:update',
  CORPORATE_STATEMENT: 'corporate:statement',

  // Expenditure
  EXPENDITURE_LIST: 'expenditure:list',
  EXPENDITURE_CREATE: 'expenditure:create',
  EXPENDITURE_UPDATE: 'expenditure:update',
  EXPENDITURE_DELETE: 'expenditure:delete',

  // Notifications
  NOTIFICATIONS_LIST: 'notifications:list',
  NOTIFICATIONS_SEND: 'notifications:send',
  NOTIFICATIONS_RETRY: 'notifications:retry',

  // Audit
  AUDIT_LIST: 'audit:list',

  // Backup
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_LIST: 'backup:list',

  // Health Packages
  PACKAGES_LIST: 'packages:list',
  PACKAGES_CREATE: 'packages:create',
  PACKAGES_UPDATE: 'packages:update',

  // Print
  PRINT_PDF: 'print-pdf',
  PRINT_THERMAL: 'print-thermal',
  PRINT_BARCODE: 'print-barcode',

  // System
  PING: 'ping',
} as const;

export type IPCChannel = typeof IPC[keyof typeof IPC];
