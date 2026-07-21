"use client";
import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/db';
import { interpretResult } from '@/lib/result-interpreter';
import { evaluateTestFormulas, isCalculated } from '@/lib/formula-evaluator';
import { generateReportPDF, buildReportDataFromDb } from '@/lib/report-pdf';
import { AppLayout } from '@/components/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Stethoscope, Beaker, FileText, Printer, Download, Plus, 
  Trash2, ArrowRight, ArrowLeft, CheckCircle, Save, AlertTriangle, Search, Activity,
  Eye, X as XIcon
} from 'lucide-react';
import { formatCurrency } from '@/shared/constants';

type Step = 1 | 2 | 3;

const formatRefRange = (param: any) => {
  if (!param.refRanges || param.refRanges.length === 0) return '';
  return param.refRanges.map((r: any) => {
    const prefix = r.gender ? `${r.gender === 'MALE' ? 'M' : 'F'}: ` : '';
    if (r.textNormal) return `${prefix}${r.textNormal}`;
    if (r.normalMin !== null && r.normalMax !== null) return `${prefix}${r.normalMin}-${r.normalMax}`;
    if (r.normalMin !== null) return `${prefix}≥${r.normalMin}`;
    if (r.normalMax !== null) return `${prefix}≤${r.normalMax}`;
    return '';
  }).filter(Boolean).join(', ');
};


function QuickRegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPatientId = searchParams?.get('patientId');

  const [currentUser, setCurrentUser] = useState<any>(null);
  
  useEffect(() => {
    const userStr = localStorage.getItem('pathology_lab_current_user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {}
    }
  }, []);
  
  // Navigation & step status
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [labSettings, setLabSettings] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Pre-loaded catalogs
  const [doctors, setDoctors] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);

  // Step 1 Form States
  const [patientName, setPatientName] = useState('');
  const [age, setAge] = useState('');
  const [ageUnit, setAgeUnit] = useState<'YEARS' | 'MONTHS' | 'DAYS'>('YEARS');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [mobile, setMobile] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referredDoctorId, setReferredDoctorId] = useState('');
  const [manualDoctorName, setManualDoctorName] = useState('');
  
  // Test selection states
  const [testSearch, setTestSearch] = useState('');
  const [selectedTests, setSelectedTests] = useState<any[]>([]);
  const [selectedParameters, setSelectedParameters] = useState<Record<number, number[]>>({});
  const [showTestDropdown, setShowTestDropdown] = useState(false);

  // Billing states
  const [discountType, setDiscountType] = useState<'FLAT' | 'PERCENT'>('FLAT');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [gstPercent, setGstPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [paidAmount, setPaidAmount] = useState<number>(0);

  // Step 2: Created Order Details & Parameter Inputs
  const [createdOrder, setCreatedOrder] = useState<any>(null);
  const [parameterResults, setParameterResults] = useState<Record<number, { value: string; statusObj: any }>>({});
  // Track parameters manually overridden by user
  const [overriddenParams, setOverriddenParams] = useState<Record<number, boolean>>({});

  // Existing Patient Search States
  const [existingPatient, setExistingPatient] = useState<any>(null);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [isExistingMode, setIsExistingMode] = useState(false);

  const resetPatientFields = () => {
    setPatientName('');
    setAge('');
    setAgeUnit('YEARS');
    setGender('MALE');
    setMobile('');
    setReferredDoctorId('');
    setManualDoctorName('');
  };

  const handleSelectExistingPatient = (p: any) => {
    setExistingPatient(p);
    setPatientName(p.name);
    setAge(String(p.age));
    setAgeUnit(p.ageUnit || 'YEARS');
    setGender(p.gender || 'MALE');
    setMobile(p.mobile || '');
    if (p.referredDoctorId) {
      setReferredDoctorId(String(p.referredDoctorId));
      setManualDoctorName(p.referredDoctor || '');
    } else if (p.referredDoctor && p.referredDoctor !== 'Self') {
      setReferredDoctorId('manual');
      setManualDoctorName(p.referredDoctor);
    } else {
      setReferredDoctorId('');
      setManualDoctorName('');
    }
    setShowPatientDropdown(false);
  };

  // Search filter for patients
  const searchResults = useMemo(() => {
    const q = patientSearch.toLowerCase().trim();
    if (!q) {
      return allPatients.slice(0, 10);
    }
    let matched = allPatients.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.mobile || '').includes(q)
    );

    // Prioritize prefix and word-start matches
    matched = [...matched].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      const idA = (a.id || '').toLowerCase();
      const idB = (b.id || '').toLowerCase();
      const mobileA = a.mobile || '';
      const mobileB = b.mobile || '';

      const aStarts = nameA.startsWith(q) || idA.startsWith(q) || mobileA.startsWith(q);
      const bStarts = nameB.startsWith(q) || idB.startsWith(q) || mobileB.startsWith(q);

      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      const aWordStarts = nameA.split(/\s+/).some((w: string) => w.startsWith(q));
      const bWordStarts = nameB.split(/\s+/).some((w: string) => w.startsWith(q));

      if (aWordStarts && !bWordStarts) return -1;
      if (!aWordStarts && bWordStarts) return 1;

      return 0;
    });

    return matched;
  }, [allPatients, patientSearch]);

  // ─── EFFECTS ───────────────────────────────────────────
  
  // Load doctors, tests, and patients catalogs
  useEffect(() => {
    async function loadCatalog() {
      try {
        const doctorsList = await db.query('doctor', 'findMany', { where: { isActive: true } });
        const testsList = await db.query('test', 'findMany', { 
          where: { isActive: true }, 
          include: { 
            category: true,
            parameters: {
              include: { refRanges: true }
            }
          } 
        });
        const patientsList = await db.query('patient', 'findMany', {
          orderBy: { registeredAt: 'desc' }
        });
        setDoctors(doctorsList || []);
        setTests(testsList || []);
        setAllPatients(patientsList || []);

        // Load lab profile settings
        const settings = await db.query('labSettings', 'findFirst', { where: { id: 1 } });
        let mergedSettings = settings || {};
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('pathology_lab_general_settings');
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              mergedSettings = { ...mergedSettings, ...parsed };
            } catch (e) {
              console.error('Failed to parse general settings', e);
            }
          }
        }
        setLabSettings(mergedSettings);

        if (initialPatientId && patientsList) {
          const matchedPatient = patientsList.find((p: any) => p.id === initialPatientId);
          if (matchedPatient) {
            setIsExistingMode(true);
            setExistingPatient(matchedPatient);
            setPatientName(matchedPatient.name);
            setAge(String(matchedPatient.age));
            setAgeUnit(matchedPatient.ageUnit || 'YEARS');
            setGender(matchedPatient.gender || 'MALE');
            setMobile(matchedPatient.mobile || '');
            if (matchedPatient.referredDoctorId) {
              setReferredDoctorId(String(matchedPatient.referredDoctorId));
              setManualDoctorName(matchedPatient.referredDoctor || '');
            } else if (matchedPatient.referredDoctor && matchedPatient.referredDoctor !== 'Self') {
              setReferredDoctorId('manual');
              setManualDoctorName(matchedPatient.referredDoctor);
            } else {
              setReferredDoctorId('');
              setManualDoctorName('');
            }
          }
        }
      } catch (err) {
        console.error("Failed to load catalog data:", err);
      }
    }
    loadCatalog();
  }, [initialPatientId]);

  // Show/Hide toast alerts
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Mapping of parameter names to their standalone test codes
  const PARAM_TO_STANDALONE_CODE: Record<string, string> = {
    // Hematology
    'hemoglobin': 'HEM002',
    'hb': 'HEM002',
    'hemoglobin (hb)': 'HEM002',
    'total wbc count': 'HEM003',
    'wbc': 'HEM003',
    'tlc': 'HEM003',
    'platelet count': 'HEM004',
    'platelets': 'HEM004',
    'absolute eosinophil count': 'HEM010',
    'aec': 'HEM010',
    'eosinophils': 'HEM035',
    'differential eosinophils': 'HEM035',
    
    // Cholesterol / Lipids
    'total cholesterol': 'BIO018',
    'cholesterol': 'BIO018',
    'triglycerides': 'BIO019',
    'hdl cholesterol': 'BIO036',
    'hdl': 'BIO036',
    'ldl cholesterol': 'BIO037',
    'ldl': 'BIO037',
    'vldl cholesterol': 'BIO038',
    'vldl': 'BIO038',

    // Liver Function Test (LFT)
    'total bilirubin': 'BIO013',
    'bilirubin total': 'BIO013',
    'direct bilirubin': 'BIO014',
    'bilirubin direct': 'BIO014',
    'sgot (ast)': 'BIO015',
    'sgot': 'BIO015',
    'ast': 'BIO015',
    'sgpt (alt)': 'BIO016',
    'sgpt': 'BIO016',
    'alt': 'BIO016',
    'alkaline phosphatase': 'BIO017',
    'alp': 'BIO017',
    'total protein': 'BIO045',
    'albumin': 'BIO046',

    // Renal / Kidney Function Test (RFT/KFT)
    'serum creatinine': 'BIO009',
    'creatinine': 'BIO009',
    'blood urea': 'BIO010',
    'urea': 'BIO010',
    'serum uric acid': 'BIO011',
    'uric acid': 'BIO011',

    // Blood Sugar
    'fasting blood sugar': 'BIO005',
    'fbs': 'BIO005',
    'post-prandial glucose': 'BIO006',
    'ppbs': 'BIO006',
    'random blood glucose': 'BIO007',
    'rbs': 'BIO007'
  };

  // Billing Calculation Helper
  const billingCalculations = useMemo(() => {
    const subtotal = selectedTests.reduce((sum, t) => {
      let testPrice = t.price;
      const testParams = t.parameters || [];
      const selectedParamsForTest = selectedParameters[t.id] || [];

      // Check if they only selected a subset of parameters
      const totalNonHeaderParams = testParams.filter((p: any) => !p.isHeader).length;
      if (selectedParamsForTest.length > 0 && selectedParamsForTest.length < totalNonHeaderParams) {
        let standaloneSum = 0;
        let allHaveStandalone = true;
        
        for (const paramId of selectedParamsForTest) {
          const param = testParams.find((p: any) => p.id === paramId);
          if (param) {
            const paramNameLower = param.name.toLowerCase().trim();
            const standaloneCode = PARAM_TO_STANDALONE_CODE[paramNameLower];
            if (standaloneCode) {
              const standaloneTest = tests.find(test => test.code === standaloneCode);
              if (standaloneTest) {
                standaloneSum += standaloneTest.price;
              } else {
                allHaveStandalone = false;
                break;
              }
            } else {
              allHaveStandalone = false;
              break;
            }
          } else {
            allHaveStandalone = false;
            break;
          }
        }
        
        if (allHaveStandalone && standaloneSum > 0) {
          // Charge the minimum of the standalone sum or the full panel price
          testPrice = Math.min(standaloneSum, t.price);
        }
      }

      return sum + testPrice;
    }, 0);


    const discountAmount = discountType === 'FLAT' 
      ? Number(discountValue) || 0
      : (subtotal * (Number(discountValue) || 0)) / 100;
    
    const amountAfterDiscount = Math.max(0, subtotal - discountAmount);
    const gstAmount = (amountAfterDiscount * gstPercent) / 100;
    const totalAmount = amountAfterDiscount + gstAmount;
    const dueAmount = Math.max(0, totalAmount - paidAmount);

    return {
      subtotal,
      discountAmount,
      amountAfterDiscount,
      gstAmount,
      totalAmount,
      dueAmount
    };
  }, [selectedTests, selectedParameters, tests, discountType, discountValue, gstPercent, paidAmount]);

  // Automatically sync paid amount with total amount unless manually modified
  const [isPaidModified, setIsPaidModified] = useState(false);
  useEffect(() => {
    if (!isPaidModified) {
      setPaidAmount(Math.round(billingCalculations.totalAmount));
    }
  }, [billingCalculations.totalAmount, isPaidModified]);

  // Auto-set GST to 18% when first test is added, reset to 0 when all tests removed
  const [gstAutoApplied, setGstAutoApplied] = useState(false);
  useEffect(() => {
    if (selectedTests.length > 0 && !gstAutoApplied) {
      setGstPercent(18);
      setGstAutoApplied(true);
    } else if (selectedTests.length === 0) {
      setGstPercent(0);
      setGstAutoApplied(false);
      setIsPaidModified(false);
    }
  }, [selectedTests.length, gstAutoApplied]);

  // Query normalization & expansion for phonetic/misspelled searches
  const getExpandedQuery = (q: string) => {
    let expanded = [q];
    const qClean = q.toLowerCase().replace(/\s+/g, '');
    if (qClean.includes('esnof') || qClean.includes('esnoph') || qClean.includes('eosin') || qClean.includes('esn')) {
      expanded.push('eosinophil', 'eosinophilia', 'aec');
    }
    if (qClean.includes('colest') || qClean.includes('cholest') || qClean.includes('chol')) {
      expanded.push('cholesterol', 'lipid');
    }
    if (qClean.includes('hemo') || qClean.includes('haemo') || qClean.includes('hb')) {
      expanded.push('hemoglobin', 'haemoglobin');
    }
    if (qClean.includes('plat') || qClean.includes('plt')) {
      expanded.push('platelet', 'platelets');
    }
    if (qClean.includes('bilir') || qClean.includes('bil')) {
      expanded.push('bilirubin');
    }
    if (qClean.includes('sugar') || qClean.includes('glu') || qClean.includes('fast') || qClean.includes('random')) {
      expanded.push('sugar', 'glucose', 'diabet');
    }
    if (qClean.includes('liver') || qClean.includes('lft')) {
      expanded.push('liver', 'lft', 'bilirubin', 'sgot', 'sgpt', 'alkaline');
    }
    if (qClean.includes('kidney') || qClean.includes('rft') || qClean.includes('kft') || qClean.includes('renal')) {
      expanded.push('renal', 'rft', 'kft', 'creatinine', 'urea', 'uric');
    }
    return expanded;
  };

  // Search filter for tests selection with phonetic and parameter matching
  const filteredTests = useMemo(() => {
    const qRaw = testSearch.toLowerCase().trim();
    if (!qRaw) {
      return tests;
    }
    const searchTerms = getExpandedQuery(qRaw);

    const matched = tests.filter(t => {
      return searchTerms.some(term => {
        const nameMatch = (t.name || '').toLowerCase().includes(term);
        const shortNameMatch = (t.shortName || '').toLowerCase().includes(term);
        const codeMatch = (t.code || '').toLowerCase().includes(term);
        const paramMatch = (t.parameters || []).some((p: any) => 
          (p.name || '').toLowerCase().includes(term) || 
          (p.shortName || '').toLowerCase().includes(term)
        );
        return nameMatch || shortNameMatch || codeMatch || paramMatch;
      });
    });

    const scored = matched.map(t => {
      let score = 0;
      const name = (t.name || '').toLowerCase();
      const shortName = (t.shortName || '').toLowerCase();
      const code = (t.code || '').toLowerCase();

      // Original query matches
      if (name === qRaw || shortName === qRaw || code === qRaw) {
        score += 100;
      } else if (name.startsWith(qRaw) || shortName.startsWith(qRaw) || code.startsWith(qRaw)) {
        score += 80;
      } else if (name.includes(qRaw) || shortName.includes(qRaw) || code.includes(qRaw)) {
        score += 50;
      }

      // Check original query word starts
      const nameWords = name.split(/\s+/);
      if (nameWords.some((w: string) => w.startsWith(qRaw))) {
        score += 30;
      }

      // Parameter matches for original query
      const hasParamMatch = (t.parameters || []).some((p: any) => {
        const pName = (p.name || '').toLowerCase();
        const pShort = (p.shortName || '').toLowerCase();
        return pName === qRaw || pShort === qRaw || pName.startsWith(qRaw) || pName.includes(qRaw);
      });
      if (hasParamMatch) {
        score += 40;
      }

      // Expanded search terms matches
      for (const term of searchTerms) {
        if (term !== qRaw) {
          if (name.includes(term) || shortName.includes(term) || code.includes(term)) {
            score += 10;
          }
          const hasExpandedParamMatch = (t.parameters || []).some((p: any) => 
            (p.name || '').toLowerCase().includes(term)
          );
          if (hasExpandedParamMatch) {
            score += 5;
          }
        }
      }

      return { test: t, score };
    });

    return scored
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.test.name.localeCompare(b.test.name);
      })
      .map(item => item.test);
  }, [tests, testSearch]);


  // Add a test to selected list
  const handleAddTest = (test: any) => {
    if (!selectedTests.some(t => t.id === test.id)) {
      setSelectedTests([...selectedTests, test]);
      const allParamIds = (test.parameters || [])
        .filter((p: any) => !p.isHeader && p.id != null && !isNaN(p.id))
        .map((p: any) => p.id);
      setSelectedParameters(prev => ({
        ...prev,
        [test.id]: allParamIds
      }));
    }
    setTestSearch('');
  };

  // Remove a test from selected list
  const handleRemoveTest = (testId: number) => {
    setSelectedTests(selectedTests.filter(t => t.id !== testId));
    setSelectedParameters(prev => {
      const next = { ...prev };
      delete next[testId];
      return next;
    });
  };

  // ─── STEP 1 SUBMIT: REGISTER PATIENT & CREATE ORDER ──────
  const handleRegisterPatient = async () => {
    if (!patientName.trim()) return setToast({ message: 'Patient Name is required.', type: 'error' });
    if (!age || Number(age) <= 0) return setToast({ message: 'Valid Age is required.', type: 'error' });
    if (mobile.trim() && mobile.trim().length < 10) return setToast({ message: 'If entered, mobile number must be at least 10 digits.', type: 'error' });
    if (selectedTests.length === 0) return setToast({ message: 'Select at least one test to proceed.', type: 'error' });

    setSubmitting(true);
    try {
      const registerDate = new Date();
      const [y, m, d] = date.split('-');
      registerDate.setFullYear(Number(y), Number(m) - 1, Number(d));

      // 1. Get referred doctor name & custom doctor flag (persist manual doctors to DB)
      let doctorId: number | null = null;
      let doctorName: string | null = null;

      if (referredDoctorId === 'manual') {
        const cleanName = manualDoctorName.trim();
        if (!cleanName || cleanName.toLowerCase() === 'self') {
          doctorName = 'Self';
          doctorId = null;
        } else {
          // Check if name already exists case-insensitively in local state list
          const existingDoc = doctors.find(
            doc => doc.name.trim().toLowerCase() === cleanName.toLowerCase()
          );
          if (existingDoc) {
            doctorId = existingDoc.id;
            doctorName = existingDoc.name;
          } else {
            // Check in case it exists in database but not in active local list
            const dbDocs = await db.query('doctor', 'findMany', {
              where: { isActive: true }
            });
            const dbMatch = (dbDocs as any[] || []).find(
              doc => doc.name.trim().toLowerCase() === cleanName.toLowerCase()
            );
            if (dbMatch) {
              doctorId = dbMatch.id;
              doctorName = dbMatch.name;
            } else {
              // Create new Doctor record
              const newDoc = await db.query('doctor', 'create', {
                data: {
                  name: cleanName,
                  commission: 0,
                  isActive: true,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                }
              });
              doctorId = newDoc.id;
              doctorName = newDoc.name;
              // Add to local state list immediately
              setDoctors(prev => [...prev, newDoc]);
            }
          }
        }
      } else if (referredDoctorId) {
        doctorId = Number(referredDoctorId);
        const doc = doctors.find(d => d.id === doctorId);
        doctorName = doc ? doc.name : null;
      } else {
        doctorName = 'Self';
      }

      let patientIdToUse = '';
      if (existingPatient) {
        patientIdToUse = existingPatient.id;
      } else {
        // 2. Generate new Patient ID
        const year = registerDate.getFullYear();
        const countData = await db.query('patient', 'count', {
          where: { id: { startsWith: `LAB-${year}` } }
        });
        const count = (countData as number) || 0;
        const newId = `LAB-${year}-${String(count + 1).padStart(5, '0')}`;

        // 3. Create Patient Record
        const newPatient = await db.query('patient', 'create', {
          data: {
            id: newId,
            name: patientName,
            age: Number(age),
            ageUnit,
            gender,
            mobile,
            referredDoctor: doctorName,
            referredDoctorId: doctorId,
            createdBy: currentUser?.id || 1,
            registeredAt: registerDate.toISOString()
          }
        });
        patientIdToUse = newPatient.id;
      }

      // 3. Generate Bill No & Order No
      const dateStr = date.replace(/-/g, '');
      const billsToday = await db.query('bill', 'findMany', {
        where: { billNo: { contains: `LAB-BIL-${dateStr}` } }
      });
      const billNo = `LAB-BIL-${dateStr}-${String((billsToday?.length || 0) + 1).padStart(4, '0')}`;

      const ordersToday = await db.query('testOrder', 'findMany', {
        where: { orderNo: { contains: `LAB-ORD-${dateStr}` } }
      });
      const orderNo = `LAB-ORD-${dateStr}-${String((ordersToday?.length || 0) + 1).padStart(4, '0')}`;

      // Calculate Doctor Referral Commission
      let referralCommission = null;
      if (doctorId) {
        const doc = doctors.find(d => d.id === doctorId);
        if (doc && doc.commission) {
          referralCommission = (billingCalculations.totalAmount * doc.commission) / 100;
        }
      }

      // 4. Create Bill
      const bill = await db.query('bill', 'create', {
        data: {
          billNo,
          patientId: patientIdToUse,
          subtotal: billingCalculations.subtotal,
          discountType,
          discountValue: Number(discountValue) || 0,
          discountAmount: billingCalculations.discountAmount,
          gstPercent,
          gstAmount: billingCalculations.gstAmount,
          totalAmount: billingCalculations.totalAmount,
          paidAmount,
          dueAmount: billingCalculations.dueAmount,
          paymentMethod,
          paymentStatus: billingCalculations.dueAmount <= 0 ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'UNPAID'),
          referralCommission,
          createdAt: registerDate.toISOString()
        }
      });

      // 5. Create Payment record if any amount paid
      if (paidAmount > 0) {
        await db.query('payment', 'create', {
          data: {
            billId: bill.id,
            amount: paidAmount,
            method: paymentMethod,
            receivedBy: 1,
            paidAt: registerDate.toISOString()
          }
        });
      }

      // 6. Create Order with items
      const order = await db.query('testOrder', 'create', {
        data: {
          orderNo,
          patientId: patientIdToUse,
          billId: bill.id,
          priority: 'ROUTINE',
          status: 'PENDING',
          createdAt: registerDate.toISOString(),
          items: {
            create: selectedTests.map(t => ({
              testId: t.id,
              selectedParameters: selectedParameters[t.id]?.join(',') || null
            }))
          }
        }
      });

      // 7. Re-query created order with all relations
      const orderDetails = await db.query('testOrder', 'findUnique', {
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

      setCreatedOrder(orderDetails);
      
      // Initialize parameter inputs state
      const initialResults: Record<number, any> = {};
      orderDetails.items.forEach((item: any) => {
        const rawParamIds = item.selectedParameters && item.selectedParameters.trim() !== ''
          ? item.selectedParameters.split(',').map(Number).filter((n: number) => !isNaN(n) && n > 0)
          : null;
        const allowedParamIds = rawParamIds && rawParamIds.length > 0 ? rawParamIds : null;
        item.test.parameters?.forEach((param: any) => {
          if (!param.isHeader) {
            if (allowedParamIds && !allowedParamIds.includes(param.id)) return;
            initialResults[param.id] = {
              value: '',
              statusObj: {
                status: 'PENDING',
                flag: null,
                isCritical: false,
                isAbnormal: false,
                colorClass: 'text-muted-foreground',
                bgColorClass: 'bg-muted/30 border-border',
                label: 'PENDING'
              }
            };
          }
        });
      });
      setParameterResults(initialResults);

      setToast({ message: "Patient registered and Invoice created!", type: "success" });
      setStep(2);
    } catch (err: any) {
      console.error(err);
      setToast({ message: `Registration failed: ${err?.message || err}`, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── STEP 2 RESULTS ENTRY VALUE CHANGE ──────────────────
  const handleResultValChange = (parameter: any, value: string) => {
    if (!createdOrder) return;
    
    const ageInDays = createdOrder.patient.ageUnit === 'YEARS' ? createdOrder.patient.age * 365 : 
                      createdOrder.patient.ageUnit === 'MONTHS' ? createdOrder.patient.age * 30 : createdOrder.patient.age;
    
    // Find matching ref range
    const range = parameter.refRanges?.find((r: any) => 
      (r.gender == null || r.gender === createdOrder.patient.gender) &&
      (r.ageMin == null || ageInDays >= r.ageMin) &&
      (r.ageMax == null || ageInDays <= r.ageMax)
    );

    const interpretation = interpretResult(value, range || null, ageInDays, createdOrder.patient.gender);

    // Check if calculated parameter is being edited manually
    const item = createdOrder.items.find((i: any) => i.test.parameters?.some((p: any) => p.id === parameter.id));
    const isParamCalc = item ? isCalculated(item.test.code, parameter.name, parameter.formula) : false;

    let nextOverridden = { ...overriddenParams };
    if (isParamCalc && !overriddenParams[parameter.id]) {
      nextOverridden[parameter.id] = true;
      setOverriddenParams(nextOverridden);
    }

    const updatedResults = {
      ...parameterResults,
      [parameter.id]: {
        value,
        statusObj: interpretation
      }
    };

    // Auto-calculate formula fields
    if (item) {
      const testCode = item.test.code;
      const parameters = item.test.parameters || [];
      
      const currentValues: Record<number, string> = {};
      parameters.forEach((p: any) => {
        if (p.id === parameter.id) {
          currentValues[p.id] = value;
        } else {
          currentValues[p.id] = updatedResults[p.id]?.value || '';
        }
      });
      
      const calculated = evaluateTestFormulas(
        testCode,
        parameters,
        currentValues,
        createdOrder.patient.age,
        createdOrder.patient.ageUnit,
        createdOrder.patient.gender
      );
      
      Object.keys(calculated).forEach((idStr) => {
        const calcId = Number(idStr);
        if (!nextOverridden[calcId]) {
          const calcData = calculated[calcId];
          const calcParam = parameters.find((p: any) => p.id === calcId);
          if (calcParam) {
            const calcRange = calcParam.refRanges?.find((r: any) => 
              (r.gender == null || r.gender === createdOrder.patient.gender) &&
              (r.ageMin == null || ageInDays >= r.ageMin) &&
              (r.ageMax == null || ageInDays <= r.ageMax)
            );
            const calcInterpretation = interpretResult(calcData.value, calcRange || null, ageInDays, createdOrder.patient.gender);
            
            updatedResults[calcId] = {
              value: calcData.value,
              statusObj: calcInterpretation
            };
          }
        }
      });
    }

    setParameterResults(updatedResults);
  };

  const handleResetOverride = (parameter: any) => {
    if (!createdOrder) return;
    
    const item = createdOrder.items.find((i: any) => i.test.parameters?.some((p: any) => p.id === parameter.id));
    if (!item) return;

    const nextOverridden = { ...overriddenParams };
    delete nextOverridden[parameter.id];
    setOverriddenParams(nextOverridden);

    const ageInDays = createdOrder.patient.ageUnit === 'YEARS' ? createdOrder.patient.age * 365 : 
                      createdOrder.patient.ageUnit === 'MONTHS' ? createdOrder.patient.age * 30 : createdOrder.patient.age;
    
    const testCode = item.test.code;
    const parameters = item.test.parameters || [];
    
    const currentValues: Record<number, string> = {};
    parameters.forEach((p: any) => {
      if (p.id === parameter.id) {
        currentValues[p.id] = ''; // Clear to force recalculation
      } else {
        currentValues[p.id] = parameterResults[p.id]?.value || '';
      }
    });
    
    const calculated = evaluateTestFormulas(
      testCode,
      parameters,
      currentValues,
      createdOrder.patient.age,
      createdOrder.patient.ageUnit,
      createdOrder.patient.gender
    );
    
    const updatedResults = { ...parameterResults };
    delete updatedResults[parameter.id];

    Object.keys(calculated).forEach((idStr) => {
      const calcId = Number(idStr);
      if (!nextOverridden[calcId]) {
        const calcData = calculated[calcId];
        const calcParam = parameters.find((p: any) => p.id === calcId);
        if (calcParam) {
          const calcRange = calcParam.refRanges?.find((r: any) => 
            (r.gender == null || r.gender === createdOrder.patient.gender) &&
            (r.ageMin == null || ageInDays >= r.ageMin) &&
            (r.ageMax == null || ageInDays <= r.ageMax)
          );
          const calcInterpretation = interpretResult(calcData.value, calcRange || null, ageInDays, createdOrder.patient.gender);
          
          updatedResults[calcId] = {
            value: calcData.value,
            statusObj: calcInterpretation
          };
        }
      }
    });
    
    setParameterResults(updatedResults);
  };

  // ─── STEP 2 SUBMIT: SAVE RESULTS AND UPDATE STATUS ──────
  const handleSaveResults = async () => {
    if (!createdOrder) return;
    setSubmitting(true);
    
    try {
      // Loop order items and parameters to record results
      for (const item of createdOrder.items) {
        let hasEnteredResults = false;
        
        for (const param of item.test.parameters || []) {
          if (param.isHeader) continue;

          const paramResult = parameterResults[param.id];
          if (!paramResult || paramResult.value === '') continue; // Skip empty fields

          hasEnteredResults = true;
          const isNumeric = param.type === 'NUMERIC' || param.type === 'CALCULATED';
          const numericValue = isNumeric && !isNaN(Number(paramResult.value)) ? Number(paramResult.value) : null;
          const textValue = !isNumeric ? paramResult.value : null;

          await db.query('testResult', 'create', {
            data: {
              orderItemId: item.id,
              parameterId: param.id,
              numericValue,
              textValue,
              status: paramResult.statusObj.status,
              flag: paramResult.statusObj.flag,
              isCritical: paramResult.statusObj.isCritical,
              isAbnormal: paramResult.statusObj.isAbnormal,
              enteredBy: 1
            }
          });
        }

        // Update item status if results entered
        if (hasEnteredResults) {
          await db.query('testOrderItem', 'update', {
            where: { id: item.id },
            data: { status: 'RESULT_ENTERED' }
          });
        }
      }

      // Update Order Status to APPROVED to verify pathologists approval
      await db.query('testOrder', 'update', {
        where: { id: createdOrder.id },
        data: { status: 'APPROVED' }
      });

      // Save Report entry
      await db.query('report', 'create', {
        data: {
          orderId: createdOrder.id,
          approvedBy: 1,
          approvedAt: new Date().toISOString(),
          printCount: 0
        }
      });

      // Refresh final order record to compile the correct PDF
      const finalOrder = await db.query('testOrder', 'findUnique', {
        where: { id: createdOrder.id },
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
      
      setCreatedOrder(finalOrder);
      setToast({ message: "Results saved & PDF Report generated!", type: "success" });
      setStep(3);
    } catch (err: any) {
      console.error(err);
      setToast({ message: `Failed to save results: ${err?.message || err}`, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── STEP 3 ACTIONS: DOWNLOAD & PRINT PDF ────────────────
  const downloadReport = async () => {
    if (!createdOrder) return;
    try {
      const reportData = buildReportDataFromDb(createdOrder, labSettings);
      const pdfBytes = await generateReportPDF(reportData);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${createdOrder.orderNo}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setToast({ message: "PDF Downloaded!", type: "success" });
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to download PDF.", type: "error" });
    }
  };

  const printReport = async () => {
    if (!createdOrder) return;
    try {
      const reportData = buildReportDataFromDb(createdOrder, labSettings);
      const pdfBytes = await generateReportPDF(reportData);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // Open in a new window/tab for easy offline printing
      window.open(url, '_blank');
      
      setToast({ message: "Opening print preview...", type: "success" });
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to print PDF.", type: "error" });
    }
  };

  const resetFlow = () => {
    // Reset state variables
    setPatientName('');
    setAge('');
    setAgeUnit('YEARS');
    setGender('MALE');
    setMobile('');
    setDate(new Date().toISOString().slice(0, 10));
    setReferredDoctorId('');
    setManualDoctorName('');
    setSelectedTests([]);
    setDiscountType('FLAT');
    setDiscountValue(0);
    setGstPercent(0);
    setGstAutoApplied(false);
    setPaidAmount(0);
    setIsPaidModified(false);
    setCreatedOrder(null);
    setParameterResults({});
    setSelectedParameters({});
    setStep(1);
  };

  return (
    <AppLayout 
      title="Quick Entry Workflow" 
      breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Quick Entry' }]}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Toast Alert Banner */}
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`toast-global ${
              toast.type === 'success' ? 'toast-success' : 'toast-error'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            <span className="text-sm font-semibold">{toast.message}</span>
          </motion.div>
        )}

        {/* Unified Workflow Stepper */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {/* Step 1 */}
            <div className="flex flex-col items-center">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors border ${
                step >= 1 
                  ? 'bg-blue-600 border-blue-500 text-white shadow-md' 
                  : 'bg-muted border-border text-muted-foreground'
              }`}>
                1
              </div>
              <span className={`text-xs font-semibold mt-1 transition-colors ${step >= 1 ? 'text-blue-400' : 'text-muted-foreground'}`}>
                Register & Bill
              </span>
            </div>
            
            {/* Divider 1 */}
            <div className={`flex-1 h-0.5 mx-2 transition-colors ${step >= 2 ? 'bg-blue-600' : 'bg-border'}`} />

            {/* Step 2 */}
            <div className="flex flex-col items-center">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors border ${
                step >= 2 
                  ? 'bg-blue-600 border-blue-500 text-white shadow-md' 
                  : 'bg-muted border-border text-muted-foreground'
              }`}>
                2
              </div>
              <span className={`text-xs font-semibold mt-1 transition-colors ${step >= 2 ? 'text-blue-400' : 'text-muted-foreground'}`}>
                Enter Results
              </span>
            </div>

            {/* Divider 2 */}
            <div className={`flex-1 h-0.5 mx-2 transition-colors ${step >= 3 ? 'bg-blue-600' : 'bg-border'}`} />

            {/* Step 3 */}
            <div className="flex flex-col items-center">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors border ${
                step >= 3 
                  ? 'bg-blue-600 border-blue-500 text-white shadow-md' 
                  : 'bg-muted border-border text-muted-foreground'
              }`}>
                3
              </div>
              <span className={`text-xs font-semibold mt-1 transition-colors ${step >= 3 ? 'text-blue-400' : 'text-muted-foreground'}`}>
                Print & Download
              </span>
            </div>
          </div>
        </div>

        {/* Workflow Pages Container */}
        <AnimatePresence mode="wait">
          
          {/* STEP 1: PATIENT REGISTER AND BILLING */}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Patient and Referral Card */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Form Inputs */}
                <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-4.5 w-4.5 text-blue-500" /> Patient Details
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsExistingMode(true);
                          resetPatientFields();
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                          isExistingMode
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/40 text-muted-foreground border-border hover:bg-accent'
                        }`}
                      >
                        Search Existing
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsExistingMode(false);
                          setExistingPatient(null);
                          resetPatientFields();
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                          !isExistingMode
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/40 text-muted-foreground border-border hover:bg-accent'
                        }`}
                      >
                        Register New
                      </button>
                    </div>
                  </div>

                  {isExistingMode && !existingPatient && (
                    <div className="relative space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Search Existing Patient *</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search patient by name, mobile, or ID..."
                          value={patientSearch}
                          onChange={(e) => {
                            setPatientSearch(e.target.value);
                            setShowPatientDropdown(true);
                          }}
                          onFocus={() => setShowPatientDropdown(true)}
                          className="w-full pl-10 pr-3.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border"
                        />
                      </div>
                      {showPatientDropdown && searchResults.length > 0 && (
                        <div className="absolute left-0 right-0 mt-1.5 bg-popover text-popover-foreground border rounded-lg shadow-lg z-30 max-h-52 overflow-y-auto border-border">
                          {searchResults.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectExistingPatient(p);
                              }}
                              className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-accent text-left text-xs font-semibold transition-colors border-b last:border-0 text-foreground"
                            >
                              <div>
                                <span className="text-primary font-mono mr-2">{p.id}</span>
                                <span>{p.name}</span>
                              </div>
                              <div className="text-muted-foreground">{p.mobile} • {p.age} {p.ageUnit} • {p.gender}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      {patientSearch && showPatientDropdown && searchResults.length === 0 && (
                        <div className="absolute left-0 right-0 mt-1.5 bg-popover text-popover-foreground border rounded-lg shadow-lg z-30 py-3 px-4 text-xs text-muted-foreground text-center border-border">
                          No patients found.
                        </div>
                      )}
                    </div>
                  )}

                  {existingPatient && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary tracking-wide uppercase">
                          Selected Existing Patient
                        </span>
                        <h4 className="font-bold text-foreground text-base mt-1">{existingPatient.name}</h4>
                        <p className="text-xs text-muted-foreground font-semibold">
                          ID: <span className="font-mono text-primary">{existingPatient.id}</span> • {existingPatient.age} {existingPatient.ageUnit} • {existingPatient.gender}
                        </p>
                        <p className="text-xs text-muted-foreground">Mobile: {existingPatient.mobile}</p>
                        {existingPatient.referredDoctor && (
                          <p className="text-xs text-indigo-400 font-semibold mt-1">Referred Doctor: {existingPatient.referredDoctor}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setExistingPatient(null);
                          resetPatientFields();
                        }}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 hover:underline"
                      >
                        Change Patient
                      </button>
                    </div>
                  )}
                  
                  {(!isExistingMode || !existingPatient) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Patient Name *</label>
                      <input 
                        type="text" 
                        placeholder="Enter full name" 
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        className="w-full px-3.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border"
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mobile Phone (Optional)</label>
                      <input 
                        type="tel" 
                        maxLength={10}
                        placeholder="10-digit number" 
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border font-mono"
                      />
                    </div>

                    {/* Age and Unit */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Age & Unit *</label>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          placeholder="Age" 
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          className="flex-1 px-3.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border"
                        />
                        <select 
                          value={ageUnit}
                          onChange={(e: any) => setAgeUnit(e.target.value)}
                          className="w-28 px-3 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border font-semibold"
                        >
                          <option value="YEARS">Years</option>
                          <option value="MONTHS">Months</option>
                          <option value="DAYS">Days</option>
                        </select>
                      </div>
                    </div>

                    {/* Gender */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gender *</label>
                      <select 
                        value={gender}
                        onChange={(e: any) => setGender(e.target.value)}
                        className="w-full px-3 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border font-semibold"
                      >
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    {/* Date */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Registration Date *</label>
                      <input 
                        type="date" 
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-3.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border font-semibold font-mono"
                      />
                    </div>

                    {/* Referred Doctor */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Referred Doctor</label>
                      <select 
                        value={referredDoctorId}
                        onChange={(e) => setReferredDoctorId(e.target.value)}
                        className="w-full px-3 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border font-semibold"
                      >
                        <option value="">Self / Walk-in</option>
                        {doctors.map(doc => (
                          <option key={doc.id} value={doc.id}>{doc.name}</option>
                        ))}
                        <option value="manual">+ Type Manually / Other</option>
                      </select>
                    </div>
                  </div>
                  )}

                  {/* Manual Doctor Write-in */}
                  {(!isExistingMode || !existingPatient) && referredDoctorId === 'manual' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-1.5 border-t pt-3"
                    >
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Custom Doctor Name *</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <input 
                            type="text" 
                            placeholder="Enter doctor's full name" 
                            value={manualDoctorName}
                            onChange={(e) => setManualDoctorName(e.target.value)}
                            className="w-full pl-10 pr-3.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Tests Catalog & Multi-Select Search */}
                <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b pb-2 flex items-center gap-1.5">
                    <Beaker className="h-4.5 w-4.5 text-indigo-500" /> Select Tests Catalog
                  </h3>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                    <input 
                      type="text" 
                      placeholder="Search tests by code or name... (e.g. CBC, Lipid, Sugar)" 
                      value={testSearch}
                      onChange={(e) => setTestSearch(e.target.value)}
                      onFocus={() => setShowTestDropdown(true)}
                      onBlur={() => setShowTestDropdown(false)}
                      className="w-full pl-10 pr-4 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border"
                    />
                    
                    {/* Floating Search Results */}
                    {showTestDropdown && filteredTests.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1.5 bg-popover text-popover-foreground border rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto border-border">
                        {filteredTests.map((test) => (
                          <button
                            key={test.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleAddTest(test);
                              setShowTestDropdown(false);
                            }}
                            className="flex flex-col gap-1 w-full px-4 py-2.5 hover:bg-accent text-left text-xs font-semibold transition-colors border-b last:border-0"
                          >
                            <div className="flex justify-between items-center w-full">
                              <div>
                                <span className="text-primary font-mono mr-2">[{test.code}]</span>
                                <span className="font-bold text-foreground">{test.name}</span>
                              </div>
                              <div className="text-foreground font-mono">{formatCurrency(test.price)}</div>
                            </div>
                            {test.parameters && test.parameters.length > 0 && (
                              <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 border-t border-border/20 pt-1">
                                {test.parameters.map((p: any) => {
                                  if (p.isHeader) return null;
                                  const rangeText = formatRefRange(p);
                                  return (
                                    <span key={p.id} className="bg-muted/40 px-1 py-0.5 rounded border border-border/30">
                                      {p.name}: <span className="font-mono text-foreground/80">{rangeText} {p.unit || ''}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                  </div>

                  {/* Popular Test Suggestions */}
                  <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase mr-1">Popular:</span>
                    {[
                      { label: 'CBC', code: 'HEM001' },
                      { label: 'LFT', code: 'BIO001' },
                      { label: 'RFT', code: 'BIO002' },
                      { label: 'Lipid', code: 'BIO003' },
                      { label: 'Thyroid', code: 'BIO004' },
                      { label: 'Sugar Fasting', code: 'BIO005' },
                      { label: 'Sugar Random', code: 'BIO007' },
                      { label: 'HbA1c', code: 'BIO008' },
                      { label: 'Blood Group', code: 'HEM006' },
                      { label: 'Urine R/M', code: 'CP001' },
                      { label: 'Dengue Combo', code: 'SER010' },
                      { label: 'Widal Slide', code: 'SER007' }
                    ].map((s) => {
                      const matchTest = tests.find(t => t.code === s.code);
                      if (!matchTest) return null;
                      
                      const isAdded = selectedTests.some(t => t.id === matchTest.id);
                      return (
                        <button
                          key={s.code}
                          type="button"
                          onClick={() => isAdded ? handleRemoveTest(matchTest.id) : handleAddTest(matchTest)}
                          className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                            isAdded 
                              ? 'bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/10' 
                              : 'bg-muted/30 border-border hover:bg-accent text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {isAdded ? '✓ ' : ''}{s.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Tests List */}
                  <div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Selected Tests ({selectedTests.length}):</span>
                    
                    {selectedTests.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-lg mt-1.5">
                        No tests selected. Use the search box above to choose lab investigations.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                        {selectedTests.map((t) => {
                          const testParams = t.parameters || [];
                          const selectedParamsForTest = selectedParameters[t.id] || [];
                          return (
                            <div 
                              key={t.id} 
                              className="border rounded-lg p-3 bg-muted/20 border-border space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="truncate">
                                  <p className="text-xs font-bold text-foreground truncate">{t.name}</p>
                                  <p className="text-[11px] text-muted-foreground font-mono">{t.code} • {formatCurrency(t.price)}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTest(t.id)}
                                  className="text-red-500 hover:text-red-700 p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                              {testParams.length > 0 && (
                                <div className="border-t border-border/40 pt-2 space-y-1">
                                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Choose Parameters:</span>
                                  <div className="grid grid-cols-1 gap-1 pl-1">
                                    {testParams.map((param: any) => {
                                      if (param.isHeader) return null;
                                      const isChecked = selectedParamsForTest.includes(param.id);
                                      return (
                                        <label key={param.id} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => {
                                              const nextParams = isChecked
                                                ? selectedParamsForTest.filter(id => id !== param.id)
                                                : [...selectedParamsForTest, param.id];
                                              setSelectedParameters(prev => ({
                                                ...prev,
                                                [t.id]: nextParams
                                              }));
                                            }}
                                            className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                                          />
                                          <span className={isChecked ? 'font-medium' : 'text-muted-foreground line-through'}>{param.name}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Billing Info Column */}
              <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4 self-start h-full">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b pb-2 flex items-center gap-1.5">
                  <FileText className="h-4.5 w-4.5 text-green-500" /> Billing & Payment Details
                </h3>

                {selectedTests.length === 0 ? (
                  /* Empty state when no tests selected */
                  <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                    <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">No tests selected</p>
                    <p className="text-[11px] text-muted-foreground/70">Billing details will appear here after you add tests from the catalog.</p>
                  </div>
                ) : (
                  /* Billing details shown only when tests are selected */
                  <>
                    {/* Billing Summary List */}
                    <div className="space-y-2 text-xs font-semibold border-b pb-4">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="text-foreground">{formatCurrency(billingCalculations.subtotal)}</span>
                      </div>

                      {/* Discount Section */}
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground">Discount</span>
                        <div className="flex items-center gap-1.5">
                          <select 
                            value={discountType}
                            onChange={(e: any) => { setDiscountType(e.target.value); setDiscountValue(0); }}
                            className="px-2 bg-background border rounded-lg text-sm focus:outline-none"
                          >
                            <option value="FLAT">Flat ₹</option>
                            <option value="PERCENT">Percent %</option>
                          </select>
                          <input 
                            type="number"
                            min={0}
                            value={discountValue || ''}
                            onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                            className="w-20 text-right px-2 bg-background border rounded-lg text-sm focus:outline-none font-semibold font-mono"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {/* GST */}
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">GST (Goods & Services Tax)</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number"
                            min={0}
                            value={gstPercent}
                            onChange={(e) => setGstPercent(Number(e.target.value) || 0)}
                            className="w-20 text-right px-2 bg-background border rounded-lg text-sm focus:outline-none font-semibold font-mono"
                          />
                          <span>%</span>
                        </div>
                      </div>
                      
                      {/* Totals */}
                      <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                        <span className="text-foreground">Total Amount</span>
                        <span className="text-foreground">{formatCurrency(billingCalculations.totalAmount)}</span>
                      </div>
                    </div>

                    {/* Payment Fields */}
                    <div className="space-y-3.5">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount Paid (₹)</label>
                        <input 
                          type="number" 
                          min={0}
                          value={paidAmount}
                          onChange={(e) => {
                            setPaidAmount(Number(e.target.value) || 0);
                            setIsPaidModified(true);
                          }}
                          className="w-full px-3.5 rounded-xl border bg-background text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-primary border-border"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                        <div>
                          <span className="text-muted-foreground">Due Amount</span>
                          <p className={`text-base font-bold mt-0.5 ${billingCalculations.dueAmount > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {formatCurrency(billingCalculations.dueAmount)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Payment Method</span>
                          <select 
                            value={paymentMethod}
                            onChange={(e: any) => setPaymentMethod(e.target.value)}
                            className="w-full px-2 bg-background border rounded-lg mt-1 text-sm font-bold focus:outline-none"
                          >
                            <option value="CASH">CASH</option>
                            <option value="UPI">UPI (GPay/PhonePe)</option>
                            <option value="CARD">Card Swipe</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Next button */}
                <button
                  type="button"
                  disabled={submitting || selectedTests.length === 0}
                  onClick={handleRegisterPatient}
                  className="w-full h-11 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg text-sm mt-4 disabled:opacity-50"
                >
                  {submitting ? 'Registering...' : 'Register & Enter Results'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

            </motion.div>
          )}

          {/* STEP 2: RESULTS ENTRY PARAMETERS */}
          {step === 2 && createdOrder && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="max-w-5xl mx-auto space-y-6"
            >
              {/* Patient header card info */}
              <div className="rounded-xl border bg-card p-5 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Patient Name</span>
                  <p className="text-sm font-bold text-foreground mt-0.5">{createdOrder.patient.name}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Age / Gender</span>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {createdOrder.patient.age} {createdOrder.patient.ageUnit || 'YEARS'} / {createdOrder.patient.gender}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Order / Invoice No</span>
                  <p className="text-sm font-bold text-primary font-mono mt-0.5">{createdOrder.orderNo}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total / Paid</span>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {formatCurrency(createdOrder.bill?.totalAmount || 0)} / <span className="text-green-500">{formatCurrency(createdOrder.bill?.paidAmount || 0)}</span>
                  </p>
                </div>
              </div>

              {/* Dynamic parameters inputs sorted by test items */}
              <div className="space-y-6">
                {createdOrder.items.map((item: any) => (
                  <div key={item.id} className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b pb-2 flex items-center gap-2">
                      <Activity className="h-4.5 w-4.5 text-blue-500" />
                      {item.test.name} ({item.test.shortName})
                    </h3>

                    <div className="space-y-3">
                      {(() => {
                        const rawParamIds = item.selectedParameters && item.selectedParameters.trim() !== ''
                          ? item.selectedParameters.split(',').map(Number).filter((n: number) => !isNaN(n) && n > 0)
                          : null;
                        const allowedParamIds = rawParamIds && rawParamIds.length > 0 ? rawParamIds : null;
                          
                        const filteredParams = (item.test.parameters || []).filter((param: any) => {
                          if (param.isHeader) return true;
                          if (allowedParamIds && !allowedParamIds.includes(param.id)) return false;
                          return true;
                        });
                        
                        if (filteredParams.every((p: any) => p.isHeader)) {
                          return <p className="text-xs text-muted-foreground italic pl-2">No parameters selected for this test.</p>;
                        }

                        return filteredParams.map((param: any) => {
                          if (param.isHeader) {
                            return (
                              <div key={param.id} className="bg-muted/40 px-3 py-1 rounded text-xs font-bold text-foreground tracking-wider uppercase">
                                {param.name}
                              </div>
                            );
                          }

                          const resultState = parameterResults[param.id] || { value: '', statusObj: {} };
                          const statusObj = resultState.statusObj || {};
                          const matchingRange = param.refRanges?.find((r: any) => {
                            const ageInDays = createdOrder.patient.ageUnit === 'YEARS' ? createdOrder.patient.age * 365 : 
                                              createdOrder.patient.ageUnit === 'MONTHS' ? createdOrder.patient.age * 30 : createdOrder.patient.age;
                            return (r.gender == null || r.gender === createdOrder.patient.gender) &&
                                   (r.ageMin == null || ageInDays >= r.ageMin) &&
                                   (r.ageMax == null || ageInDays <= r.ageMax);
                          });

                          let rangeStr = '';
                          if (matchingRange) {
                            if (param.type === 'NUMERIC' || param.type === 'CALCULATED') {
                              rangeStr = matchingRange.normalMin !== null && matchingRange.normalMax !== null
                                ? `${matchingRange.normalMin} - ${matchingRange.normalMax}`
                                : matchingRange.normalMin !== null ? `>= ${matchingRange.normalMin}` : `<= ${matchingRange.normalMax}`;
                            } else {
                              rangeStr = matchingRange.textNormal || '';
                            }
                          }

                          return (
                            <div 
                              key={param.id} 
                              className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-3 last:border-0 last:pb-0"
                            >
                              <div className="w-full md:w-1/3">
                                <p className="text-xs font-bold text-foreground">{param.name}</p>
                                {param.unit && <span className="text-[11px] text-muted-foreground">Unit: {param.unit}</span>}
                              </div>

                              {/* Reference Range */}
                              <div className="w-full md:w-1/4 text-left">
                                <span className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">Ref Range</span>
                                <p className="text-xs text-muted-foreground/80 font-mono mt-0.5">{rangeStr || 'N/A'}</p>
                              </div>

                              {/* Input value & dynamically updated flags */}
                              <div className="flex-1 flex items-center gap-3">
                                <div className="relative flex-1">
                                  {(() => {
                                    const isParamCalc = isCalculated(item.test.code, param.name, param.formula);
                                    const isOverridden = !!overriddenParams[param.id];

                                    let calculatedBgClass = '';
                                    if (isParamCalc && !isOverridden) {
                                      calculatedBgClass = 'bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-semibold cursor-not-allowed border-dashed';
                                    }

                                    const inputBorderClass = statusObj.isCritical 
                                      ? `border-red-500 ring-1 ring-red-500 animate-pulse text-red-500 ${calculatedBgClass}` 
                                      : statusObj.status === 'HIGH' 
                                        ? `border-orange-500 text-orange-500 ${calculatedBgClass}` 
                                        : statusObj.status === 'LOW' 
                                          ? `border-blue-500 text-blue-500 ${calculatedBgClass}` 
                                          : statusObj.status === 'NORMAL' 
                                            ? `border-green-500 text-green-500 ${calculatedBgClass}` 
                                            : `border-border ${calculatedBgClass}`;

                                    return (
                                      <div className="relative flex items-center w-full">
                                        <input 
                                          type="text" 
                                          placeholder="Enter result value"
                                          readOnly={isParamCalc && !isOverridden}
                                          value={resultState.value}
                                          onChange={(e) => handleResultValChange(param, e.target.value)}
                                          className={`w-full px-3 py-1.5 rounded-xl border bg-background text-sm font-semibold focus:outline-none transition-all ${isParamCalc ? 'pr-14' : ''} ${inputBorderClass}`}
                                        />
                                        {isParamCalc && (
                                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 select-none">
                                            {!isOverridden ? (
                                              <button
                                                type="button"
                                                title="Click to override auto-calculation"
                                                onClick={() => setOverriddenParams(prev => ({ ...prev, [param.id]: true }))}
                                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20 shadow-sm cursor-pointer transition-colors"
                                              >
                                                Auto
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                title="Click to reset to auto-calculation"
                                                onClick={() => handleResetOverride(param)}
                                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 shadow-sm cursor-pointer transition-colors animate-pulse"
                                              >
                                                Manual
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>

                                {/* Flag interpretation Badge */}
                                <div className={`w-28 text-center px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all shadow-sm ${
                                  statusObj.isCritical
                                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                    : statusObj.status === 'HIGH'
                                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                                      : statusObj.status === 'LOW'
                                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                        : statusObj.status === 'NORMAL'
                                          ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                          : 'bg-muted/50 border-border text-muted-foreground'
                                }`}>
                                  {statusObj.label || 'PENDING'}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center border-t pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-semibold border rounded-lg px-3 py-2 bg-card transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Registration
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSaveResults}
                  className="bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl px-5 py-2.5 font-bold text-sm flex items-center gap-1.5 shadow-lg transition-colors disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {submitting ? 'Saving...' : 'Save Results & Generate Report'}
                </button>
              </div>

            </motion.div>
          )}

          {/* STEP 3: PREVIEW, DOWNLOAD, PRINT */}
          {step === 3 && createdOrder && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-xl mx-auto rounded-xl border bg-card p-6 shadow-md text-center space-y-6"
            >
              <div className="flex flex-col items-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-500">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Completed Successfully!</h2>
                <p className="text-xs text-muted-foreground">
                  Patient and test results registered successfully under order ID <span className="font-mono text-primary font-bold">{createdOrder.orderNo}</span>
                </p>
              </div>

              {/* Patient summary details */}
              <div className="rounded-lg border bg-muted/20 p-4 text-left space-y-2.5 text-xs font-semibold">
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground">Patient:</span>
                  <span className="text-foreground">{createdOrder.patient.name} ({createdOrder.patient.age} {createdOrder.patient.ageUnit || 'YEARS'} • {createdOrder.patient.gender})</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground">Mobile Phone:</span>
                  <span className="text-foreground font-mono">{createdOrder.patient.mobile}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground">Tests Conducted:</span>
                  <span className="text-foreground text-right max-w-[250px] truncate">{createdOrder.items?.map((i: any) => i.test.name).join(', ')}</span>
                </div>
                <div className="flex justify-between pt-0.5">
                  <span className="text-muted-foreground">Total Invoice Amount:</span>
                  <span className="text-foreground font-bold">{formatCurrency(createdOrder.bill?.totalAmount || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Paid:</span>
                  <span className="text-green-500 font-bold">{formatCurrency(createdOrder.bill?.paidAmount || 0)}</span>
                </div>
                {createdOrder.bill?.dueAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-red-400">Dues Outstanding:</span>
                    <span className="text-red-400 font-bold">{formatCurrency(createdOrder.bill?.dueAmount)}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="h-11 border border-border hover:bg-accent rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg text-foreground"
                >
                  <Eye className="h-4 w-4 text-primary" />
                  Preview Report
                </button>

                <button
                  type="button"
                  onClick={downloadReport}
                  className="h-11 border border-border hover:bg-accent rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg text-foreground"
                >
                  <Download className="h-4 w-4 text-primary" />
                  Download PDF Report
                </button>
                
                <button
                  type="button"
                  onClick={printReport}
                  className="h-11 border border-border hover:bg-accent rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg text-foreground"
                >
                  <Printer className="h-4 w-4 text-primary" />
                  Print PDF Report
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const text = encodeURIComponent(`Report ready for ${createdOrder.patient.name} - Order: ${createdOrder.orderNo}`);
                    window.open(`https://wa.me/?text=${text}`, '_blank');
                  }}
                  className="md:col-span-3 h-11 border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 text-green-500 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg"
                >
                  Send Whatsapp Alert
                </button>
              </div>

              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={resetFlow}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all text-sm shadow-lg"
                >
                  <Plus className="h-4 w-4" />
                  Register Another Patient
                </button>
              </div>

            </motion.div>
          )}

        </AnimatePresence>

      </div>

      {/* Preview Modal */}
      {showPreview && createdOrder && (() => {
        const data = buildReportDataFromDb(createdOrder, labSettings);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowPreview(false)}>
            <div className="bg-card border rounded-xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground">Report Preview</h2>
                <button onClick={() => setShowPreview(false)} className="rounded-lg p-1 hover:bg-accent text-muted-foreground hover:text-foreground">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Lab Header */}
              <div className="rounded-lg bg-primary/10 p-4 mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {data.printShowLogo && data.logo && (
                    <div className="h-16 w-16 bg-white rounded-lg p-1 border flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                      <img src={data.logo} className="h-full w-full object-contain" alt="Lab Logo" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-base font-bold text-primary">{data.labName.toUpperCase()}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{data.labAddress}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1 font-medium">
                      {data.labMobile && <span>Phone: {data.labMobile}</span>}
                      {data.labEmail && <span>Email: {data.labEmail}</span>}
                      {data.labWebsite && <span>Web: {data.labWebsite}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5 font-medium">
                      {data.gstNumber && <span>GSTIN: {data.gstNumber}</span>}
                      {data.registrationNo && <span>Reg No: {data.registrationNo}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex rounded-full bg-primary/20 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider">
                    Pathology Report
                  </span>
                </div>
              </div>

              {/* Patient Info */}
              <div className="rounded-lg border p-4 mb-4 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Patient Name:</span> <span className="font-semibold">{data.patientName}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Order No:</span> <span className="font-semibold font-mono">{data.orderNo}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Patient ID:</span> <span className="font-semibold">{data.patientId}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Date:</span> <span className="font-semibold">{data.date}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Age / Gender:</span> <span className="font-semibold">{data.age} / {data.gender}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Referred By:</span> <span className="font-semibold">{data.referredBy}</span></div>
              </div>

              {/* Test Results */}
              {data.tests.map((test, ti) => (
                <div key={ti} className="mb-4">
                  <div className="rounded-t-lg bg-primary px-3 py-2">
                    <h4 className="text-sm font-bold text-primary-foreground">{test.testName}</h4>
                  </div>
                  <div className="border border-t-0 rounded-b-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Parameter</th>
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Result</th>
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Unit</th>
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {test.parameters.map((p, pi) => (
                          <tr key={pi} className={p.isHeader ? 'bg-muted/30' : 'border-t border-border/50'}>
                            <td className={`px-3 py-1.5 ${p.isHeader ? 'font-bold' : ''}`}>{p.name}</td>
                            {p.isHeader ? (
                              <td colSpan={3}></td>
                            ) : (
                              <>
                                <td className={`px-3 py-1.5 font-semibold ${p.flag === '↑' || p.flag === 'H' ? 'text-orange-600 dark:text-orange-400' : p.flag === '↓' || p.flag === 'L' ? 'text-blue-600 dark:text-blue-400' : p.flag === '!!' ? 'text-red-600 dark:text-red-400' : ''}`}>
                                  {p.value}{p.flag ? ` ${p.flag === '↑' ? 'H' : p.flag === '↓' ? 'L' : p.flag}` : ''}
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground">{p.unit}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{p.refRange}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Footer */}
              <div className="border-t pt-3 mt-2 flex items-center justify-between text-xs text-muted-foreground font-sans">
                <p className="italic">This is a computer-generated report. Results should be correlated clinically.</p>
                <div className="text-right">
                  {data.approvedBy !== 'Draft Report (Pending Approval)' ? (
                    <>
                      <p className="font-bold text-foreground text-sm">{data.approvedBy}</p>
                      <p className="italic text-xs">{data.doctorQualification || 'Pathologist'}</p>
                      {data.doctorRegNo && <p className="text-[10px] text-muted-foreground mt-0.5">Reg No: {data.doctorRegNo}</p>}
                    </>
                  ) : (
                    <p className="text-red-500 font-bold italic">{data.approvedBy}</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4 pt-3 border-t">
                <button onClick={downloadReport} className="flex items-center gap-1.5 bg-primary px-5 py-2.5 text-sm font-bold rounded-xl text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Download className="h-4 w-4" />Download PDF
                </button>
                <button onClick={printReport} className="flex items-center gap-1.5 bg-primary px-5 py-2.5 text-sm font-bold rounded-xl text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Printer className="h-4 w-4" />Print PDF
                </button>
                <button onClick={() => setShowPreview(false)} className="ml-auto border px-5 py-2.5 text-sm font-bold rounded-xl hover:bg-accent text-foreground transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </AppLayout>
  );
}

export default function QuickRegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground font-medium">Loading Quick Entry Workflow...</div>
      </div>
    }>
      <QuickRegisterContent />
    </Suspense>
  );
}
