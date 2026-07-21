"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Plus, Search, Edit, Phone, DollarSign, Trash2, ToggleLeft, ToggleRight, XIcon, ArrowUpDown } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '@/shared/constants';
import { db } from '@/lib/db';

interface Doctor {
  id: number;
  name: string;
  qualification: string;
  hospital: string;
  mobile: string;
  commission: number;
  type: 'PERCENT' | 'FLAT';
  patients: number;
  totalCommission: number;
  pendingComm: number;
  isActive: boolean;
}

const initialDoctors: Doctor[] = [];

const emptyForm = {
  name: '',
  qualification: '',
  hospital: '',
  mobile: '',
  commission: 0,
  type: 'PERCENT' as 'PERCENT' | 'FLAT',
  isActive: true,
};

export default function DoctorsPage() {
  const [search, setSearch] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>(initialDoctors);
  
  const [sortField, setSortField] = useState<keyof Doctor>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchDoctors = async () => {
    try {
      const allDoctors = await db.query('doctor', 'findMany', {
        orderBy: { name: 'asc' }
      });
      
      const allBills = await db.query('bill', 'findMany', {
        include: { patient: true }
      });
      
      const mappedDoctors = allDoctors.map((doc: any) => {
        const docBills = allBills.filter((b: any) => b.patient?.referredDoctorId === doc.id);
        const docPatientsCount = new Set(docBills.map((b: any) => b.patientId)).size;
        
        let totalCommission = 0;
        let pendingComm = 0;
        
        docBills.forEach((b: any) => {
          let comm = b.referralCommission;
          if (comm === null || comm === undefined) {
            if (doc.commission > 0) {
              comm = (doc.commission / 100) * b.subtotal;
            } else {
              comm = 0;
            }
          }
          
          totalCommission += comm;
          if (b.paymentStatus !== 'PAID') {
            pendingComm += comm;
          }
        });
        
        return {
          id: doc.id,
          name: doc.name,
          qualification: doc.qualification || '',
          hospital: doc.hospital || '',
          mobile: doc.mobile || '',
          commission: doc.commission,
          type: 'PERCENT' as const,
          patients: docPatientsCount,
          totalCommission: totalCommission,
          pendingComm: pendingComm,
          isActive: doc.isActive
        };
      });
      
      setDoctors(mappedDoctors);
    } catch (err) {
      console.error('Error fetching doctors:', err);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const filtered = useMemo(() => {
    return doctors.filter(d =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.hospital.toLowerCase().includes(search.toLowerCase()) ||
      d.mobile.includes(search)
    );
  }, [doctors, search]);

  const sortedDoctors = useMemo(() => {
    let result = [...filtered];
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      if (typeof valA === 'boolean' && typeof valB === 'boolean') {
        return sortDirection === 'asc' 
          ? (valA === valB ? 0 : valA ? 1 : -1)
          : (valA === valB ? 0 : valB ? 1 : -1);
      }

      return 0;
    });
    return result;
  }, [filtered, sortField, sortDirection]);

  const handleAdd = () => {
    setForm(emptyForm);
    setShowAddModal(true);
  };

  const handleAddSubmit = async () => {
    if (!form.name.trim()) {
      setToast({ message: 'Doctor name is required', type: 'error' });
      return;
    }
    if (!form.mobile.trim()) {
      setToast({ message: 'Mobile number is required', type: 'error' });
      return;
    }
    try {
      const newDoc = await db.query('doctor', 'create', {
        data: {
          name: form.name.trim(),
          qualification: form.qualification.trim() || null,
          hospital: form.hospital.trim() || null,
          mobile: form.mobile.trim() || null,
          commission: form.commission,
          isActive: form.isActive
        }
      });
      if (newDoc) {
        await fetchDoctors();
        setShowAddModal(false);
        setToast({ message: `${newDoc.name} added successfully`, type: 'success' });
      }
    } catch (err: any) {
      setToast({ message: `Failed to add doctor: ${err.message || err}`, type: 'error' });
    }
  };

  const handleEditOpen = (d: Doctor) => {
    setEditingId(d.id);
    setForm({
      name: d.name,
      qualification: d.qualification,
      hospital: d.hospital,
      mobile: d.mobile,
      commission: d.commission,
      type: d.type,
      isActive: d.isActive,
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async () => {
    if (!form.name.trim()) {
      setToast({ message: 'Doctor name is required', type: 'error' });
      return;
    }
    try {
      await db.query('doctor', 'update', {
        where: { id: editingId },
        data: {
          name: form.name.trim(),
          qualification: form.qualification.trim() || null,
          hospital: form.hospital.trim() || null,
          mobile: form.mobile.trim() || null,
          commission: form.commission,
          isActive: form.isActive
        }
      });
      await fetchDoctors();
      setShowEditModal(false);
      setEditingId(null);
      setToast({ message: `Doctor updated successfully`, type: 'success' });
    } catch (err: any) {
      setToast({ message: `Failed to update doctor: ${err.message || err}`, type: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    const doc = doctors.find(d => d.id === id);
    try {
      await db.query('doctor', 'delete', {
        where: { id: id }
      });
      await fetchDoctors();
      setShowDeleteConfirm(null);
      setToast({ message: `${doc?.name ?? 'Doctor'} removed successfully`, type: 'success' });
    } catch (err: any) {
      setToast({ message: `Failed to delete doctor: ${err.message || err}`, type: 'error' });
    }
  };

  const handleToggleActive = async (id: number) => {
    const doc = doctors.find(d => d.id === id);
    if (!doc) return;
    const toggled = !doc.isActive;
    try {
      await db.query('doctor', 'update', {
        where: { id: id },
        data: { isActive: toggled }
      });
      await fetchDoctors();
      setToast({ message: `${doc.name} ${toggled ? 'activated' : 'deactivated'}`, type: 'success' });
    } catch (err: any) {
      setToast({ message: `Failed to toggle active status: ${err.message || err}`, type: 'error' });
    }
  };

  // Commission report data
  const totalCommission = doctors.reduce((s, d) => s + d.totalCommission, 0);
  const totalPending = doctors.reduce((s, d) => s + d.pendingComm, 0);
  const totalPaid = totalCommission - totalPending;

  const inputClasses = "w-full h-11 rounded-xl border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground";
  const labelClasses = "form-label block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5";

  const renderForm = () => (
    <div className="space-y-4">
      <div>
        <label className={labelClasses}>Doctor Name *</label>
        <input type="text" placeholder="e.g. Dr. John Smith" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClasses} />
      </div>
      <div>
        <label className={labelClasses}>Qualification</label>
        <input type="text" placeholder="e.g. MD Pathology" value={form.qualification} onChange={e => setForm(f => ({ ...f, qualification: e.target.value }))} className={inputClasses} />
      </div>
      <div>
        <label className={labelClasses}>Hospital / Clinic</label>
        <input type="text" placeholder="e.g. City Hospital" value={form.hospital} onChange={e => setForm(f => ({ ...f, hospital: e.target.value }))} className={inputClasses} />
      </div>
      <div>
        <label className={labelClasses}>Mobile *</label>
        <input type="text" placeholder="e.g. 9876543210" value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} className={inputClasses} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClasses}>Commission</label>
          <input type="number" min={0} value={form.commission} onChange={e => setForm(f => ({ ...f, commission: Number(e.target.value) }))} className={inputClasses} />
        </div>
        <div>
          <label className={labelClasses}>Commission Type</label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'PERCENT' | 'FLAT' }))} className={inputClasses}>
            <option value="PERCENT">Percent (%)</option>
            <option value="FLAT">Flat (₹)</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="h-5 w-5 rounded-md border-gray-300 text-primary focus:ring-primary cursor-pointer" />
        <label htmlFor="isActive" className="text-sm font-semibold text-foreground cursor-pointer">Active</label>
      </div>
    </div>
  );

  return (
    <AppLayout title="Doctors / Referrals" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Doctors' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search doctors..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 rounded-xl border bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground" />
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 bg-background shadow-sm h-11 text-xs">
              <span className="text-muted-foreground whitespace-nowrap">Sort By:</span>
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [field, direction] = e.target.value.split('-');
                  setSortField(field as keyof Doctor);
                  setSortDirection(direction as 'asc' | 'desc');
                }}
                className="font-semibold bg-transparent focus:outline-none border-none text-foreground cursor-pointer"
              >
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="patients-desc">Patients (High-Low)</option>
                <option value="patients-asc">Patients (Low-High)</option>
                <option value="totalCommission-desc">Commission (High-Low)</option>
                <option value="totalCommission-asc">Commission (Low-High)</option>
                <option value="pendingComm-desc">Pending (High-Low)</option>
                <option value="pendingComm-asc">Pending (Low-High)</option>
              </select>
            </div>
            <button onClick={() => setShowCommissionModal(true)} className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-accent text-foreground transition-all"><DollarSign className="h-4 w-4" />Commission Report</button>
            <motion.button whileHover={{ scale: 1.02 }} onClick={handleAdd} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow hover:bg-primary/90 transition-all"><Plus className="h-4 w-4" />Add Doctor</motion.button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedDoctors.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow ${!d.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">{d.name.split(' ').pop()?.charAt(0)}</div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.qualification}</p>
                    <p className="text-xs text-muted-foreground">{d.hospital}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleEditOpen(d)} title="Edit" className="btn-action rounded-lg hover:bg-accent text-muted-foreground"><Edit className="h-4 w-4" /></button>
                  <button onClick={() => handleToggleActive(d.id)} title={d.isActive ? 'Deactivate' : 'Activate'} className="btn-action rounded-lg hover:bg-accent">
                    {d.isActive ? <ToggleRight className="h-4 w-4 text-green-500 dark:text-green-400" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <button onClick={() => setShowDeleteConfirm(d.id)} title="Delete" className="btn-action rounded-lg hover:bg-accent text-muted-foreground"><Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" /></button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <p className="text-lg font-bold text-foreground">{d.patients}</p>
                  <p className="text-xs text-muted-foreground">Patients</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <p className="text-xs font-bold text-foreground">{d.type === 'PERCENT' ? `${d.commission}%` : `₹${d.commission}`}</p>
                  <p className="text-xs text-muted-foreground">Commission</p>
                </div>
                <div className="rounded-lg bg-orange-100 dark:bg-orange-950/50 p-2 text-center">
                  <p className="text-xs font-bold text-orange-700 dark:text-orange-400">{formatCurrency(d.pendingComm)}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{d.mobile}</span>
                {!d.isActive && <span className="ml-auto text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/50 px-2 py-0.5 rounded-full animate-fade-in-up">Inactive</span>}
              </div>
            </motion.div>
          ))}
          {sortedDoctors.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <p className="text-sm">No doctors found{search ? ` matching "${search}"` : ''}.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Doctor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Add Doctor</h2>
              <button onClick={() => setShowAddModal(false)} className="btn-action rounded-lg hover:bg-accent text-muted-foreground"><XIcon className="h-4 w-4" /></button>
            </div>
            {renderForm()}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-sm font-bold rounded-xl border hover:bg-accent text-foreground transition-all">Cancel</button>
              <button onClick={handleAddSubmit} className="px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground btn-primary-glow hover:bg-primary/90 transition-all shadow-sm">Add Doctor</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Doctor Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Edit Doctor</h2>
              <button onClick={() => setShowEditModal(false)} className="btn-action rounded-lg hover:bg-accent text-muted-foreground"><XIcon className="h-4 w-4" /></button>
            </div>
            {renderForm()}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowEditModal(false)} className="px-5 py-2.5 text-sm font-bold rounded-xl border hover:bg-accent text-foreground transition-all">Cancel</button>
              <button onClick={handleEditSubmit} className="px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground btn-primary-glow hover:bg-primary/90 transition-all shadow-sm">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Commission Report Modal */}
      {showCommissionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCommissionModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-foreground">Commission Report</h2>
              <button onClick={() => setShowCommissionModal(false)} className="btn-action rounded-lg hover:bg-accent text-muted-foreground"><XIcon className="h-4 w-4" /></button>
            </div>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-lg font-bold text-foreground">{formatCurrency(totalCommission)}</p>
                <p className="text-xs text-muted-foreground">Total Commission</p>
              </div>
              <div className="rounded-lg bg-green-100 dark:bg-green-950/50 p-3 text-center">
                <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatCurrency(totalPaid)}</p>
                <p className="text-xs text-muted-foreground">Paid</p>
              </div>
              <div className="rounded-lg bg-orange-100 dark:bg-orange-950/50 p-3 text-center">
                <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{formatCurrency(totalPending)}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
            {/* Doctor-wise breakdown */}
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left p-3.5 py-3.5 font-semibold uppercase tracking-wider text-xs text-muted-foreground">Doctor</th>
                    <th className="text-right p-3.5 py-3.5 font-semibold uppercase tracking-wider text-xs text-muted-foreground">Rate</th>
                    <th className="text-right p-3.5 py-3.5 font-semibold uppercase tracking-wider text-xs text-muted-foreground">Total</th>
                    <th className="text-right p-3.5 py-3.5 font-semibold uppercase tracking-wider text-xs text-muted-foreground">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map(d => (
                    <tr key={d.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-3.5 text-foreground font-medium">{d.name}</td>
                      <td className="p-3.5 text-right text-muted-foreground">{d.type === 'PERCENT' ? `${d.commission}%` : formatCurrency(d.commission)}</td>
                      <td className="p-3.5 text-right text-foreground">{formatCurrency(d.totalCommission)}</td>
                      <td className="p-3.5 text-right text-orange-600 dark:text-orange-400 font-semibold">{formatCurrency(d.pendingComm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={() => setShowCommissionModal(false)} className="px-5 py-2.5 text-sm font-bold rounded-xl border hover:bg-accent text-foreground transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Delete Doctor</h2>
              <button onClick={() => setShowDeleteConfirm(null)} className="btn-action rounded-lg hover:bg-accent text-muted-foreground"><XIcon className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to remove <span className="font-semibold text-foreground">{doctors.find(d => d.id === showDeleteConfirm)?.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-5 py-2.5 text-sm font-bold rounded-xl border hover:bg-accent text-foreground transition-all">Cancel</button>
              <button onClick={() => handleDelete(showDeleteConfirm)} className="px-5 py-2.5 text-sm font-bold rounded-xl bg-red-650 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-600 transition-all shadow-sm">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-global ${
          toast.type === 'success' ? 'toast-success' : 'toast-error'
        } fixed bottom-6 right-6 z-[200]`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
