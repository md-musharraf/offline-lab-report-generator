"use client";
import { AppLayout } from '@/components/AppLayout';
import { useMemo, useState } from 'react';
import { Plus, Edit, Search, Building2 } from 'lucide-react';
import { db } from '@/lib/db';
import { Field, Modal, ToastView, useToast, useLive, inputCls, btnPrimary, btnGhost, card, th, td } from '@/components/kit';

// Companies, hospitals and schools billed on credit with an agreed discount. Saved on this PC.

type Corporate = { id: number; name: string; contact: string | null; mobile: string | null; email: string | null; creditDays: number; discount: number; isActive: boolean };
const empty = { id: 0, name: '', contact: '', mobile: '', email: '', creditDays: '30', discount: '0' };

export default function CorporatePage() {
  const [rows, setRows] = useState<Corporate[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<typeof empty | null>(null);
  const [toast, showToast] = useToast();

  const load = () => db.query('corporate', 'findMany', { orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }).then(setRows).catch(err => showToast(err.message, 'error'));
  useLive(load, ['corporate']);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => !q || r.name.toLowerCase().includes(q) || (r.contact || '').toLowerCase().includes(q) || (r.mobile || '').includes(q));
  }, [rows, search]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form?.name.trim()) return showToast('Name is required', 'error');
    const discount = Number(form.discount || 0);
    if (discount < 0 || discount > 100) return showToast('Discount must be between 0 and 100%', 'error');
    const data = { name: form.name.trim(), contact: form.contact.trim() || null, mobile: form.mobile.trim() || null, email: form.email.trim() || null, creditDays: Number(form.creditDays || 0), discount };
    try {
      if (form.id) await db.query('corporate', 'update', { where: { id: form.id }, data });
      else await db.query('corporate', 'create', { data });
      setForm(null);
      showToast(`${data.name} saved`);
      load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const toggle = async (r: Corporate) => {
    await db.query('corporate', 'update', { where: { id: r.id }, data: { isActive: !r.isActive } }).catch(err => showToast(err.message, 'error'));
    load();
  };

  return (
    <AppLayout title="Corporate Clients" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Corporate' }]}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients" aria-label="Search clients" className={`${inputCls} pl-9`} />
          </div>
          <button onClick={() => setForm({ ...empty })} className={`${btnPrimary} ml-auto`}><Plus className="h-4 w-4" /> Add client</button>
        </div>

        <div className={`${card} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40"><tr><th className={th}>Client</th><th className={th}>Contact person</th><th className={th}>Phone</th><th className={th}>Email</th><th className={`${th} text-right`}>Discount</th><th className={`${th} text-right`}>Credit</th><th className={`${th} text-right`}>Actions</th></tr></thead>
            <tbody className="divide-y">
              {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">{rows.length ? 'Nothing matches.' : 'No corporate clients yet.'}</td></tr>}
              {shown.map(r => (
                <tr key={r.id} className={r.isActive ? '' : 'opacity-60'} data-testid={`corporate-row-${r.name}`}>
                  <td className={td}><div className="flex items-center gap-2 font-medium"><Building2 className="h-4 w-4 text-muted-foreground" />{r.name}</div>{!r.isActive && <div className="text-xs text-muted-foreground">Inactive</div>}</td>
                  <td className={`${td} text-muted-foreground`}>{r.contact || '—'}</td>
                  <td className={`${td} text-muted-foreground`}>{r.mobile || '—'}</td>
                  <td className={`${td} text-muted-foreground`}>{r.email || '—'}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.discount}%</td>
                  <td className={`${td} text-right tabular-nums`}>{r.creditDays} days</td>
                  <td className={td}>
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-action" aria-label={`Edit ${r.name}`} onClick={() => setForm({ id: r.id, name: r.name, contact: r.contact || '', mobile: r.mobile || '', email: r.email || '', creditDays: String(r.creditDays), discount: String(r.discount) })}><Edit className="h-4 w-4" /></button>
                      <button className={`${btnGhost} h-8 px-2.5 text-xs`} onClick={() => toggle(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal title={form.id ? 'Edit corporate client' : 'Add corporate client'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid grid-cols-2 gap-4">
            <Field label="Company / hospital name *" className="col-span-2"><input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
            <Field label="Contact person"><input type="text" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} className={inputCls} /></Field>
            <Field label="Phone"><input type="tel" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} className={inputCls} /></Field>
            <Field label="Email" className="col-span-2"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} /></Field>
            <Field label="Discount (%)"><input type="number" min="0" max="100" step="any" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} className={inputCls} /></Field>
            <Field label="Credit period (days)"><input type="number" min="0" value={form.creditDays} onChange={e => setForm({ ...form, creditDays: e.target.value })} className={inputCls} /></Field>
            <div className="col-span-2 mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save client</button>
            </div>
          </form>
        </Modal>
      )}
      <ToastView toast={toast} />
    </AppLayout>
  );
}
