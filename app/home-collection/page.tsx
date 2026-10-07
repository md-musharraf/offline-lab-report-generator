"use client";
import { AppLayout } from '@/components/AppLayout';
import { useEffect, useMemo, useState } from 'react';
import { Plus, MapPin, Phone, UserCheck, Truck, CheckCircle2, Building2, XCircle, FileText } from 'lucide-react';
import { db } from '@/lib/db';
import { makeTablePdf, downloadPdf } from '@/lib/pdf-table';
import { Field, Modal, ToastView, useToast, useLive, inputCls, btnPrimary, btnGhost, card, th, td, todayInput } from '@/components/kit';

// Home sample collection: schedule, assign to a phlebotomist / technician, track to the lab. Saved on this PC.

type Collection = {
  id: number; patientName: string; phone: string | null; address: string; tests: string | null; scheduledAt: string;
  status: string; assignedTo: number | null; assignedName: string | null; notes: string | null;
};
type Person = { id: number; name: string; role: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Not assigned', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  ASSIGNED: { label: 'Assigned', cls: 'bg-primary/10 text-primary' },
  IN_TRANSIT: { label: 'On the way', cls: 'bg-indigo-600/10 text-indigo-700 dark:text-indigo-400' },
  COLLECTED: { label: 'Collected', cls: 'bg-green-600/10 text-green-700 dark:text-green-400' },
  DELIVERED_TO_LAB: { label: 'Reached lab', cls: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground' },
};
// Next step for each status, as one button.
const NEXT: Record<string, { to: string; label: string; Icon: React.ElementType } | undefined> = {
  ASSIGNED: { to: 'IN_TRANSIT', label: 'Start', Icon: Truck },
  IN_TRANSIT: { to: 'COLLECTED', label: 'Collected', Icon: CheckCircle2 },
  COLLECTED: { to: 'DELIVERED_TO_LAB', label: 'Reached lab', Icon: Building2 },
};

const dayRange = (day: string) => ({ gte: new Date(`${day}T00:00:00`), lt: new Date(new Date(`${day}T00:00:00`).getTime() + 864e5) });
const empty = { patientName: '', phone: '', address: '', tests: '', date: todayInput(), time: '09:00', assignedTo: '', notes: '' };

export default function HomeCollectionPage() {
  const [day, setDay] = useState(todayInput());
  const [rows, setRows] = useState<Collection[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [form, setForm] = useState<typeof empty | null>(null);
  const [assign, setAssign] = useState<{ row: Collection; userId: string } | null>(null);
  const [toast, showToast] = useToast();

  const load = () =>
    db.query('homeCollection', 'findMany', { where: { scheduledAt: dayRange(day) }, orderBy: { scheduledAt: 'asc' } })
      .then(setRows)
      .catch(err => showToast(err.message, 'error'));
  useLive(load, ['homeCollection']);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);
  useEffect(() => {
    fetch('/api/staff/names').then(r => r.json()).then(d => d.success && setPeople(d.people)).catch(() => {});
  }, []);

  const counts = useMemo(() => ({
    waiting: rows.filter(r => r.status === 'PENDING' || r.status === 'ASSIGNED').length,
    onTheWay: rows.filter(r => r.status === 'IN_TRANSIT').length,
    done: rows.filter(r => r.status === 'COLLECTED' || r.status === 'DELIVERED_TO_LAB').length,
  }), [rows]);

  const personName = (id: string) => people.find(p => String(p.id) === id)?.name || null;

  const schedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.patientName.trim() || !form.address.trim()) return showToast('Patient name and address are required', 'error');
    try {
      await db.query('homeCollection', 'create', {
        data: {
          patientName: form.patientName.trim(), phone: form.phone.trim() || null, address: form.address.trim(), tests: form.tests.trim() || null,
          scheduledAt: new Date(`${form.date}T${form.time || '09:00'}:00`), notes: form.notes.trim() || null,
          ...(form.assignedTo ? { assignedTo: Number(form.assignedTo), assignedName: personName(form.assignedTo), status: 'ASSIGNED' } : {}),
        },
      });
      setForm(null);
      showToast(`Home collection for ${form.patientName} scheduled`);
      if (form.date !== day) setDay(form.date);
      else load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const setStatus = async (row: Collection, status: string, extra: Record<string, unknown> = {}) => {
    try {
      await db.query('homeCollection', 'update', { where: { id: row.id }, data: { status, ...extra } });
      showToast(`${row.patientName}: ${STATUS[status].label}`);
      load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const saveAssign = async () => {
    if (!assign?.userId) return;
    await setStatus(assign.row, assign.row.status === 'PENDING' ? 'ASSIGNED' : assign.row.status, { assignedTo: Number(assign.userId), assignedName: personName(assign.userId) });
    setAssign(null);
  };

  const runSheet = async () => {
    const label = new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const bytes = await makeTablePdf({
      title: `Home collection run sheet — ${label}`,
      subtitle: `${rows.filter(r => r.status !== 'CANCELLED').length} visits`,
      landscape: true,
      columns: [{ header: 'Time', width: 7 }, { header: 'Patient', width: 16 }, { header: 'Phone', width: 11 }, { header: 'Address', width: 32 }, { header: 'Tests', width: 16 }, { header: 'Assigned to', width: 12 }, { header: 'Status', width: 10 }],
      rows: rows.filter(r => r.status !== 'CANCELLED').map(r => [
        new Date(r.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), r.patientName, r.phone || '', r.address, r.tests || '', r.assignedName || '—', STATUS[r.status]?.label || r.status,
      ]),
    });
    downloadPdf(bytes, `home-collection-${day}.pdf`);
  };

  return (
    <AppLayout title="Home Collection" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Home Collection' }]}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Day"><input type="date" value={day} onChange={e => setDay(e.target.value)} className={`${inputCls} w-44`} /></Field>
          <div className="ml-auto flex gap-2">
            <button onClick={runSheet} className={btnGhost}><FileText className="h-4 w-4" /> Run sheet PDF</button>
            <button onClick={() => setForm({ ...empty, date: day })} className={btnPrimary}><Plus className="h-4 w-4" /> Schedule collection</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={`${card} p-5`}><div className="text-xs font-medium text-muted-foreground">Waiting</div><div className="mt-1 text-2xl font-bold text-amber-600">{counts.waiting}</div></div>
          <div className={`${card} p-5`}><div className="text-xs font-medium text-muted-foreground">On the way</div><div className="mt-1 text-2xl font-bold text-indigo-600">{counts.onTheWay}</div></div>
          <div className={`${card} p-5`}><div className="text-xs font-medium text-muted-foreground">Collected</div><div className="mt-1 text-2xl font-bold text-green-600">{counts.done}</div></div>
        </div>

        <div className={`${card} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40"><tr><th className={th}>Time</th><th className={th}>Patient</th><th className={th}>Address</th><th className={th}>Tests</th><th className={th}>Assigned to</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th></tr></thead>
            <tbody className="divide-y">
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No home collections on this day.</td></tr>}
              {rows.map(r => {
                const next = NEXT[r.status];
                const open = r.status !== 'DELIVERED_TO_LAB' && r.status !== 'CANCELLED';
                return (
                  <tr key={r.id} data-testid={`collection-row-${r.patientName}`}>
                    <td className={`${td} tabular-nums`}>{new Date(r.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className={td}>
                      <div className="font-medium">{r.patientName}</div>
                      {r.phone && <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Phone className="h-3 w-3" />{r.phone}</a>}
                    </td>
                    <td className={`${td} max-w-xs`}><div className="flex gap-1 text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{r.address}</span></div></td>
                    <td className={`${td} text-muted-foreground`}>{r.tests || '—'}</td>
                    <td className={td}>{r.assignedName || <span className="text-muted-foreground">—</span>}</td>
                    <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[r.status]?.cls || ''}`}>{STATUS[r.status]?.label || r.status}</span></td>
                    <td className={td}>
                      <div className="flex justify-end gap-1.5">
                        {open && <button className={`${btnGhost} h-8 px-2.5 text-xs`} onClick={() => setAssign({ row: r, userId: r.assignedTo ? String(r.assignedTo) : '' })}><UserCheck className="h-3.5 w-3.5" />{r.assignedTo ? 'Reassign' : 'Assign'}</button>}
                        {next && <button className={`${btnPrimary} h-8 px-2.5 text-xs`} onClick={() => setStatus(r, next.to)}><next.Icon className="h-3.5 w-3.5" />{next.label}</button>}
                        {open && r.status !== 'COLLECTED' && <button className="btn-action text-destructive" aria-label={`Cancel ${r.patientName}`} title="Cancel" onClick={() => setStatus(r, 'CANCELLED')}><XCircle className="h-4 w-4" /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal title="Schedule home collection" onClose={() => setForm(null)} wide>
          <form onSubmit={schedule} className="grid grid-cols-2 gap-4">
            <Field label="Patient name *"><input type="text" required value={form.patientName} onChange={e => setForm({ ...form, patientName: e.target.value })} className={inputCls} /></Field>
            <Field label="Phone"><input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
            <Field label="Address *" className="col-span-2"><input type="text" required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={inputCls} placeholder="House, street, landmark" /></Field>
            <Field label="Tests" className="col-span-2"><input type="text" value={form.tests} onChange={e => setForm({ ...form, tests: e.target.value })} className={inputCls} placeholder="e.g. CBC, Lipid profile" /></Field>
            <Field label="Date *"><input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} /></Field>
            <Field label="Time"><input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className={inputCls} /></Field>
            <Field label="Assign to (optional)" className="col-span-2">
              <select value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })} className={inputCls}>
                <option value="">Assign later</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
              </select>
            </Field>
            <Field label="Notes" className="col-span-2"><input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} placeholder="Fasting, floor, call before coming…" /></Field>
            <div className="col-span-2 mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary}>Schedule</button>
            </div>
          </form>
        </Modal>
      )}

      {assign && (
        <Modal title={`Assign ${assign.row.patientName}`} onClose={() => setAssign(null)} footer={<>
          <button onClick={() => setAssign(null)} className={btnGhost}>Cancel</button>
          <button onClick={saveAssign} disabled={!assign.userId} className={btnPrimary}>Assign</button>
        </>}>
          <Field label="Who will collect?">
            <select value={assign.userId} onChange={e => setAssign({ ...assign, userId: e.target.value })} className={inputCls}>
              <option value="">Choose staff…</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
            </select>
          </Field>
          {people.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Add phlebotomists or technicians on the Staff screen first.</p>}
        </Modal>
      )}
      <ToastView toast={toast} />
    </AppLayout>
  );
}
