"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Plus, Download, X, Trash2, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/shared/constants';
import { useState, useEffect, useMemo } from 'react';

interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  paidTo: string;
  method: string;
  date: string;
}

const categories = ['SALARY', 'REAGENT', 'RENT', 'EQUIPMENT', 'MAINTENANCE', 'UTILITY', 'MISC'];
const methods = ['CASH', 'UPI', 'NEFT', 'CHEQUE'];

const initialExpenses: Expense[] = [];

const catColors: Record<string, string> = {
  SALARY: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  REAGENT: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  RENT: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
  MAINTENANCE: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  UTILITY: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  EQUIPMENT: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  MISC: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const emptyForm = { category: 'SALARY', description: '', amount: '', paidTo: '', method: 'CASH', date: '' };

function formatDisplayDate(d: string) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export default function ExpenditurePage() {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [sortField, setSortField] = useState<keyof Expense | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const requestSort = (field: keyof Expense) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortField === field && sortDirection === 'asc') {
      direction = 'desc';
    }
    setSortField(field);
    setSortDirection(direction);
  };

  const SortHeader = ({ field, label }: { field: keyof Expense; label: string }) => {
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

  useEffect(() => { 
    if (toast) { 
      const t = setTimeout(() => setToast(null), 3000); 
      return () => clearTimeout(t); 
    } 
  }, [toast]);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const sortedExpenses = useMemo(() => {
    let result = [...expenses];
    if (sortField) {
      result.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // Date sorting
        if (sortField === 'date') {
          const timeA = new Date(a.date).getTime();
          const timeB = new Date(b.date).getTime();
          return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
        }

        // String comparison
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        // Numeric comparison
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        return 0;
      });
    }
    return result;
  }, [expenses, sortField, sortDirection]);

  const handleAdd = () => {
    if (!form.description.trim() || !form.amount) { 
      setToast({ message: 'Description and amount are required', type: 'error' }); 
      return; 
    }
    const newExp: Expense = {
      id: Date.now(),
      category: form.category,
      description: form.description,
      amount: Number(form.amount),
      paidTo: form.paidTo,
      method: form.method,
      date: form.date,
    };
    setExpenses(prev => [...prev, newExp]);
    setForm(emptyForm);
    setShowModal(false);
    setToast({ message: 'Expense added successfully', type: 'success' });
  };

  const handleExport = () => {
    const headers = ['Date,Category,Description,Paid To,Method,Amount'];
    const rows = expenses.map(e => `${formatDisplayDate(e.date)},${e.category},"${e.description}","${e.paidTo}",${e.method},${e.amount}`);
    const csv = [...headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: 'CSV exported successfully', type: 'success' });
  };

  const inputClass = "w-full mt-1 rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all";

  return (
    <AppLayout title="Expenditure" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Expenditure' }]}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 mr-4">
            <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Expenses (May)</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">{formatCurrency(total)}</p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Profit (Revenue - Expenses)</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">{formatCurrency(1842000 - total)}</p>
            </div>
          </div>
          <div className="flex gap-2.5 self-end sm:self-auto">
            <button 
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-bold hover:bg-accent text-foreground transition-all shadow-sm" 
              onClick={handleExport}
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <motion.button 
              whileHover={{ scale: 1.02 }} 
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow hover:shadow-md transition-all shadow-sm animate-glow-pulse" 
              onClick={() => { setForm(emptyForm); setShowModal(true); }}
            >
              <Plus className="h-4 w-4" />
              Add Expense
            </motion.button>
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <th className="px-5 py-3.5"><SortHeader field="date" label="Date" /></th>
                <th className="px-5 py-3.5"><SortHeader field="category" label="Category" /></th>
                <th className="px-5 py-3.5"><SortHeader field="description" label="Description" /></th>
                <th className="px-5 py-3.5"><SortHeader field="paidTo" label="Paid To" /></th>
                <th className="px-5 py-3.5"><SortHeader field="method" label="Method" /></th>
                <th className="px-5 py-3.5"><SortHeader field="amount" label="Amount" /></th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedExpenses.map((e, i) => (
                <motion.tr 
                  key={e.id} 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  transition={{ delay: i * 0.03 }} 
                  className="border-b hover:bg-accent/50 transition-colors"
                >
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{formatDisplayDate(e.date)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`badge ${catColors[e.category] || ''}`}>
                      {e.category}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-foreground">{e.description}</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{e.paidTo}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-medium bg-muted rounded-full px-2.5 py-1 text-muted-foreground dark:text-foreground">
                      {e.method}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-red-600 dark:text-red-400">{formatCurrency(e.amount)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button 
                      onClick={() => {
                        setExpenses(prev => prev.filter(item => item.id !== e.id));
                        setToast({ message: 'Expense deleted successfully', type: 'success' });
                      }}
                      className="btn-action text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 animate-fade-in-up"
                      title="Delete Expense"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
              {sortedExpenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No expenses recorded. Click "Add Expense" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up" onClick={() => setShowModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">Add Expense</h3>
              <button 
                type="button" 
                onClick={() => setShowModal(false)} 
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="form-label">Category *</label>
                <select 
                  className={inputClass} 
                  value={form.category} 
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Description *</label>
                <input 
                  className={inputClass} 
                  value={form.description} 
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} 
                  placeholder="e.g. Office supplies"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Amount *</label>
                  <input 
                    type="number" 
                    className={inputClass} 
                    value={form.amount} 
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} 
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="form-label">Paid To</label>
                  <input 
                    className={inputClass} 
                    value={form.paidTo} 
                    onChange={e => setForm(f => ({ ...f, paidTo: e.target.value }))} 
                    placeholder="Recipient name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Payment Method</label>
                  <select 
                    className={inputClass} 
                    value={form.method} 
                    onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                  >
                    {methods.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Date</label>
                  <input 
                    type="date" 
                    className={inputClass} 
                    value={form.date} 
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} 
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button 
                className="py-2.5 px-5 text-sm font-bold rounded-xl border border-border bg-card hover:bg-accent text-foreground transition-all shadow-sm" 
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button 
                className="py-2.5 px-5 text-sm font-bold rounded-xl bg-primary text-primary-foreground btn-primary-glow hover:shadow-md transition-all shadow-sm" 
                onClick={handleAdd}
              >
                Add Expense
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
