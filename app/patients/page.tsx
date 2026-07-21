"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, Filter, Download, Eye, Edit, Phone, Mail, MoreVertical, XIcon, Trash2, Users, FileText, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { formatCurrency, BLOOD_GROUPS, GENDER_OPTIONS } from '@/shared/constants';
import { db } from '@/lib/db';
import { useRouter } from 'next/navigation';
import { cn, getRoleAndPermissions } from '@/lib/utils';
import { AdminOverrideModal } from '@/components/AdminOverrideModal';

interface Patient {
  id: string;
  name: string;
  age: string;
  gender: string;
  mobile: string;
  email: string;
  address: string;
  bloodGroup: string;
  tests: number;
  lastVisit: string;
  status: string;
  totalSpent: number;
}

const initialPatients: Patient[] = [];

const emptyForm = { name: '', age: '', gender: 'Male', mobile: '', email: '', address: '', bloodGroup: '' };

export default function PatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [search, setSearch] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('pathology_lab_current_user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {}
    }
  }, []);

  const { role, permissions } = getRoleAndPermissions(currentUser?.role);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const hasEditPermission = permissions.includes('EDIT_PATIENTS');
  const hasDeletePermission = permissions.includes('DELETE_PATIENTS');

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAction, setOverrideAction] = useState<'EDIT' | 'DELETE' | 'BULK_DELETE' | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<Patient | null>(null);

  const handleEditClick = (p: Patient) => {
    if (isAdmin || hasEditPermission) {
      openEdit(p);
    } else {
      setOverrideAction('EDIT');
      setOverrideTarget(p);
      setOverrideOpen(true);
    }
  };

  const handleDeleteClick = (p: Patient) => {
    if (isAdmin || hasDeletePermission) {
      setDeleteConfirm(p);
    } else {
      setOverrideAction('DELETE');
      setOverrideTarget(p);
      setOverrideOpen(true);
    }
  };

  const handleBulkDeleteClick = () => {
    if (isAdmin || hasDeletePermission) {
      setShowBulkDeleteConfirm(true);
    } else {
      setOverrideAction('BULK_DELETE');
      setOverrideOpen(true);
    }
  };

  const handleOverrideSuccess = () => {
    if (overrideAction === 'EDIT' && overrideTarget) {
      openEdit(overrideTarget);
    } else if (overrideAction === 'DELETE' && overrideTarget) {
      setDeleteConfirm(overrideTarget);
    } else if (overrideAction === 'BULK_DELETE') {
      setShowBulkDeleteConfirm(true);
    }
    setOverrideAction(null);
    setOverrideTarget(null);
  };

  const [showRegister, setShowRegister] = useState(false);
  const [viewPatient, setViewPatient] = useState<Patient | null>(null);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Patient | null>(null);
  const [moreMenuId, setMoreMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [registeredPatientSuccess, setRegisteredPatientSuccess] = useState<{ id: string; name: string } | null>(null);
  
  const [sortField, setSortField] = useState<keyof Patient | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const requestSort = (field: keyof Patient) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortField === field && sortDirection === 'asc') {
      direction = 'desc';
    }
    setSortField(field);
    setSortDirection(direction);
  };

  const SortHeader = ({ field, label }: { field: keyof Patient; label: string }) => {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => requestSort(field)}
        className="flex items-center gap-1 hover:text-foreground font-semibold transition-colors focus:outline-none"
      >
        <span>{label}</span>
        {isActive ? (
          sortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-80" />
        )}
      </button>
    );
  };
  const itemsPerPage = 10;

  const mapDbPatientToUi = (dbPatient: any): Patient => {
    const ageStr = `${dbPatient.age}${dbPatient.ageUnit === 'YEARS' ? 'Y' : dbPatient.ageUnit === 'MONTHS' ? 'M' : 'D'}`;
    const testsCount = dbPatient.orders ? dbPatient.orders.length : 0;
    
    const regDate = dbPatient.registeredAt || dbPatient.createdAt || new Date().toISOString();
    let lastVisitStr = new Date(regDate).toLocaleDateString('en-GB');
    if (dbPatient.orders && dbPatient.orders.length > 0) {
      const dates = dbPatient.orders.map((o: any) => new Date(o.createdAt).getTime());
      const latestDate = Math.max(...dates);
      lastVisitStr = new Date(latestDate).toLocaleDateString('en-GB');
    }
    
    let totalSpent = 0;
    if (dbPatient.bills && dbPatient.bills.length > 0) {
      totalSpent = dbPatient.bills.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
    }
    
    return {
      id: dbPatient.id,
      name: dbPatient.name,
      age: ageStr,
      gender: dbPatient.gender === 'MALE' ? 'Male' : dbPatient.gender === 'FEMALE' ? 'Female' : 'Other',
      mobile: dbPatient.mobile || '',
      email: dbPatient.email || '',
      address: dbPatient.address || '',
      bloodGroup: dbPatient.bloodGroup || '',
      tests: testsCount,
      lastVisit: lastVisitStr,
      status: dbPatient.deletedAt ? 'Inactive' : 'Active',
      totalSpent: totalSpent
    };
  };

  const fetchPatients = useCallback(async () => {
    try {
      const data = await db.query('patient', 'findMany', {
        include: {
          orders: true,
          bills: true
        },
        orderBy: {
          registeredAt: 'desc'
        }
      });
      if (data) {
        setPatients(data.map(mapDbPatientToUi));
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Close more menu on outside click
  useEffect(() => {
    if (moreMenuId) {
      const handler = () => setMoreMenuId(null);
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [moreMenuId]);

  const filtered = useMemo(() => {
    let matched = patients;
    const q = search.toLowerCase().trim();
    if (q) {
      matched = patients.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.mobile.includes(q)
      );

      // Prioritize prefix and word-start matches
      matched = [...matched].sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        const mobileA = a.mobile;
        const mobileB = b.mobile;
        const idA = a.id.toLowerCase();
        const idB = b.id.toLowerCase();

        const aStarts = nameA.startsWith(q) || mobileA.startsWith(q) || idA.startsWith(q);
        const bStarts = nameB.startsWith(q) || mobileB.startsWith(q) || idB.startsWith(q);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aWordStarts = nameA.split(/\s+/).some(w => w.startsWith(q));
        const bWordStarts = nameB.split(/\s+/).some(w => w.startsWith(q));

        if (aWordStarts && !bWordStarts) return -1;
        if (!aWordStarts && bWordStarts) return 1;

        return 0;
      });
    }
    return matched;
  }, [patients, search]);

  const sortedAndFiltered = useMemo(() => {
    let result = [...filtered];
    if (sortField) {
      result.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // 1. age comparison
        if (sortField === 'age') {
          const getAgeInDays = (ageStr: string) => {
            const num = parseInt(ageStr.replace(/\D/g, ''), 10) || 0;
            if (ageStr.toUpperCase().includes('Y')) return num * 365;
            if (ageStr.toUpperCase().includes('M')) return num * 30;
            return num;
          };
          const ageA = getAgeInDays(String(valA));
          const ageB = getAgeInDays(String(valB));
          return sortDirection === 'asc' ? ageA - ageB : ageB - ageA;
        }

        // 2. lastVisit date comparison
        if (sortField === 'lastVisit') {
          const parseDate = (dStr: string) => {
            const parts = dStr.split('/');
            if (parts.length === 3) {
              return new Date(
                parseInt(parts[2], 10),
                parseInt(parts[1], 10) - 1,
                parseInt(parts[0], 10)
              ).getTime();
            }
            return 0;
          };
          return sortDirection === 'asc'
            ? parseDate(String(valA)) - parseDate(String(valB))
            : parseDate(String(valB)) - parseDate(String(valA));
        }

        // 3. general string comparison
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        // 4. numeric comparison
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        return 0;
      });
    }
    return result;
  }, [filtered, sortField, sortDirection]);

  const totalPages = Math.ceil(sortedAndFiltered.length / itemsPerPage) || 1;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [sortedAndFiltered.length, totalPages, currentPage]);

  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedAndFiltered.slice(start, start + itemsPerPage);
  }, [sortedAndFiltered, currentPage]);

  const handleToggleSelect = (patientId: string) => {
    setSelectedPatientIds(prev =>
      prev.includes(patientId) ? prev.filter(id => id !== patientId) : [...prev, patientId]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pagePatientIds = paginatedPatients.map((p: Patient) => p.id);
      setSelectedPatientIds(prev => {
        const next = [...prev];
        pagePatientIds.forEach((id: string) => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
    } else {
      const pagePatientIds = paginatedPatients.map((p: Patient) => p.id);
      setSelectedPatientIds(prev => prev.filter(id => !pagePatientIds.includes(id)));
    }
  };

  const generateNextId = async (): Promise<string> => {
    const year = new Date().getFullYear();
    try {
      // Fetch all patients from DB to get accurate max sequence
      const allPatients = await db.query('patient', 'findMany', {});
      let maxSeq = 0;
      if (allPatients && allPatients.length > 0) {
        allPatients.forEach((p: any) => {
          const parts = (p.id || '').split('-');
          if (parts.length === 3) {
            const seq = parseInt(parts[2], 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
        });
      }
      return `LAB-${year}-${String(maxSeq + 1).padStart(5, '0')}`;
    } catch {
      // Fallback to UI state if DB query fails
      let maxSeq = 0;
      patients.forEach(p => {
        const parts = p.id.split('-');
        if (parts.length === 3) {
          const seq = parseInt(parts[2], 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      });
      return `LAB-${year}-${String(maxSeq + 1).padStart(5, '0')}`;
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.age) {
      setToast({ message: 'Please fill in required fields (Name, Age)', type: 'error' });
      return;
    }

    const ageNum = form.age.replace(/\D/g, '');
    if (!ageNum || isNaN(parseInt(ageNum, 10))) {
      setToast({ message: 'Please enter a valid age', type: 'error' });
      return;
    }
    const ageInt = parseInt(ageNum, 10);
    let ageUnit = 'YEARS';
    if (form.age.toUpperCase().includes('M')) ageUnit = 'MONTHS';
    else if (form.age.toUpperCase().includes('D')) ageUnit = 'DAYS';

    const genderUpper = form.gender.toUpperCase();

    try {
      const nextId = await generateNextId();
      const now = new Date().toISOString();
      const newDbPatient = await db.query('patient', 'create', {
        data: {
          id: nextId,
          name: form.name,
          age: ageInt,
          ageUnit: ageUnit,
          gender: genderUpper,
          mobile: form.mobile,
          email: form.email || null,
          address: form.address || null,
          bloodGroup: form.bloodGroup || null,
          registeredAt: now,
          createdBy: currentUser?.id || 1
        }
      });

      if (newDbPatient) {
        await fetchPatients();
        setShowRegister(false);
        setForm(emptyForm);
        setToast({ message: `Patient ${newDbPatient.name} registered successfully (${newDbPatient.id})`, type: 'success' });
        setRegisteredPatientSuccess({ id: newDbPatient.id, name: newDbPatient.name });
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setToast({ message: `Failed to register patient: ${err.message || err}`, type: 'error' });
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPatient) return;
    if (!editForm.name || !editForm.age) {
      setToast({ message: 'Please fill in required fields (Name, Age)', type: 'error' });
      return;
    }

    const ageInt = parseInt(editForm.age.replace(/\D/g, ''), 10);
    let ageUnit = 'YEARS';
    if (editForm.age.toUpperCase().includes('M')) ageUnit = 'MONTHS';
    else if (editForm.age.toUpperCase().includes('D')) ageUnit = 'DAYS';

    const genderUpper = editForm.gender.toUpperCase();

    try {
      await db.query('patient', 'update', {
        where: { id: editPatient.id },
        data: {
          name: editForm.name,
          age: ageInt,
          ageUnit: ageUnit,
          gender: genderUpper,
          mobile: editForm.mobile,
          email: editForm.email || null,
          address: editForm.address || null,
          bloodGroup: editForm.bloodGroup || null,
        }
      });

      await fetchPatients();
      setEditPatient(null);
      setEditForm(emptyForm);
      setToast({ message: `Patient ${editForm.name} updated successfully`, type: 'success' });
    } catch (err: any) {
      setToast({ message: `Failed to update patient: ${err.message || err}`, type: 'error' });
    }
  };

  const deletePatientData = async (patientId: string) => {
    const patientOrders = await db.query('testOrder', 'findMany', { where: { patientId } });
    const patientBills = await db.query('bill', 'findMany', { where: { patientId } });

    for (const order of (patientOrders || [])) {
      const orderItems = await db.query('testOrderItem', 'findMany', { where: { orderId: order.id } });
      for (const item of (orderItems || [])) {
        const results = await db.query('testResult', 'findMany', { where: { orderItemId: item.id } });
        for (const r of (results || [])) {
          await db.query('testResult', 'delete', { where: { id: r.id } });
        }
        await db.query('testOrderItem', 'delete', { where: { id: item.id } });
      }
      const report = await db.query('report', 'findFirst', { where: { orderId: order.id } });
      if (report) {
        await db.query('report', 'delete', { where: { id: report.id } });
      }
      await db.query('testOrder', 'delete', { where: { id: order.id } });
    }

    for (const bill of (patientBills || [])) {
      const payments = await db.query('payment', 'findMany', { where: { billId: bill.id } });
      for (const py of (payments || [])) {
        await db.query('payment', 'delete', { where: { id: py.id } });
      }
      await db.query('bill', 'delete', { where: { id: bill.id } });
    }

    await db.query('patient', 'delete', { where: { id: patientId } });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const name = deleteConfirm.name;

    try {
      await deletePatientData(deleteConfirm.id);
      setSelectedPatientIds(prev => prev.filter(id => id !== deleteConfirm.id));
      await fetchPatients();
      setDeleteConfirm(null);
      setToast({ message: `Patient ${name} deleted successfully`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      setToast({ message: `Failed to delete patient: ${err.message || err}`, type: 'error' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPatientIds.length === 0) return;
    try {
      for (const id of selectedPatientIds) {
        await deletePatientData(id);
      }
      setSelectedPatientIds([]);
      await fetchPatients();
      setShowBulkDeleteConfirm(false);
      setToast({ message: 'Selected patients deleted successfully', type: 'success' });
    } catch (err: any) {
      console.error(err);
      setToast({ message: `Failed to delete some patients: ${err.message || err}`, type: 'error' });
    }
  };

  const openEdit = (p: Patient) => {
    setEditPatient(p);
    setEditForm({
      name: p.name,
      age: p.age.replace(/[YMD]/gi, ''),
      gender: p.gender,
      mobile: p.mobile,
      email: p.email,
      address: p.address,
      bloodGroup: p.bloodGroup,
    });
  };

  const exportCSV = () => {
    const headers = ['Patient ID', 'Name', 'Age', 'Gender', 'Mobile', 'Email', 'Address', 'Blood Group', 'Tests', 'Last Visit', 'Status', 'Total Spent'];
    const rows = patients.map(p => [p.id, p.name, p.age, p.gender, p.mobile, p.email, p.address, p.bloodGroup, p.tests, p.lastVisit, p.status, p.totalSpent]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `patients_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ message: 'Patients data exported successfully', type: 'success' });
  };

  const inputClass = "w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const labelClass = "block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1";

  const renderFormFields = (
    data: typeof emptyForm,
    setData: React.Dispatch<React.SetStateAction<typeof emptyForm>>
  ) => (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Name <span className="text-red-500">*</span></label>
        <input type="text" className={inputClass} value={data.name} onChange={e => setData(prev => ({ ...prev, name: e.target.value }))} placeholder="Full name" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Age <span className="text-red-500">*</span></label>
          <input type="text" className={inputClass} value={data.age} onChange={e => setData(prev => ({ ...prev, age: e.target.value }))} placeholder="e.g. 45" />
        </div>
        <div>
          <label className={labelClass}>Gender</label>
          <select className={inputClass} value={data.gender} onChange={e => setData(prev => ({ ...prev, gender: e.target.value }))}>
            {GENDER_OPTIONS.map(g => (
              <option key={g.value} value={g.label}>{g.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>Mobile</label>
        <input type="text" className={inputClass} value={data.mobile} onChange={e => setData(prev => ({ ...prev, mobile: e.target.value }))} placeholder="10-digit mobile" />
      </div>
      <div>
        <label className={labelClass}>Email</label>
        <input type="email" className={inputClass} value={data.email} onChange={e => setData(prev => ({ ...prev, email: e.target.value }))} placeholder="email@example.com" />
      </div>
      <div>
        <label className={labelClass}>Address</label>
        <input type="text" className={inputClass} value={data.address} onChange={e => setData(prev => ({ ...prev, address: e.target.value }))} placeholder="Full address" />
      </div>
      <div>
        <label className={labelClass}>Blood Group</label>
        <select className={inputClass} value={data.bloodGroup} onChange={e => setData(prev => ({ ...prev, bloodGroup: e.target.value }))}>
          <option value="">Select</option>
          {BLOOD_GROUPS.map(bg => (
            <option key={bg} value={bg}>{bg}</option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <AppLayout title="Patients" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Patients' }]}>
      <div className="space-y-4">
        {/* Header Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, ID, or mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            {selectedPatientIds.length > 0 && (
              <motion.button
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={handleBulkDeleteClick}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors shadow-sm"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedPatientIds.length})
              </motion.button>
            )}
            <button className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm hover:bg-accent transition-colors">
              <Filter className="h-4 w-4" />
              Filter
            </button>
            <button onClick={exportCSV} className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm hover:bg-accent transition-colors">
              <Download className="h-4 w-4" />
              Export
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowRegister(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Register Patient
            </motion.button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(() => {
            const now = new Date();
            const todayStr = now.toLocaleDateString('en-GB');
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            const thisMonthCount = patients.filter(p => {
              const parts = p.lastVisit.split('/');
              if (parts.length === 3) {
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                return month === currentMonth && year === currentYear;
              }
              return false;
            }).length;
            return [
              { label: 'Total Patients', value: patients.length.toLocaleString(), color: 'text-blue-600 dark:text-blue-400' },
              { label: 'This Month', value: String(thisMonthCount), color: 'text-green-600 dark:text-green-400' },
              { label: 'Today', value: String(patients.filter(p => p.lastVisit === todayStr).length), color: 'text-purple-600 dark:text-purple-400' },
              { label: 'Repeat Visits', value: patients.length > 0 ? Math.round((patients.filter(p => p.tests > 1).length / patients.length) * 100) + '%' : '0%', color: 'text-orange-600 dark:text-orange-400' },
            ];
          })().map((stat) => (
            <div key={stat.label} className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold text-muted-foreground">{stat.label}</p>
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Patients Table */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={paginatedPatients.length > 0 && paginatedPatients.every((p: Patient) => selectedPatientIds.includes(p.id))}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-[18px] w-[18px] bg-background cursor-pointer"
                  />
                </th>
                <th className="px-5 py-3 font-medium"><SortHeader field="id" label="Patient ID" /></th>
                <th className="px-5 py-3 font-medium"><SortHeader field="name" label="Name" /></th>
                <th className="px-5 py-3 font-medium"><SortHeader field="age" label="Age/Gender" /></th>
                <th className="px-5 py-3 font-medium"><SortHeader field="mobile" label="Mobile" /></th>
                <th className="px-5 py-3 font-medium"><SortHeader field="tests" label="Tests" /></th>
                <th className="px-5 py-3 font-medium"><SortHeader field="lastVisit" label="Last Visit" /></th>
                <th className="px-5 py-3 font-medium"><SortHeader field="totalSpent" label="Total Spent" /></th>
                <th className="px-5 py-3 font-medium w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPatients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center">
                        <Users className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">No patients found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {search ? 'Try adjusting your search query' : 'Click "Register Patient" to add a new patient'}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : paginatedPatients.map((p: Patient, i: number) => {
                const isSelected = selectedPatientIds.includes(p.id);
                return (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`border-b hover:bg-accent/50 transition-colors ${isSelected ? 'bg-blue-500/5 dark:bg-blue-950/10' : ''}`}
                  >
                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(p.id)}
                        className="rounded border-border text-primary focus:ring-primary h-[18px] w-[18px] bg-background cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-3 font-mono text-xs font-bold text-primary">{p.id}</td>
                    <td className="px-5 py-3 font-medium text-foreground">{p.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{p.age} / {p.gender}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{p.mobile}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">{p.tests} tests</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{p.lastVisit}</td>
                    <td className="px-5 py-3 font-medium text-foreground">{p.tests > 0 && p.totalSpent > 0 ? formatCurrency(p.totalSpent) : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => router.push(`/quick-register?patientId=${p.id}`)} className="btn-action border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400" title="Quick Entry / Report"><FileText className="h-4 w-4" /></button>
                        <button onClick={() => setViewPatient(p)} className="btn-action" title="View Details"><Eye className="h-4 w-4" /></button>
                        <button 
                          onClick={() => handleEditClick(p)} 
                          className={cn("btn-action", !(isAdmin || hasEditPermission) && "opacity-60")} 
                          title={isAdmin || hasEditPermission ? "Edit Patient" : "Edit Patient (Requires Override)"}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteClick(p)} 
                          className={cn("btn-action border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400", !(isAdmin || hasDeletePermission) && "opacity-60")} 
                          title={isAdmin || hasDeletePermission ? "Delete Patient" : "Delete Patient (Requires Override)"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t px-5 py-3">
            <p className="text-sm text-muted-foreground">Showing {paginatedPatients.length} of {filtered.length} patients</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3.5 py-1.5 rounded border text-sm hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(pNo => (
                <button
                  key={pNo}
                  onClick={() => setCurrentPage(pNo)}
                  className={`px-3.5 py-1.5 rounded text-sm transition-colors ${
                    currentPage === pNo 
                      ? 'bg-primary text-primary-foreground font-bold' 
                      : 'border hover:bg-accent'
                  }`}
                >
                  {pNo}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3.5 py-1.5 rounded border text-sm hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Register Patient Modal */}
      {showRegister && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRegister(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Register New Patient</h2>
              <button onClick={() => setShowRegister(false)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleRegister}>
              {renderFormFields(form, setForm)}
              <div className="flex justify-end gap-2 mt-5">
                <button type="button" onClick={() => setShowRegister(false)} className="px-5 py-2.5 rounded-xl border text-sm font-bold hover:bg-accent transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors">Register Patient</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Patient Modal */}
      {viewPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setViewPatient(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Patient Details</h2>
              <button onClick={() => setViewPatient(null)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">{viewPatient.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{viewPatient.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{viewPatient.id}</p>
                </div>
              </div>
              {[
                { label: 'Age / Gender', value: `${viewPatient.age} / ${viewPatient.gender}` },
                { label: 'Mobile', value: viewPatient.mobile },
                { label: 'Email', value: viewPatient.email || '—' },
                { label: 'Address', value: viewPatient.address || '—' },
                { label: 'Blood Group', value: viewPatient.bloodGroup || '—' },
                { label: 'Total Tests', value: String(viewPatient.tests) },
                { label: 'Last Visit', value: viewPatient.lastVisit },
                { label: 'Status', value: viewPatient.status },
                { label: 'Total Spent', value: viewPatient.tests > 0 && viewPatient.totalSpent > 0 ? formatCurrency(viewPatient.totalSpent) : '—' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <span className="text-sm font-medium text-foreground">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={() => setViewPatient(null)} className="px-5 py-2.5 rounded-xl border text-sm font-bold hover:bg-accent transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Patient Modal */}
      {editPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditPatient(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Edit Patient</h2>
              <button onClick={() => setEditPatient(null)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground font-mono mb-3">{editPatient.id}</p>
            <form onSubmit={handleEdit}>
              {renderFormFields(editForm, setEditForm)}
              <div className="flex justify-end gap-2 mt-5">
                <button type="button" onClick={() => setEditPatient(null)} className="px-5 py-2.5 rounded-xl border text-sm font-bold hover:bg-accent transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Delete Patient</h2>
                  <p className="text-xs text-muted-foreground">This action cannot be undone</p>
                </div>
              </div>
              <button onClick={() => setDeleteConfirm(null)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Are you sure you want to delete <span className="font-semibold text-foreground">{deleteConfirm.name}</span> ({deleteConfirm.id})? All associated orders, reports, and bills will also be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-5 py-2.5 rounded-xl border text-sm font-bold hover:bg-accent transition-colors">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBulkDeleteConfirm(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Bulk Delete Patients</h2>
                  <p className="text-xs text-muted-foreground">This action cannot be undone</p>
                </div>
              </div>
              <button onClick={() => setShowBulkDeleteConfirm(false)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Are you sure you want to delete <span className="font-semibold text-foreground">{selectedPatientIds.length}</span> selected patients? All associated orders, reports, and bills will also be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowBulkDeleteConfirm(false)} className="px-5 py-2.5 rounded-xl border text-sm font-bold hover:bg-accent transition-colors">Cancel</button>
              <button onClick={handleBulkDelete} className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors">Delete All</button>
            </div>
          </div>
        </div>
      )}
      {/* Post-Registration Action Choice Modal */}
      {registeredPatientSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setRegisteredPatientSuccess(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Patient Registered</h2>
                  <p className="text-xs text-muted-foreground">What would you like to do next?</p>
                </div>
              </div>
              <button onClick={() => setRegisteredPatientSuccess(null)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Patient <span className="font-semibold text-foreground">{registeredPatientSuccess.name}</span> ({registeredPatientSuccess.id}) was successfully registered.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const id = registeredPatientSuccess.id;
                  setRegisteredPatientSuccess(null);
                  router.push(`/quick-register?patientId=${id}`);
                }}
                className="w-full px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors shadow-sm"
              >
                Create Bill & Report (Quick Workflow)
              </button>
              <button
                onClick={() => {
                  const id = registeredPatientSuccess.id;
                  setRegisteredPatientSuccess(null);
                  router.push(`/billing/new?patientId=${id}`);
                }}
                className="w-full px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors border border-border"
              >
                Create Regular Invoice
              </button>
              <button
                onClick={() => setRegisteredPatientSuccess(null)}
                className="w-full px-5 py-2.5 rounded-xl border text-sm font-bold hover:bg-accent transition-colors"
              >
                Stay on Patients Page
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Admin Override Modal */}
      <AdminOverrideModal
        isOpen={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        onSuccess={handleOverrideSuccess}
        actionDescription={
          overrideAction === 'EDIT' 
            ? 'editing this patient profile' 
            : overrideAction === 'DELETE' 
              ? 'deleting this patient' 
              : 'bulk deleting patients'
        }
      />

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[200] animate-in slide-in-from-bottom-4 fade-in duration-300 toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="p-0.5 rounded hover:bg-black/10">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
