"use client";
import { AppLayout } from '@/components/AppLayout';
import { useMemo, useState } from 'react';
import { Plus, Edit, Trash2, FileDown, FileText } from 'lucide-react';
import { db } from '@/lib/db';
import { can } from '@/lib/roles';
import { makeTablePdf, downloadPdf, rupees } from '@/lib/pdf-table';
import { Field, Modal, ToastView, useToast, useRole, useLive, inputCls, btnPrimary, btnGhost, card, th, td, todayInput, dateText } from '@/components/kit';

// Lab spending, saved on this PC. Feeds the owner's monthly profit / loss on the dashboard.

const CATEGORIES: Record<string, { label: string; color: string }> = {
  SALARY: { label: 'Salary', color: 'bg-blue-600/10 text-blue-700 dark:text-blue-400' },
  REAGENT: { label: 'Reagents & kits', color: 'bg-green-600/10 text-green-700 dark:text-green-400' },
  RENT: { label: 'Rent', color: 'bg-purple-600/10 text-purple-700 dark:text-purple-400' },
  MAINTENANCE: { label: 'Maintenance', color: 'bg-orange-600/10 text-orange-700 dark:text-orange-400' },
  UTILITY: { label: 'Electricity / water / internet', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  EQUIPMENT: { label: 'Equipment', color: 'bg-red-600/10 text-red-700 dark:text-red-400' },
  MISC: { label: 'Other', color: 'bg-muted text-muted-foreground' },
};
const METHODS = ['CASH', 'UPI', 'BANK', 'CARD', 'CHEQUE'];

type Expense = { id: number; date: string; category: string; description: string; amount: number; paidTo: string | null; method: string };
const empty = { id: 0, date: todayInput(), category: 'REAGENT', description: '', amount: '', paidTo: '', method: 'CASH' };

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
};

export default function ExpenditurePage() {
  const role = useRole();
  const [month, setMonth] = useState(todayInput().slice(0, 7));
  const [category, setCategory] = useState('ALL');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState<typeof empty | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [toast, showToast] = useToast();

  const load = (m = month) =>
    db.query('expense', 'findMany', { where: { date: monthRange(m) }, orderBy: [{ date: 'desc' }, { id: 'desc' }] })
      .then(setExpenses)
      .catch(err => showToast(err.message, 'error'));
  useLive(() => load(), ['expense']);

  const shown = useMemo(() => expenses.filter(e => category === 'ALL' || e.category === category), [expenses, category]);
  const total = shown.reduce((s, e) => s + e.amount, 0);
  const byCategory = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const e of expenses) sums[e.category] = (sums[e.category] || 0) + e.amount;
    return Object.entries(sums).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const amount = Number(form.amount);
    if (!form.description.trim() || !(amount > 0)) return showToast('Enter a description and an amount above zero', 'error');
    const data = { date: new Date(`${form.date}T12:00:00`), category: form.category, description: form.description.trim(), amount, paidTo: form.paidTo.trim() || null, method: form.method };
    try {
      if (form.id) await db.query('expense', 'update', { where: { id: form.id }, data });
      else await db.query('expense', 'create', { data });
      setForm(null);
      showToast(`Expense of ${rupees(amount)} saved`);
      if (!form.date.startsWith(month)) setMonth(form.date.slice(0, 7));
      load(form.date.slice(0, 7));
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const remove = async (x: Expense) => {
    try {
      await db.query('expense', 'delete', { where: { id: x.id } });
      setConfirmDelete(null);
      showToast('Expense deleted');
      load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const rows = shown.map(e => [dateText(e.date), CATEGORIES[e.category]?.label || e.category, e.description, e.paidTo || '', e.method, rupees(e.amount)]);
  const exportCsv = () => {
    const csv = [['Date', 'Category', 'Description', 'Paid to', 'Method', 'Amount'], ...shown.map(e => [new Date(e.date).toISOString().slice(0, 10), e.category, e.description, e.paidTo || '', e.method, e.amount])]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `expenses-${month}.csv`;
    a.click();
  };
  const exportPdf = async () => {
    const label = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const bytes = await makeTablePdf({
      title: `Expense statement — ${label}`,
      subtitle: `${shown.length} ${shown.length === 1 ? 'entry' : 'entries'}${category !== 'ALL' ? ` · ${CATEGORIES[category].label}` : ''}`,
      columns: [{ header: 'Date', width: 12 }, { header: 'Category', width: 16 }, { header: 'Description', width: 34 }, { header: 'Paid to', width: 18 }, { header: 'Method', width: 9 }, { header: 'Amount', width: 13, align: 'right' }],
      rows,
      totals: ['', '', '', '', 'Total', rupees(total)],
    });
    downloadPdf(bytes, `expenses-${month}.pdf`);
  };

  return (
    <AppLayout title="Expenditure" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Expenditure' }]}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Month"><input type="month" value={month} onChange={e => { setMonth(e.target.value); load(e.target.value); }} className={`${inputCls} w-44`} /></Field>
          <Field label="Category">
            <select value={category} onChange={e => setCategory(e.target.value)} className={`${inputCls} w-56`}>
              <option value="ALL">All categories</option>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <div className="ml-auto flex gap-2">
            <button onClick={exportCsv} className={btnGhost}><FileDown className="h-4 w-4" /> CSV</button>
            <button onClick={exportPdf} className={btnGhost}><FileText className="h-4 w-4" /> PDF statement</button>
            <button onClick={() => setForm({ ...empty, date: todayInput() })} className={btnPrimary}><Plus className="h-4 w-4" /> Add expense</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className={`${card} p-5`}>
            <div className="text-xs font-medium text-muted-foreground">Spent this month{category !== 'ALL' ? ` (${CATEGORIES[category].label})` : ''}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums" data-testid="expense-total">{rupees(total)}</div>
            <div className="text-xs text-muted-foreground">{shown.length} {shown.length === 1 ? 'entry' : 'entries'}</div>
          </div>
          <div className={`${card} p-5 md:col-span-3`}>
            <div className="mb-2 text-xs font-medium text-muted-foreground">By category</div>
            <div className="flex flex-wrap gap-2">
              {byCategory.length === 0 && <span className="text-sm text-muted-foreground">Nothing spent yet this month.</span>}
              {byCategory.map(([k, v]) => (
                <button key={k} onClick={() => setCategory(category === k ? 'ALL' : k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${CATEGORIES[k]?.color || ''} ${category === k ? 'ring-2 ring-primary' : ''}`}>
                  {CATEGORIES[k]?.label || k}: {rupees(v)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`${card} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40"><tr><th className={th}>Date</th><th className={th}>Category</th><th className={th}>Description</th><th className={th}>Paid to</th><th className={th}>Method</th><th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>Actions</th></tr></thead>
            <tbody className="divide-y">
              {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No expenses for this month. Add salary, reagents, rent and bills here to see profit / loss on the dashboard.</td></tr>}
              {shown.map(e => (
                <tr key={e.id} data-testid="expense-row">
                  <td className={td}>{dateText(e.date)}</td>
                  <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORIES[e.category]?.color || ''}`}>{CATEGORIES[e.category]?.label || e.category}</span></td>
                  <td className={`${td} font-medium`}>{e.description}</td>
                  <td className={`${td} text-muted-foreground`}>{e.paidTo || '—'}</td>
                  <td className={`${td} text-muted-foreground`}>{e.method}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{rupees(e.amount)}</td>
                  <td className={td}>
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-action" aria-label={`Edit ${e.description}`} onClick={() => setForm({ id: e.id, date: new Date(e.date).toISOString().slice(0, 10), category: e.category, description: e.description, amount: String(e.amount), paidTo: e.paidTo || '', method: e.method })}><Edit className="h-4 w-4" /></button>
                      {can(role, 'bill:delete') && <button className="btn-action text-destructive" aria-label={`Delete ${e.description}`} onClick={() => setConfirmDelete(e)}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal title={form.id ? 'Edit expense' : 'Add expense'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid grid-cols-2 gap-4">
            <Field label="Date *"><input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} /></Field>
            <Field label="Category *">
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Description *" className="col-span-2"><input type="text" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="e.g. CBC reagent pack" /></Field>
            <Field label="Amount (₹) *"><input type="number" min="0" step="any" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={inputCls} /></Field>
            <Field label="Paid by">
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className={inputCls}>
                {METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Paid to" className="col-span-2"><input type="text" value={form.paidTo} onChange={e => setForm({ ...form, paidTo: e.target.value })} className={inputCls} placeholder="Supplier / person" /></Field>
            <div className="col-span-2 mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save expense</button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete this expense?" onClose={() => setConfirmDelete(null)} footer={<>
          <button onClick={() => setConfirmDelete(null)} className={btnGhost}>Cancel</button>
          <button onClick={() => remove(confirmDelete)} className="h-10 rounded-lg bg-destructive px-4 text-sm font-semibold text-white">Delete</button>
        </>}>
          <p className="text-sm text-muted-foreground">{confirmDelete.description} · {rupees(confirmDelete.amount)} on {dateText(confirmDelete.date)}. The deletion is kept in the audit log.</p>
        </Modal>
      )}
      <ToastView toast={toast} />
    </AppLayout>
  );
}
