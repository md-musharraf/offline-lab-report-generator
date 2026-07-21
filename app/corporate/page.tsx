"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Plus, Building2, Edit, FileText, X } from 'lucide-react';
import { formatCurrency } from '@/shared/constants';
import { useState, useEffect } from 'react';

interface Corporate {
  id: number;
  name: string;
  contact: string;
  mobile: string;
  email: string;
  creditDays: number;
  discount: number;
  balance: number;
  isActive: boolean;
}

const initialCorporates: Corporate[] = [];

const emptyForm = { name: '', contact: '', mobile: '', email: '', creditDays: 30, discount: 0 };

export default function CorporatePage() {
  const [corporates, setCorporates] = useState<Corporate[]>(initialCorporates);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Corporate | null>(null);
  const [statementTarget, setStatementTarget] = useState<Corporate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const totalOutstanding = corporates.reduce((sum, c) => sum + c.balance, 0);

  const handleAdd = () => {
    if (!form.name.trim()) { setToast({ message: 'Company name is required', type: 'error' }); return; }
    const newCorp: Corporate = {
      id: Date.now(),
      name: form.name,
      contact: form.contact,
      mobile: form.mobile,
      email: form.email,
      creditDays: Number(form.creditDays),
      discount: Number(form.discount),
      balance: 0,
      isActive: true,
    };
    setCorporates(prev => [...prev, newCorp]);
    setForm(emptyForm);
    setShowAddModal(false);
    setToast({ message: `${newCorp.name} added successfully`, type: 'success' });
  };

  const handleEdit = () => {
    if (!editTarget) return;
    if (!form.name.trim()) { setToast({ message: 'Company name is required', type: 'error' }); return; }
    setCorporates(prev => prev.map(c => c.id === editTarget.id ? {
      ...c,
      name: form.name,
      contact: form.contact,
      mobile: form.mobile,
      email: form.email,
      creditDays: Number(form.creditDays),
      discount: Number(form.discount),
    } : c));
    setShowEditModal(false);
    setEditTarget(null);
    setForm(emptyForm);
    setToast({ message: 'Corporate updated successfully', type: 'success' });
  };

  const openEdit = (c: Corporate) => {
    setEditTarget(c);
    setForm({ name: c.name, contact: c.contact, mobile: c.mobile, email: c.email, creditDays: c.creditDays, discount: c.discount });
    setShowEditModal(true);
  };

  const openStatement = (c: Corporate) => {
    setStatementTarget(c);
    setShowStatementModal(true);
  };

  const renderForm = (onSubmit: () => void, title: string) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in-up" onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditTarget(null); setForm(emptyForm); }}>
      <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button 
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" 
            onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditTarget(null); setForm(emptyForm); }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Company Name *</label>
            <input className="w-full mt-1.5 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Contact Person</label>
            <input className="w-full mt-1.5 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mobile</label>
              <input className="w-full mt-1.5 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email</label>
              <input className="w-full mt-1.5 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Credit Days</label>
              <input type="number" className="w-full mt-1.5 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.creditDays} onChange={e => setForm(f => ({ ...f, creditDays: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Discount %</label>
              <input type="number" className="w-full mt-1.5 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className="rounded-xl border px-5 py-2.5 text-sm font-bold hover:bg-accent" onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditTarget(null); setForm(emptyForm); }}>Cancel</button>
          <button className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow" onClick={onSubmit}>{title.includes('Add') ? 'Add' : 'Save'}</button>
        </div>
      </div>
    </div>
  );

  return (
    <AppLayout title="Corporate Accounts" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Corporate' }]}>
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Corporates</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{corporates.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Outstanding</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalOutstanding)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">This Month Revenue</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">{formatCurrency(485000)}</p>
            </div>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }} 
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow shrink-0 self-start md:self-auto" 
            onClick={() => { setForm(emptyForm); setShowAddModal(true); }}
          >
            <Plus className="h-4 w-4" />
            Add Corporate
          </motion.button>
        </div>
        <div className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <th className="px-5 py-3.5">Company</th>
                <th className="px-5 py-3.5">Contact</th>
                <th className="px-5 py-3.5">Credit Days</th>
                <th className="px-5 py-3.5">Discount</th>
                <th className="px-5 py-3.5">Balance Due</th>
                <th className="px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {corporates.map((c, i) => (
                <motion.tr 
                  key={c.id} 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  transition={{ delay: i * 0.03 }} 
                  className="border-b hover:bg-accent/50 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <div>
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-foreground">{c.contact}</p>
                    <p className="text-xs text-muted-foreground">{c.mobile}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="badge bg-muted text-muted-foreground">
                      {c.creditDays} days
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-green-600 dark:text-green-400">
                    {c.discount}%
                  </td>
                  <td className="px-5 py-3.5 font-bold text-red-600 dark:text-red-400">
                    {c.balance > 0 ? formatCurrency(c.balance) : <span className="text-green-600 dark:text-green-400 font-semibold">Cleared</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1.5">
                      <button 
                        className="btn-action text-muted-foreground hover:text-foreground hover:bg-accent" 
                        title="Statement" 
                        onClick={() => openStatement(c)}
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button 
                        className="btn-action text-muted-foreground hover:text-foreground hover:bg-accent" 
                        title="Edit" 
                        onClick={() => openEdit(c)}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && renderForm(handleAdd, 'Add Corporate')}
      {showEditModal && editTarget && renderForm(handleEdit, 'Edit Corporate')}

      {showStatementModal && statementTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in-up" onClick={() => { setShowStatementModal(false); setStatementTarget(null); }}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-foreground">Account Statement</h3>
              <button 
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" 
                onClick={() => { setShowStatementModal(false); setStatementTarget(null); }}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="h-5 w-5 text-primary" />
                <p className="font-semibold text-foreground">{statementTarget.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-3 bg-accent/30">
                  <p className="text-xs text-muted-foreground font-semibold">Balance Due</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">{statementTarget.balance > 0 ? formatCurrency(statementTarget.balance) : <span className="text-green-600 dark:text-green-400 font-semibold">Cleared</span>}</p>
                </div>
                <div className="rounded-xl border p-3 bg-accent/30">
                  <p className="text-xs text-muted-foreground font-semibold">Credit Days</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{statementTarget.creditDays} days</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-3 bg-accent/30">
                  <p className="text-xs text-muted-foreground font-semibold">Discount</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{statementTarget.discount}%</p>
                </div>
                <div className="rounded-xl border p-3 bg-accent/30">
                  <p className="text-xs text-muted-foreground font-semibold">Status</p>
                  <p className="text-lg font-bold text-foreground">{statementTarget.isActive ? 'Active' : 'Inactive'}</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p><span className="font-semibold">Contact:</span> {statementTarget.contact}</p>
                <p><span className="font-semibold">Mobile:</span> {statementTarget.mobile}</p>
                <p><span className="font-semibold">Email:</span> {statementTarget.email}</p>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button className="rounded-xl border px-5 py-2.5 text-sm font-bold hover:bg-accent" onClick={() => { setShowStatementModal(false); setStatementTarget(null); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-global fixed bottom-6 right-6 z-[200] ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
