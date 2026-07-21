// lib/db.ts
// Database abstraction layer that works both in Electron (via IPC) and in the browser (mock data in localStorage)

import { defaultTests } from './default-tests';

const CATEGORY_MAP: Record<string, number> = {
  'Hematology': 1,
  'Biochemistry': 2,
  'Serology': 3,
  'Microbiology': 4,
  'Clinical Pathology': 5,
  'Immunology': 6
};

// Map defaultTests to match our database model
const MOCK_TESTS: any[] = defaultTests.map((t, tIdx) => {
  const testId = tIdx + 1;
  return {
    id: testId,
    code: t.code,
    name: t.name,
    shortName: t.shortName || '',
    price: t.price,
    categoryId: CATEGORY_MAP[t.category] || 1,
    isActive: true,
    duration: t.duration || 1,
    sampleType: t.sampleType || 'Whole Blood',
    container: t.container || 'Purple Cap',
    parameters: (t.parameters || []).map((p, pIdx) => {
      const paramId = testId * 1000 + pIdx + 1; // Unique parameter ID
      return {
        id: paramId,
        testId: testId,
        name: p.name,
        unit: p.unit || '',
        sortOrder: p.sortOrder || (pIdx + 1),
        type: p.type || 'NUMERIC',
        options: p.options || null,
        isHeader: p.isHeader || false,
        refRanges: (p.refRanges || []).map((r, rIdx) => ({
          id: paramId * 100 + rIdx + 1,
          parameterId: paramId,
          gender: r.gender || null,
          normalMin: r.normalMin !== undefined ? r.normalMin : null,
          normalMax: r.normalMax !== undefined ? r.normalMax : null,
          criticalMin: r.criticalMin !== undefined ? r.criticalMin : null,
          criticalMax: r.criticalMax !== undefined ? r.criticalMax : null,
          textNormal: r.textNormal || null
        }))
      };
    })
  };
});

const MOCK_PATIENTS = [
  {
    id: 'LAB-2024-00001',
    name: 'Rajesh Kumar',
    age: 45,
    ageUnit: 'YEARS',
    gender: 'MALE',
    mobile: '9876543210',
    email: 'rajesh@example.com',
    address: '123 MG Road, Mumbai',
    bloodGroup: 'B+',
    emergencyContact: null,
    isEmergency: false,
    referredDoctor: null,
    referredDoctorId: 1,
    createdBy: 1,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'LAB-2024-00002',
    name: 'Priya Sharma',
    age: 32,
    ageUnit: 'YEARS',
    gender: 'FEMALE',
    mobile: '9123456789',
    email: 'priya@example.com',
    address: '456 Park Street, Delhi',
    bloodGroup: 'O+',
    emergencyContact: null,
    isEmergency: false,
    referredDoctor: null,
    referredDoctorId: 2,
    createdBy: 1,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'LAB-2024-00003',
    name: 'Amit Patel',
    age: 28,
    ageUnit: 'YEARS',
    gender: 'MALE',
    mobile: '9988776655',
    email: null,
    address: '789 Station Road, Ahmedabad',
    bloodGroup: 'A+',
    emergencyContact: 'Sita Patel - 9988776644',
    isEmergency: true,
    referredDoctor: 'Dr. Mehta',
    referredDoctorId: 3,
    createdBy: 1,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_DOCTORS = [
  { id: 1, name: 'Dr. Ramesh Gupta', qualification: 'MBBS, MD', hospital: 'City Hospital', mobile: '9876543201', email: 'ramesh@cityhospital.com', commission: 10, type: 'PERCENT', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 2, name: 'Dr. Anjali Verma', qualification: 'MBBS, DM', hospital: 'Apollo Clinic', mobile: '9876543202', email: 'anjali@apollo.com', commission: 15, type: 'PERCENT', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 3, name: 'Dr. Suresh Reddy', qualification: 'MBBS', hospital: 'Reddy Nursing Home', mobile: '9876543203', email: '', commission: 12, type: 'PERCENT', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 4, name: 'Dr. Fatima Khan', qualification: 'MBBS, MD Pathology', hospital: 'Khan Diagnostics', mobile: '9876543204', email: 'fatima@khandiag.com', commission: 8, type: 'PERCENT', isActive: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const MOCK_CATEGORIES = [
  { id: 1, name: 'Hematology', description: 'Blood tests', sortOrder: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 2, name: 'Biochemistry', description: 'Chemical processes', sortOrder: 2, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 3, name: 'Serology', description: 'Serological tests', sortOrder: 3, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 4, name: 'Microbiology', description: 'Microbiology tests', sortOrder: 4, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 5, name: 'Clinical Pathology', description: 'Clinical tests', sortOrder: 5, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 6, name: 'Immunology', description: 'Immunological tests', sortOrder: 6, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

// Helper functions for localStorage fallback
const STORAGE_PREFIX = 'pathology_lab_db_';

function getStorageData(key: string, defaultData: any) {
  if (typeof window === 'undefined') return defaultData;
  const stored = localStorage.getItem(STORAGE_PREFIX + key);
  if (!stored) {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(defaultData));
    return defaultData;
  }
  try {
    const parsed = JSON.parse(stored);
    if (key === 'test' && Array.isArray(parsed)) {
      let hasChanges = false;
      let updated = parsed.map((t: any) => {
        if (t.code === 'HEM002' && t.price === 120) {
          hasChanges = true;
          return { ...t, price: 70 };
        }
        // Repair tests that have missing or empty parameters
        if (!t.parameters || !Array.isArray(t.parameters) || t.parameters.length === 0) {
          const defTest = defaultData.find((d: any) => d.code === t.code);
          if (defTest && defTest.parameters && defTest.parameters.length > 0) {
            hasChanges = true;
            return { ...t, parameters: defTest.parameters };
          }
        } else {
          // Ensure all parameters have proper IDs
          let paramFixed = false;
          const fixedParams = t.parameters.map((p: any, pIdx: number) => {
            if (!p.id) {
              paramFixed = true;
              const paramId = (t.id || 0) * 1000 + pIdx + 1;
              return {
                ...p,
                id: paramId,
                testId: t.id,
                refRanges: (p.refRanges || []).map((r: any, rIdx: number) => ({
                  ...r,
                  id: r.id || (paramId * 100 + rIdx + 1),
                  parameterId: paramId
                }))
              };
            }
            return p;
          });
          if (paramFixed) {
            hasChanges = true;
            return { ...t, parameters: fixedParams };
          }
        }
        return t;
      });
      defaultData.forEach((defTest: any) => {
        if (!updated.some((t: any) => t.code === defTest.code)) {
          updated.push(defTest);
          hasChanges = true;
        }
      });
      if (hasChanges) {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(updated));
        return updated;
      }
      return updated;
    }
    return parsed;
  } catch (e) {
    return defaultData;
  }
}

function setStorageData(key: string, data: any) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
}

function matches(item: any, query: any): boolean {
  if (!query) return true;
  for (const key in query) {
    const val = query[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if ('equals' in val) {
        if (item[key] !== val.equals) return false;
      } else if ('in' in val) {
        if (!val.in.includes(item[key])) return false;
      } else if ('not' in val) {
        if (item[key] === val.not) return false;
      } else if ('contains' in val) {
        const itemVal = item[key] || '';
        if (!itemVal.toString().toLowerCase().includes(val.contains.toLowerCase())) return false;
      } else if ('startsWith' in val) {
        const itemVal = item[key] || '';
        if (!itemVal.toString().startsWith(val.startsWith)) return false;
      } else if ('endsWith' in val) {
        const itemVal = item[key] || '';
        if (!itemVal.toString().endsWith(val.endsWith)) return false;
      } else if ('gt' in val) {
        if (!(item[key] > val.gt)) return false;
      } else if ('gte' in val) {
        if (!(item[key] >= val.gte)) return false;
      } else if ('lt' in val) {
        if (!(item[key] < val.lt)) return false;
      } else if ('lte' in val) {
        if (!(item[key] <= val.lte)) return false;
      } else {
        // Nested relation match
        if (!item[key] || !matches(item[key], val)) return false;
      }
    } else {
      if (item[key] !== val) return false;
    }
  }
  return true;
}

function resolveRelations(model: string, item: any, include: any): any {
  if (!item || !include) return item;
  const result = { ...item };
  
  // Unpack Prisma-style 'include' wrapper if present
  const queryInclude = include.include ? include.include : include;

  if (model === 'patient') {
    if (queryInclude.orders) {
      const allOrders = getStorageData('testOrder', []);
      result.orders = allOrders
        .filter((o: any) => o.patientId === item.id)
        .map((o: any) => resolveRelations('testOrder', o, queryInclude.orders === true ? {} : queryInclude.orders));
    }
    if (queryInclude.bills) {
      const allBills = getStorageData('bill', []);
      result.bills = allBills
        .filter((b: any) => b.patientId === item.id)
        .map((b: any) => resolveRelations('bill', b, queryInclude.bills === true ? {} : queryInclude.bills));
    }
    if (queryInclude.doctor) {
      const allDoctors = getStorageData('doctor', []);
      result.doctor = allDoctors.find((d: any) => d.id === item.referredDoctorId) || null;
    }
  }

  if (model === 'test') {
    if (queryInclude.category) {
      const allCategories = getStorageData('testCategory', []);
      result.category = allCategories.find((c: any) => c.id === item.categoryId) || null;
    }
    // Ensure parameters are always present (they are embedded in MOCK_TESTS)
    // If 'parameters' is requested in include, make sure refRanges are resolved too
    if (queryInclude.parameters) {
      // Parameters are already embedded in the test object from MOCK_TESTS/localStorage
      // But ensure they have proper IDs and structure
      if (result.parameters && Array.isArray(result.parameters)) {
        result.parameters = result.parameters.map((p: any, pIdx: number) => {
          const param = { ...p };
          // Ensure parameter has an ID
          if (!param.id) {
            param.id = (result.id || 0) * 1000 + pIdx + 1;
          }
          // Ensure refRanges are present
          if (!param.refRanges) {
            param.refRanges = [];
          }
          // Ensure each refRange has an ID
          if (Array.isArray(param.refRanges)) {
            param.refRanges = param.refRanges.map((r: any, rIdx: number) => {
              if (!r.id) {
                return { ...r, id: param.id * 100 + rIdx + 1, parameterId: param.id };
              }
              return r;
            });
          }
          return param;
        });
      } else {
        result.parameters = [];
      }
    }
  }

  if (model === 'testOrder') {
    if (queryInclude.patient) {
      const allPatients = getStorageData('patient', []);
      result.patient = allPatients.find((p: any) => p.id === item.patientId) || null;
    }
    if (queryInclude.bill) {
      const allBills = getStorageData('bill', []);
      result.bill = allBills.find((b: any) => b.id === item.billId) || null;
    }
    if (queryInclude.items) {
      const allItems = getStorageData('testOrderItem', []);
      result.items = allItems
        .filter((oi: any) => oi.orderId === item.id)
        .map((oi: any) => resolveRelations('testOrderItem', oi, queryInclude.items === true ? {} : queryInclude.items));
    }
    if (queryInclude.report) {
      const allReports = getStorageData('report', []);
      result.report = allReports.find((r: any) => r.orderId === item.id) || null;
    }
  }

  if (model === 'testOrderItem') {
    if (queryInclude.test) {
      const allTests = getStorageData('test', []);
      const t = allTests.find((t: any) => t.id === item.testId);
      result.test = t ? resolveRelations('test', t, queryInclude.test === true ? {} : queryInclude.test) : null;
    }
    if (queryInclude.results) {
      const allResults = getStorageData('testResult', []);
      result.results = allResults.filter((r: any) => r.orderItemId === item.id);
    }
    if (queryInclude.order) {
      const allOrders = getStorageData('testOrder', []);
      result.order = allOrders.find((o: any) => o.id === item.orderId) || null;
    }
  }

  if (model === 'bill') {
    if (queryInclude.patient) {
      const allPatients = getStorageData('patient', []);
      result.patient = allPatients.find((p: any) => p.id === item.patientId) || null;
    }
    if (queryInclude.orders) {
      const allOrders = getStorageData('testOrder', []);
      result.orders = allOrders
        .filter((o: any) => o.billId === item.id)
        .map((o: any) => resolveRelations('testOrder', o, queryInclude.orders === true ? {} : queryInclude.orders));
    }
    if (queryInclude.payments) {
      const allPayments = getStorageData('payment', []);
      result.payments = allPayments.filter((p: any) => p.billId === item.id);
    }
  }

  if (model === 'doctor') {
    if (queryInclude.patients) {
      const allPatients = getStorageData('patient', []);
      result.patients = allPatients.filter((p: any) => p.referredDoctorId === item.id);
    }
  }

  return result;
}

// Relational localStorage mock engine
async function mockQuery(model: string, action: string, args?: any): Promise<any> {
  console.log(`[Mock DB Storage] ${model}.${action}`, args);
  
  const defaultMap: Record<string, any> = {
    patient: MOCK_PATIENTS,
    doctor: MOCK_DOCTORS,
    testCategory: MOCK_CATEGORIES,
    test: MOCK_TESTS,
    bill: [],
    testOrder: [],
    testOrderItem: [],
    testResult: [],
    payment: [],
    report: [],
    user: [{ id: 1, name: 'Admin', email: 'admin@citypathlab.com', role: 'Super Admin', isActive: true }],
    labSettings: [
      {
        id: 1,
        labName: 'City Pathology Lab',
        address: '123, Medical Complex, MG Road, Mumbai, Maharashtra - 400001',
        mobile: '+91 9876543210',
        email: 'info@citypathlab.com',
        website: 'www.citypathlab.com',
        gstNumber: '27AADCB1234M1Z5',
        registrationNo: 'LAB/REG/2024/001',
        reportFooter: 'This is a computer-generated report. Results should be correlated clinically.',
        doctorName: 'Dr. Rajesh Pathak',
        printHeader: 'City Pathology Lab — NABL Accredited'
      }
    ],
    backupLog: [
      { id: 1, filename: 'backup_20260520_080000.zip', sizeBytes: 14200000, type: 'AUTO', status: 'SUCCESS', createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), createdBy: 1 },
      { id: 2, filename: 'backup_20260519_200000.zip', sizeBytes: 13800000, type: 'SCHEDULED', status: 'SUCCESS', createdAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(), createdBy: 1 },
      { id: 3, filename: 'backup_20260519_080000.zip', sizeBytes: 13500000, type: 'AUTO', status: 'SUCCESS', createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), createdBy: 1 },
      { id: 4, filename: 'backup_20260518_manual.zip', sizeBytes: 13100000, type: 'MANUAL', status: 'SUCCESS', createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(), createdBy: 1 }
    ]
  };
  
  let list = getStorageData(model, defaultMap[model] || []);

  if (action === 'findMany') {
    let filtered = list.filter((item: any) => matches(item, args?.where));
    
    if (args?.orderBy) {
      const orderKeys = Object.keys(args.orderBy);
      if (orderKeys.length > 0) {
        const key = orderKeys[0];
        const dir = args.orderBy[key];
        filtered.sort((a: any, b: any) => {
          let valA = a[key];
          let valB = b[key];
          // Handle undefined/null values - push them to the end
          if (valA == null && valB == null) return 0;
          if (valA == null) return 1;
          if (valB == null) return -1;
          if (typeof valA === 'string') {
            return dir === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
          } else {
            return dir === 'desc' ? valB - valA : valA - valB;
          }
        });
      }
    }
    
    if (args?.skip !== undefined) {
      filtered = filtered.slice(args.skip);
    }
    if (args?.take !== undefined) {
      filtered = filtered.slice(0, args.take);
    }
    
    if (args?.include) {
      filtered = filtered.map((item: any) => resolveRelations(model, item, args.include));
    }
    return filtered;
  }
  
  if (action === 'findFirst' || action === 'findUnique') {
    const item = list.find((item: any) => matches(item, args?.where));
    if (!item) return null;
    if (args?.include) {
      return resolveRelations(model, item, args.include);
    }
    return item;
  }
  
  if (action === 'count') {
    const filtered = list.filter((item: any) => matches(item, args?.where));
    return filtered.length;
  }
  
  if (action === 'create') {
    const newRecord = { ...args.data };
    
    if (!newRecord.id) {
      if (model === 'patient') {
        const year = new Date().getFullYear();
        let maxSeq = 0;
        list.forEach((p: any) => {
          const parts = p.id.split('-');
          if (parts.length === 3) {
            const seq = parseInt(parts[2], 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
        });
        newRecord.id = `LAB-${year}-${String(maxSeq + 1).padStart(5, '0')}`;
      } else if (model === 'testOrder') {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        let maxSeq = 0;
        list.forEach((o: any) => {
          const parts = o.orderNo?.split('-');
          if (parts && parts.length === 4) {
            const seq = parseInt(parts[3], 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
        });
        newRecord.id = list.length > 0 ? Math.max(...list.map((x: any) => x.id)) + 1 : 1;
        newRecord.orderNo = `LAB-ORD-${dateStr}-${String(maxSeq + 1).padStart(4, '0')}`;
      } else if (model === 'bill') {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        let maxSeq = 0;
        list.forEach((b: any) => {
          const parts = b.billNo?.split('-');
          if (parts && parts.length === 4) {
            const seq = parseInt(parts[3], 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
        });
        newRecord.id = list.length > 0 ? Math.max(...list.map((x: any) => x.id)) + 1 : 1;
        newRecord.billNo = `LAB-BIL-${dateStr}-${String(maxSeq + 1).padStart(4, '0')}`;
      } else {
        newRecord.id = list.length > 0 ? Math.max(...list.map((x: any) => x.id)) + 1 : 1;
      }
    }
    
    newRecord.createdAt = new Date().toISOString();
    newRecord.updatedAt = new Date().toISOString();
    
    // Set registeredAt for patient model (mirrors Prisma @default(now()))
    if (model === 'patient' && !newRecord.registeredAt) {
      newRecord.registeredAt = newRecord.createdAt;
    }
    
    // Handle nested writes for test parameters in test creation
    if (model === 'test' && newRecord.parameters && Array.isArray(newRecord.parameters)) {
      newRecord.parameters = newRecord.parameters.map((p: any, pIdx: number) => {
        const paramId = p.id || (newRecord.id * 1000 + pIdx + 1);
        return {
          ...p,
          id: paramId,
          testId: newRecord.id,
          sortOrder: p.sortOrder || (pIdx + 1),
          type: p.type || 'NUMERIC',
          isHeader: p.isHeader || false,
          refRanges: (p.refRanges || []).map((r: any, rIdx: number) => ({
            ...r,
            id: r.id || (paramId * 100 + rIdx + 1),
            parameterId: paramId,
            gender: r.gender || null,
            normalMin: r.normalMin !== undefined && r.normalMin !== '' && r.normalMin !== null ? Number(r.normalMin) : null,
            normalMax: r.normalMax !== undefined && r.normalMax !== '' && r.normalMax !== null ? Number(r.normalMax) : null,
            criticalMin: r.criticalMin !== undefined && r.criticalMin !== '' && r.criticalMin !== null ? Number(r.criticalMin) : null,
            criticalMax: r.criticalMax !== undefined && r.criticalMax !== '' && r.criticalMax !== null ? Number(r.criticalMax) : null,
            textNormal: r.textNormal || null
          }))
        };
      });
    }
    
    // Support nested writes for items in order creation
    if (model === 'testOrder' && args.data.items?.create) {
      const itemsToCreate = Array.isArray(args.data.items.create) ? args.data.items.create : [args.data.items.create];
      delete newRecord.items;
      
      const allOrderItems = getStorageData('testOrderItem', []);
      itemsToCreate.forEach((itemData: any) => {
        const newItem = {
          id: allOrderItems.length > 0 ? Math.max(...allOrderItems.map((x: any) => x.id)) + 1 : 1,
          orderId: newRecord.id,
          testId: itemData.testId,
          selectedParameters: itemData.selectedParameters || null,
          status: itemData.status || 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        allOrderItems.push(newItem);
      });
      setStorageData('testOrderItem', allOrderItems);
    }
    
    list.push(newRecord);
    setStorageData(model, list);
    
    if (args?.include) {
      return resolveRelations(model, newRecord, args.include);
    }
    return newRecord;
  }
  
  if (action === 'update') {
    const index = list.findIndex((item: any) => matches(item, args?.where));
    if (index === -1) return null;
    
    const record = list[index];
    const updateData = { ...args.data };
    
    // Handle nested parameter updates for test model
    if (model === 'test' && updateData.parameters && Array.isArray(updateData.parameters)) {
      const testId = record.id;
      updateData.parameters = updateData.parameters.map((p: any, pIdx: number) => {
        const paramId = p.id || (testId * 1000 + pIdx + 1);
        return {
          ...p,
          id: paramId,
          testId: testId,
          sortOrder: p.sortOrder || (pIdx + 1),
          type: p.type || 'NUMERIC',
          isHeader: p.isHeader || false,
          refRanges: (p.refRanges || []).map((r: any, rIdx: number) => ({
            ...r,
            id: r.id || (paramId * 100 + rIdx + 1),
            parameterId: paramId,
            gender: r.gender || null,
            normalMin: r.normalMin !== undefined && r.normalMin !== '' && r.normalMin !== null ? Number(r.normalMin) : null,
            normalMax: r.normalMax !== undefined && r.normalMax !== '' && r.normalMax !== null ? Number(r.normalMax) : null,
            criticalMin: r.criticalMin !== undefined && r.criticalMin !== '' && r.criticalMin !== null ? Number(r.criticalMin) : null,
            criticalMax: r.criticalMax !== undefined && r.criticalMax !== '' && r.criticalMax !== null ? Number(r.criticalMax) : null,
            textNormal: r.textNormal || null
          }))
        };
      });
    }
    
    const updated = {
      ...record,
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    list[index] = updated;
    setStorageData(model, list);
    
    if (args?.include) {
      return resolveRelations(model, updated, args.include);
    }
    return updated;
  }
  
  if (action === 'delete') {
    const record = list.find((item: any) => matches(item, args?.where));
    if (!record) return null;
    
    list = list.filter((item: any) => !matches(item, args?.where));
    setStorageData(model, list);
    return record;
  }
  
  if (action === 'upsert') {
    const item = list.find((item: any) => matches(item, args?.where));
    if (item) {
      return mockQuery(model, 'update', { where: args.where, data: args.update, include: args.include });
    } else {
      return mockQuery(model, 'create', { data: args.create, include: args.include });
    }
  }

  return null;
}

export const db = {
  query: async (model: string, action: string, args?: any) => {
    let result;
    if (isElectron()) {
      try {
        const response = await (window as any).electronAPI.dbQuery({ model, action, args });
        if (response && response.success) {
          result = response.data;
        } else {
          console.error(`DB Error: ${response?.error}`);
          throw new Error(response?.error || 'Unknown database error');
        }
      } catch (error) {
        console.error('IPC DB query failed:', error);
        throw error;
      }
    } else {
      // Browser mode: query via Next.js API route first
      try {
        if (typeof window !== 'undefined') {
          const response = await fetch('/api/db', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model, action, args }),
          });

          if (response.ok) {
            const resultData = await response.json();
            if (resultData.success) {
              result = resultData.data;
            } else {
              console.warn(`API DB Endpoint returned success=false: ${resultData.error}. Falling back to mock database (localStorage).`);
              result = await mockQuery(model, action, args);
            }
          } else {
            console.warn(`API DB Endpoint returned status ${response.status}. Falling back to mock database (localStorage).`);
            result = await mockQuery(model, action, args);
          }
        } else {
          result = await mockQuery(model, action, args);
        }
      } catch (error) {
        console.warn('Failed to query server database via API endpoint. Falling back to mock database (localStorage). Error:', error);
        result = await mockQuery(model, action, args);
      }
    }

    // Intercept mutation commands when offline to queue for background sync
    if (
      typeof window !== 'undefined' &&
      !window.navigator.onLine &&
      (model === 'patient' || model === 'testOrder') &&
      ['create', 'update', 'upsert'].includes(action) &&
      result &&
      result.id
    ) {
      try {
        const unsyncedStr = localStorage.getItem('pathology_lab_unsynced_items') || '[]';
        const unsynced = JSON.parse(unsyncedStr);
        if (!unsynced.includes(result.id)) {
          unsynced.push(result.id);
          localStorage.setItem('pathology_lab_unsynced_items', JSON.stringify(unsynced));
          
          const logsStr = localStorage.getItem('pathology_lab_sync_logs') || '[]';
          const logs = JSON.parse(logsStr);
          logs.unshift({
            id: Date.now() + Math.random().toString(),
            timestamp: new Date().toISOString(),
            message: `[Offline Mode] Cached ${model === 'patient' ? 'patient' : 'order'} ID "${result.id}" locally. Queued for background cloud sync.`
          });
          if (logs.length > 80) logs.pop();
          localStorage.setItem('pathology_lab_sync_logs', JSON.stringify(logs));
          
          window.dispatchEvent(new Event('storage'));
        }
      } catch (e) {
        console.error('Error queuing offline database sync item', e);
      }
    }

    return result;
  },
};
