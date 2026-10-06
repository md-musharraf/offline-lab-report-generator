"use client";
import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { nextNumber } from '@/lib/numbers';
import { ArrowLeft, Search, Plus, Trash2, Receipt, Lock } from 'lucide-react';
import Link from 'next/link';
import { AppLayout } from '@/components/AppLayout';
import { can } from '@/lib/roles';
import { motion, AnimatePresence } from 'framer-motion';


function NewBillingPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
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

  // Discounts: owner, admin and technician; a receptionist needs the owner's password (every bill is audited).
  const isAdmin = can(currentUser?.role, 'discount');

  // Manager Discount Authorization States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Please fill in all fields');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch('/api/auth/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword, reason: 'discount unlock' }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        setIsAuthorized(true);
        setShowAuthModal(false);
        setAuthEmail('');
        setAuthPassword('');
        setAuthError(null);
        return;
      }
      setAuthError(data.error || 'Authorized user must be an Admin/Owner');
    } catch (err) {
      console.error('Authorization exception:', err);
      setAuthError('An error occurred during authorization.');
    } finally {
      setAuthLoading(false);
    }
  };


  const [patient, setPatient] = useState<any>(null);
  const [tests, setTests] = useState<any[]>([]);
  const [selectedTests, setSelectedTests] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  // Patient Search & Reg States
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [regForm, setRegForm] = useState({
    name: '',
    mobile: '',
    age: '',
    ageUnit: 'YEARS',
    gender: 'MALE',
    bloodGroup: '',
    referredDoctorId: '',
    email: '',
    address: ''
  });

  // Billing States
  const [discountType, setDiscountType] = useState<'FLAT' | 'PERCENT'>('FLAT');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [gstPercent, setGstPercent] = useState<number>(18); // Default 18% GST as per page context
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [showTestDropdown, setShowTestDropdown] = useState(false);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        if (initialPatientId) {
          const p = await db.query('patient', 'findUnique', { 
            where: { id: initialPatientId },
            include: { doctor: true }
          });
          setPatient(p);
        }
        
        const t = await db.query('test', 'findMany', { 
          where: { isActive: true }, 
          include: { category: true } 
        });
        setTests(t || []);

        const patientsList = await db.query('patient', 'findMany', {
          include: { doctor: true }
        });
        setAllPatients(patientsList || []);

        const doctorsList = await db.query('doctor', 'findMany', {
          where: { isActive: true }
        });
        setDoctors(doctorsList || []);
      } catch (err) {
        console.error("Error loading billing setup data:", err);
      }
    }
    loadData();
  }, [initialPatientId]);

  // Filter patients client-side
  const searchResults = useMemo(() => {
    let matched = allPatients;
    
    // Sort allPatients by registration date descending (registeredAt or createdAt)
    matched = [...matched].sort((a: any, b: any) => {
      const dateA = new Date(a.registeredAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.registeredAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    const q = patientSearch.toLowerCase().trim();
    if (!q) {
      return matched;
    }

    matched = matched.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.mobile && p.mobile.includes(q))
    );

    // Prioritize prefix and word-start matches
    matched = [...matched].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      const mobileA = a.mobile || '';
      const mobileB = b.mobile || '';
      const idA = a.id.toLowerCase();
      const idB = b.id.toLowerCase();

      const aStarts = nameA.startsWith(q) || mobileA.startsWith(q) || idA.startsWith(q);
      const bStarts = nameB.startsWith(q) || mobileB.startsWith(q) || idB.startsWith(q);

      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      const aWordStarts = nameA.split(/\s+/).some((w: string) => w.startsWith(q));
      const bWordStarts = nameB.split(/\s+/).some((w: string) => w.startsWith(q));

      if (aWordStarts && !bWordStarts) return -1;
      if (!aWordStarts && bWordStarts) return 1;

      return 0; // retain date sort
    });

    return matched;
  }, [allPatients, patientSearch]);

  // Handle register and select
  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.name || !regForm.age || !regForm.mobile) {
      alert('Please fill Name, Age, and Mobile fields.');
      return;
    }

    try {
      let docId: number | null = null;
      let referredDoctor: string | null = null;
      if (regForm.referredDoctorId) {
        docId = Number(regForm.referredDoctorId);
        const doc = doctors.find(d => d.id === docId);
        referredDoctor = doc ? doc.name : null;
      }

      const created = await db.query('patient', 'create', {
        data: {
          name: regForm.name,
          age: Number(regForm.age),
          ageUnit: regForm.ageUnit,
          gender: regForm.gender,
          mobile: regForm.mobile,
          email: regForm.email || null,
          address: regForm.address || null,
          bloodGroup: regForm.bloodGroup || null,
          referredDoctor,
          referredDoctorId: docId,
          createdBy: currentUser?.id || 1,

        }
      });

      if (created) {
        setPatient(created);
        setAllPatients(prev => [created, ...prev]);
        setShowRegisterForm(false);
        setRegForm({
          name: '',
          mobile: '',
          age: '',
          ageUnit: 'YEARS',
          gender: 'MALE',
          bloodGroup: '',
          referredDoctorId: '',
          email: '',
          address: ''
        });
      }
    } catch (err) {
      console.error("Failed to register patient:", err);
      alert("Failed to register new patient. Mobile or ID might already be registered.");
    }
  };

  const addTest = (test: any) => {
    if (!selectedTests.find(t => t.id === test.id)) {
      setSelectedTests([...selectedTests, test]);
    }
    setSearch('');
  };

  const removeTest = (id: number) => {
    setSelectedTests(selectedTests.filter(t => t.id !== id));
  };

  // Calculations
  const subtotal = useMemo(() => selectedTests.reduce((acc, t) => acc + t.price, 0), [selectedTests]);
  
  const discountAmount = useMemo(() => {
    if (discountType === 'FLAT') return discountValue;
    return (subtotal * discountValue) / 100;
  }, [subtotal, discountType, discountValue]);

  const amountAfterDiscount = Math.max(0, subtotal - discountAmount);
  
  const gstAmount = useMemo(() => {
    return (amountAfterDiscount * gstPercent) / 100;
  }, [amountAfterDiscount, gstPercent]);

  const totalAmount = amountAfterDiscount + gstAmount;
  const dueAmount = Math.max(0, totalAmount - paidAmount);

  // Auto-set paid amount to total if empty initially
  useEffect(() => {
    setPaidAmount(totalAmount);
  }, [totalAmount]);

  const filteredTests = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      return tests;
    }
    let matched = tests.filter(t => 
      t.name.toLowerCase().includes(q) || 
      t.code.toLowerCase().includes(q) ||
      (t.shortName && t.shortName.toLowerCase().includes(q))
    );

    // Prioritize prefix and word-start matches on test name, shortName or code
    matched = [...matched].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      const shortA = (a.shortName || '').toLowerCase();
      const shortB = (b.shortName || '').toLowerCase();
      const codeA = a.code.toLowerCase();
      const codeB = b.code.toLowerCase();

      const aStarts = nameA.startsWith(q) || shortA.startsWith(q) || codeA.startsWith(q);
      const bStarts = nameB.startsWith(q) || shortB.startsWith(q) || codeB.startsWith(q);

      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      const aWordStarts = nameA.split(/\s+/).some((w: string) => w.startsWith(q)) || shortA.split(/\s+/).some((w: string) => w.startsWith(q));
      const bWordStarts = nameB.split(/\s+/).some((w: string) => w.startsWith(q)) || shortB.split(/\s+/).some((w: string) => w.startsWith(q));

      if (aWordStarts && !bWordStarts) return -1;
      if (!aWordStarts && bWordStarts) return 1;

      return 0;
    });

    return matched;
  }, [tests, search]);

  const handleSave = async () => {
    if (!patient) return alert("Please select a patient");
    if (selectedTests.length === 0) return alert("Please select at least one test");
    
    setIsSubmitting(true);
    try {
      const billNo = await nextNumber('bill');
      const orderNo = await nextNumber('order');

      // Calculate referral commission if patient has doctor
      let referralCommission = null;
      if (patient.referredDoctorId) {
        const doc = doctors.find(d => d.id === patient.referredDoctorId) || 
                    await db.query('doctor', 'findUnique', { where: { id: patient.referredDoctorId } });
        if (doc && doc.commission) {
          referralCommission = (totalAmount * doc.commission) / 100;
        }
      }

      // 1. Create Bill
      const bill = await db.query('bill', 'create', {
        data: {
          billNo,
          patientId: patient.id,
          subtotal,
          discountType,
          discountValue,
          discountAmount,
          gstPercent,
          gstAmount,
          totalAmount,
          paidAmount,
          dueAmount,
          paymentMethod,
          paymentStatus: dueAmount <= 0 ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'UNPAID'),
          referralCommission
        }
      });

      // 2. Create Payment if paid
      if (paidAmount > 0) {
        await db.query('payment', 'create', {
          data: {
            billId: bill.id,
            amount: paidAmount,
            method: paymentMethod,
            receivedBy: currentUser?.id || 1

          }
        });
      }

      // 3. Create Order
      const order = await db.query('testOrder', 'create', {
        data: {
          orderNo,
          patientId: patient.id,
          billId: bill.id,
          priority: 'ROUTINE',
          items: {
            create: selectedTests.map(t => ({
              testId: t.id
            }))
          }
        }
      });

      // Show success toast/alert and redirect to bills page
      alert(`Invoice and Order created successfully!\nBill No: ${billNo}\nOrder No: ${orderNo}`);
      router.push(`/billing`);
    } catch (error) {
      console.error(error);
      alert("Failed to create billing and order");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout 
      title="Create New Invoice" 
      breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Billing', href: '/billing' }, { label: 'New Bill' }]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        
        {/* Left Column - Patient & Test Selection */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-lg border shadow-sm p-6">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <h3 className="text-lg font-medium text-foreground">Patient Information</h3>
              {!patient && !showRegisterForm && (
                <button
                  onClick={() => setShowRegisterForm(true)}
                  className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  <Plus className="h-4 w-4" /> Register New
                </button>
              )}
              {!patient && showRegisterForm && (
                <button
                  onClick={() => setShowRegisterForm(false)}
                  className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Search Existing
                </button>
              )}
            </div>

            {patient ? (
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-lg text-foreground">{patient.name}</p>
                  <p className="text-sm text-muted-foreground">
                    ID: {patient.id} • {patient.age} {patient.ageUnit || 'YEARS'} • {patient.gender}
                  </p>
                  {patient.mobile && <p className="text-sm text-muted-foreground">Mobile: {patient.mobile}</p>}
                  {patient.referredDoctor && (
                    <p className="text-sm text-primary mt-1 font-medium">Referred By: {patient.referredDoctor}</p>
                  )}
                </div>
                {!initialPatientId && (
                  <button 
                    onClick={() => {
                      setPatient(null);
                      setPatientSearch('');
                    }} 
                    className="text-red-500 hover:text-red-700 text-sm font-medium hover:underline"
                  >
                    Change Patient
                  </button>
                )}
              </div>
            ) : showRegisterForm ? (
              /* Inline Registration Form */
              <form onSubmit={handleRegisterPatient} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={regForm.name}
                      onChange={e => setRegForm({ ...regForm, name: e.target.value })}
                      placeholder="Enter full name"
                      className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Mobile *</label>
                    <input
                      type="text"
                      required
                      value={regForm.mobile}
                      onChange={e => setRegForm({ ...regForm, mobile: e.target.value })}
                      placeholder="10-digit number"
                      className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Age *</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        required
                        min={0}
                        value={regForm.age}
                        onChange={e => setRegForm({ ...regForm, age: e.target.value })}
                        placeholder="Age"
                        className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <select
                        value={regForm.ageUnit}
                        onChange={e => setRegForm({ ...regForm, ageUnit: e.target.value })}
                        className="w-24 h-10 rounded-lg border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                      >
                        <option value="YEARS">Yrs</option>
                        <option value="MONTHS">Mths</option>
                        <option value="DAYS">Days</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Gender *</label>
                    <select
                      value={regForm.gender}
                      onChange={e => setRegForm({ ...regForm, gender: e.target.value })}
                      className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Blood Group</label>
                    <select
                      value={regForm.bloodGroup}
                      onChange={e => setRegForm({ ...regForm, bloodGroup: e.target.value })}
                      className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    >
                      <option value="">Select...</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Referred Doctor</label>
                    <select
                      value={regForm.referredDoctorId}
                      onChange={e => setRegForm({ ...regForm, referredDoctorId: e.target.value })}
                      className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                    >
                      <option value="">Self Referral</option>
                      {doctors.map(d => (
                        <option key={d.id} value={d.id}>{d.name} ({d.qualification || 'MBBS'})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                    <input
                      type="email"
                      value={regForm.email}
                      onChange={e => setRegForm({ ...regForm, email: e.target.value })}
                      placeholder="patient@email.com"
                      className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
                  <input
                    type="text"
                    value={regForm.address}
                    onChange={e => setRegForm({ ...regForm, address: e.target.value })}
                    placeholder="Residential address"
                    className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRegisterForm(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-accent text-sm text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 text-sm"
                  >
                    Register &amp; Select
                  </button>
                </div>
              </form>
            ) : (
              /* Patient Search Box */
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary text-sm"
                  placeholder="Search existing patients by name, mobile, or ID..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  onFocus={() => setShowPatientDropdown(true)}
                  onBlur={() => setShowPatientDropdown(false)}
                />
                {showPatientDropdown && searchResults.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full bg-card border shadow-lg max-h-60 rounded-md py-1 text-sm overflow-auto">
                    {searchResults.map((p: any) => (
                      <li
                        key={p.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setPatient(p);
                          setPatientSearch('');
                          setShowPatientDropdown(false);
                        }}
                        className="px-4 py-2 cursor-pointer hover:bg-accent flex justify-between items-center text-foreground"
                      >
                        <div>
                          <span className="font-semibold">{p.name}</span>
                          <span className="text-muted-foreground text-xs ml-2">({p.id})</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.gender} • {p.age} {p.ageUnit} • {p.mobile}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {patientSearch && showPatientDropdown && searchResults.length === 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-card border shadow-lg rounded-md py-3 px-4 text-sm text-muted-foreground text-center">
                    No patients found. Click &quot;Register New&quot; above to create one.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-card rounded-lg border shadow-sm p-6">
            <h3 className="text-lg font-medium border-b pb-4 mb-4 text-foreground">Select Tests</h3>
            <div className="relative mb-6">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary text-sm"
                placeholder="Search tests by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setShowTestDropdown(true)}
                onBlur={() => setShowTestDropdown(false)}
              />
              {showTestDropdown && filteredTests.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-card border shadow-lg max-h-60 rounded-md py-1 text-sm overflow-auto">
                  {filteredTests.map((t) => (
                    <li 
                      key={t.id} 
                      className="text-foreground cursor-pointer hover:bg-accent select-none py-2 px-4 flex justify-between"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTest(t);
                        setShowTestDropdown(false);
                      }}
                    >
                      <div>
                        <span className="font-medium">{t.name}</span> 
                        <span className="text-muted-foreground text-xs ml-2">{t.code}</span>
                      </div>
                      <span className="text-primary font-medium">₹{t.price}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Test Name</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Price</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {selectedTests.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        No tests selected. Search and add tests above.
                      </td>
                    </tr>
                  ) : (
                    selectedTests.map((t) => (
                      <tr key={t.id} className="text-sm text-foreground">
                        <td className="px-4 py-3 font-medium">{t.name}</td>
                        <td className="px-4 py-3 text-right font-medium">₹{t.price.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => removeTest(t.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - Billing Summary */}
        <div className="space-y-6">
          <div className="bg-card rounded-lg border shadow-sm p-6 sticky top-6">
            <h3 className="text-lg font-medium border-b pb-4 mb-4 flex items-center text-foreground">
              <Receipt className="h-5 w-5 mr-2 text-muted-foreground" /> Payment Summary
            </h3>
            
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center text-foreground">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">₹{subtotal.toFixed(2)}</span>
              </div>
              
              <div className="border-t pt-4">
                <label className="block text-xs font-medium text-muted-foreground uppercase mb-2">Discount</label>
                <div className="flex space-x-2">
                  <select 
                    value={discountType} 
                    onChange={(e) => setDiscountType(e.target.value as any)}
                    disabled={!isAdmin && !isAuthorized}
                    className="border border-gray-300 rounded-md px-2 py-1 bg-background text-foreground text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="FLAT">₹ Flat</option>
                    <option value="PERCENT">% Percent</option>
                  </select>
                  <div className="relative flex-1">
                    <input 
                      type="number" 
                      value={discountValue || ''}
                      onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                      disabled={!isAdmin && !isAuthorized}
                      className="border border-gray-300 rounded-md pl-2 pr-8 py-1 w-full text-right bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed" 
                      placeholder="0"
                    />
                    {!isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isAuthorized) {
                            setIsAuthorized(false);
                            setDiscountValue(0);
                          } else {
                            setShowAuthModal(true);
                          }
                        }}
                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors ${
                          isAuthorized 
                            ? 'text-green-500 hover:bg-green-500/10' 
                            : 'text-amber-500 hover:bg-amber-500/10'
                        }`}
                        title={isAuthorized ? "Click to lock controls" : "Click to authorize with Manager credentials"}
                      >
                        <Lock className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {!isAdmin && (
                  <span className={`text-[10px] font-semibold mt-1 block ${isAuthorized ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}`}>
                    {isAuthorized 
                      ? '✓ Manager Discount Authorized' 
                      : '🔒 Only Admins can apply discounts. Click lock icon to authorize.'}
                  </span>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between items-center mt-2 text-green-600 dark:text-green-400">
                    <span>Discount Applied</span>
                    <span>- ₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="border-t pt-4 flex justify-between items-center text-foreground">
                <span className="text-muted-foreground">GST ({gstPercent}%)</span>
                <span>₹{gstAmount.toFixed(2)}</span>
              </div>

              <div className="border-t pt-4 flex justify-between items-center text-lg font-bold text-foreground">
                <span>Total Amount</span>
                <span className="text-primary">₹{totalAmount.toFixed(2)}</span>
              </div>

              <div className="border-t border-b py-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase mb-2">Payment Method</label>
                  <select 
                    value={paymentMethod} 
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 bg-background text-foreground"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase mb-2">Paid Amount</label>
                  <input 
                    type="number" 
                    value={paidAmount || ''}
                    onChange={(e) => setPaidAmount(Math.max(0, Math.min(Number(e.target.value), totalAmount)))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 font-bold text-right text-lg text-green-700 bg-green-50 dark:bg-green-950/20 dark:text-green-400"
                    placeholder={totalAmount.toFixed(2)}
                  />
                </div>
              </div>

              <div className="flex justify-between items-center font-medium text-foreground">
                <span className="text-muted-foreground">Balance Due</span>
                <span className={dueAmount > 0 ? "text-red-600 dark:text-red-400 font-bold" : "font-semibold"}>
                  ₹{dueAmount.toFixed(2)}
                </span>
              </div>

              <button 
                onClick={handleSave}
                disabled={isSubmitting || !patient || selectedTests.length === 0}
                className="w-full mt-6 py-3 px-4 border border-transparent rounded-md shadow-sm text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 font-bold text-lg transition-colors"
              >
                {isSubmitting ? 'Processing...' : 'Generate Bill & Order'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Manager Authorization Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowAuthModal(false);
              setAuthError(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-gradient-to-br from-primary/10 to-purple-500/10 blur-2xl pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Manager Discount Authorization</h3>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">Enter Admin credentials to unlock discounts</p>
                </div>
              </div>

              {authError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400 mb-4 font-semibold">
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuthorize} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Admin Email</label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="admin@lab.com"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Admin Password</label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAuthModal(false);
                      setAuthError(null);
                    }}
                    className="px-4 py-2 border rounded-xl hover:bg-accent text-sm text-foreground font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/95 text-sm flex items-center gap-1.5"
                  >
                    {authLoading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                    <span>Authorize</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AppLayout>

  );
}

export default function NewBillingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground font-medium">Loading Billing System...</div>
      </div>
    }>
      <NewBillingPageContent />
    </Suspense>
  );
}
