"use client";
import { AppLayout } from '@/components/AppLayout';
import { useMemo, useState } from 'react';
import { Plus, Edit, CheckCircle2, XCircle, Trash2, FileText, Building2, Send } from 'lucide-react';
import { db } from '@/lib/db';
import { can } from '@/lib/roles';
import { makeTablePdf, downloadPdf, rupees } from '@/lib/pdf-table';
import { Field, Modal, ToastView, useToast, useRole, useLive, inputCls, btnPrimary, btnGhost, card, th, td, todayInput, dateText } from '@/components/kit';

// Tests sent to partner labs: what, for whom, what it cost and whether the result came back. Saved on this PC.

type Lab = { id: number; name: string; mobile: string | null; email: string | null; address: string | null; isActive: boolean };
type Sent = { id: number; labId: number; lab?: Lab; patientName: string; orderNo: string | null; testName: string; cost: number; sentAt: string; status: string; resultReceivedAt: string | null; notes: string | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Awaiting result', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  COMPLETED: { label: 'Result received', cls: 'bg-green-600/10 text-green-700 dark:text-green-400' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground' },
};
const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
};
const emptyLab = { id: 0, name: '', mobile: '', email: '', address: '' };
const emptySent = { id: 0, labId: '', patientName: '', orderNo: '', testName: '', cost: '', sentAt: todayInput(), notes: '' };

export default function OutsourcePage() {
  const role = useRole();
  const [tab, setTab] = useState<'sent' | 'labs'>('sent');
  const [month, setMonth] = useState(todayInput().slice(0, 7));
  const [labs, setLabs] = useState<Lab[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [labForm, setLabForm] = useState<typeof emptyLab | null>(null);
  const [sentForm, setSentForm] = useState<typeof emptySent | null>(null);
  const [toast, showToast] = useToast();

  const load = (m = month) =>
    Promise.all([
      db.query('outsourceLab', 'findMany', { orderBy: { name: 'asc' } }),
      db.query('outsourcedTest', 'findMany', { where: { sentAt: monthRange(m) }, include: { lab: true }, orderBy: { sentAt: 'desc' } }),
    ]).then(([l, s]) => {
      setLabs(l);
      setSent(s);
    }).catch(err => showToast(err.message, 'error'));
  useLive(() => load(), ['outsourceLab', 'outsourcedTest']);

  const activeLabs = labs.filter(l => l.isActive);
  const totals = useMemo(() => ({
    cost: sent.filter(s => s.status !== 'CANCELLED').reduce((a, s) => a + s.cost, 0),
    pending: sent.filter(s => s.status === 'PENDING').length,
  }), [sent]);

  const saveLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!labForm?.name.trim()) return showToast('Lab name is required', 'error');
    const data = { name: labForm.name.trim(), mobile: labForm.mobile.trim() || null, email: labForm.email.trim() || null, address: labForm.address.trim() || null };
    try {
      if (labForm.id) await db.query('outsourceLab', 'update', { where: { id: labForm.id }, data });
      else await db.query('outsourceLab', 'create', { data });
      setLabForm(null);
      showToast(`${data.name} saved`);
      load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const saveSent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sentForm) return;
    if (!sentForm.labId || !sentForm.patientName.trim() || !sentForm.testName.trim()) return showToast('Choose a lab and enter the patient and test', 'error');
    const data = {
      labId: Number(sentForm.labId), patientName: sentForm.patientName.trim(), orderNo: sentForm.orderNo.trim() || null, testName: sentForm.testName.trim(),
      cost: Number(sentForm.cost || 0), sentAt: new Date(`${sentForm.sentAt}T12:00:00`), notes: sentForm.notes.trim() || null,
    };
    try {
      if (sentForm.id) await db.query('outsourcedTest', 'update', { where: { id: sentForm.id }, data });
      else await db.query('outsourcedTest', 'create', { data });
      setSentForm(null);
      showToast(`${data.testName} for ${data.patientName} saved`);
      if (!sentForm.sentAt.startsWith(month)) setMonth(sentForm.sentAt.slice(0, 7));
      load(sentForm.sentAt.slice(0, 7));
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const setStatus = async (s: Sent, status: string) => {
    try {
      await db.query('outsourcedTest', 'update', { where: { id: s.id }, data: { status, resultReceivedAt: status === 'COMPLETED' ? new Date() : null } });
      showToast(`${s.testName}: ${STATUS[status].label}`);
      load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const removeSent = async (s: Sent) => {
    try {
      await db.query('outsourcedTest', 'delete', { where: { id: s.id } });
      showToast('Entry deleted');
      load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const toggleLab = async (l: Lab) => {
    await db.query('outsourceLab', 'update', { where: { id: l.id }, data: { isActive: !l.isActive } }).catch(err => showToast(err.message, 'error'));
    load();
  };

  const exportPdf = async () => {
    const label = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const bytes = await makeTablePdf({
      title: `Outsourced tests — ${label}`,
      subtitle: `${sent.length} tests · ${totals.pending} awaiting results`,
      landscape: true,
      columns: [{ header: 'Sent on', width: 10 }, { header: 'Patient', width: 16 }, { header: 'Order', width: 15 }, { header: 'Test', width: 18 }, { header: 'Partner lab', width: 16 }, { header: 'Status', width: 12 }, { header: 'Cost', width: 10, align: 'right' }],
      rows: sent.map(s => [dateText(s.sentAt), s.patientName, s.orderNo || '', s.testName, s.lab?.name || '', STATUS[s.status]?.label || s.status, rupees(s.cost)]),
      totals: ['', '', '', '', '', 'Total cost', rupees(totals.cost)],
    });
    downloadPdf(bytes, `outsourced-tests-${month}.pdf`);
  };

  return (
    <AppLayout title="Outsource Labs" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Outsource Labs' }]}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border bg-card p-1">
            {([['sent', 'Tests sent', Send], ['labs', 'Partner labs', Building2]] as const).map(([id, text, Icon]) => (
              <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon className="h-4 w-4" /> {text}
              </button>
            ))}
          </div>
          {tab === 'sent' && <input type="month" aria-label="Month" value={month} onChange={e => { setMonth(e.target.value); load(e.target.value); }} className={`${inputCls} w-44`} />}
          <div className="ml-auto flex gap-2">
            {tab === 'sent' ? (
              <>
                <button onClick={exportPdf} className={btnGhost}><FileText className="h-4 w-4" /> PDF register</button>
                <button onClick={() => (activeLabs.length ? setSentForm({ ...emptySent, labId: String(activeLabs[0].id) }) : (setTab('labs'), showToast('Add a partner lab first', 'error')))} className={btnPrimary}><Plus className="h-4 w-4" /> Send a test</button>
              </>
            ) : (
              <button onClick={() => setLabForm({ ...emptyLab })} className={btnPrimary}><Plus className="h-4 w-4" /> Add partner lab</button>
            )}
          </div>
        </div>

        {tab === 'sent' ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className={`${card} p-5`}><div className="text-xs font-medium text-muted-foreground">Tests sent this month</div><div className="mt-1 text-2xl font-bold">{sent.length}</div></div>
              <div className={`${card} p-5`}><div className="text-xs font-medium text-muted-foreground">Awaiting results</div><div className="mt-1 text-2xl font-bold text-amber-600">{totals.pending}</div></div>
              <div className={`${card} p-5`}><div className="text-xs font-medium text-muted-foreground">Cost this month</div><div className="mt-1 text-2xl font-bold tabular-nums" data-testid="outsource-cost">{rupees(totals.cost)}</div></div>
            </div>
            <div className={`${card} overflow-hidden`}>
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40"><tr><th className={th}>Sent on</th><th className={th}>Patient</th><th className={th}>Test</th><th className={th}>Partner lab</th><th className={`${th} text-right`}>Cost</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th></tr></thead>
                <tbody className="divide-y">
                  {sent.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No tests sent out this month.</td></tr>}
                  {sent.map(s => (
                    <tr key={s.id} data-testid={`outsourced-row-${s.testName}`}>
                      <td className={td}>{dateText(s.sentAt)}</td>
                      <td className={td}><div className="font-medium">{s.patientName}</div>{s.orderNo && <div className="font-mono text-xs text-muted-foreground">{s.orderNo}</div>}</td>
                      <td className={td}>{s.testName}</td>
                      <td className={`${td} text-muted-foreground`}>{s.lab?.name}</td>
                      <td className={`${td} text-right tabular-nums`}>{rupees(s.cost)}</td>
                      <td className={td}>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[s.status]?.cls || ''}`}>{STATUS[s.status]?.label || s.status}</span>
                        {s.resultReceivedAt && <div className="text-xs text-muted-foreground">{dateText(s.resultReceivedAt)}</div>}
                      </td>
                      <td className={td}>
                        <div className="flex justify-end gap-1.5">
                          {s.status === 'PENDING' && <button className={`${btnPrimary} h-8 px-2.5 text-xs`} onClick={() => setStatus(s, 'COMPLETED')}><CheckCircle2 className="h-3.5 w-3.5" />Result received</button>}
                          {s.status === 'PENDING' && <button className="btn-action" title="Cancel" aria-label={`Cancel ${s.testName}`} onClick={() => setStatus(s, 'CANCELLED')}><XCircle className="h-4 w-4" /></button>}
                          <button className="btn-action" aria-label={`Edit ${s.testName}`} onClick={() => setSentForm({ id: s.id, labId: String(s.labId), patientName: s.patientName, orderNo: s.orderNo || '', testName: s.testName, cost: String(s.cost), sentAt: new Date(s.sentAt).toISOString().slice(0, 10), notes: s.notes || '' })}><Edit className="h-4 w-4" /></button>
                          {can(role, 'bill:delete') && <button className="btn-action text-destructive" aria-label={`Delete ${s.testName}`} onClick={() => removeSent(s)}><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className={`${card} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40"><tr><th className={th}>Lab</th><th className={th}>Phone</th><th className={th}>Email</th><th className={th}>Address</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th></tr></thead>
              <tbody className="divide-y">
                {labs.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No partner labs yet.</td></tr>}
                {labs.map(l => (
                  <tr key={l.id} className={l.isActive ? '' : 'opacity-60'}>
                    <td className={`${td} font-medium`}>{l.name}</td>
                    <td className={`${td} text-muted-foreground`}>{l.mobile || '—'}</td>
                    <td className={`${td} text-muted-foreground`}>{l.email || '—'}</td>
                    <td className={`${td} text-muted-foreground`}>{l.address || '—'}</td>
                    <td className={td}>{l.isActive ? 'Active' : 'Inactive'}</td>
                    <td className={td}>
                      <div className="flex justify-end gap-1.5">
                        <button className="btn-action" aria-label={`Edit ${l.name}`} onClick={() => setLabForm({ id: l.id, name: l.name, mobile: l.mobile || '', email: l.email || '', address: l.address || '' })}><Edit className="h-4 w-4" /></button>
                        <button className={`${btnGhost} h-8 px-2.5 text-xs`} onClick={() => toggleLab(l)}>{l.isActive ? 'Deactivate' : 'Activate'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {labForm && (
        <Modal title={labForm.id ? 'Edit partner lab' : 'Add partner lab'} onClose={() => setLabForm(null)}>
          <form onSubmit={saveLab} className="grid grid-cols-2 gap-4">
            <Field label="Lab name *" className="col-span-2"><input type="text" required value={labForm.name} onChange={e => setLabForm({ ...labForm, name: e.target.value })} className={inputCls} /></Field>
            <Field label="Phone"><input type="tel" value={labForm.mobile} onChange={e => setLabForm({ ...labForm, mobile: e.target.value })} className={inputCls} /></Field>
            <Field label="Email"><input type="email" value={labForm.email} onChange={e => setLabForm({ ...labForm, email: e.target.value })} className={inputCls} /></Field>
            <Field label="Address" className="col-span-2"><input type="text" value={labForm.address} onChange={e => setLabForm({ ...labForm, address: e.target.value })} className={inputCls} /></Field>
            <div className="col-span-2 mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setLabForm(null)} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save lab</button>
            </div>
          </form>
        </Modal>
      )}

      {sentForm && (
        <Modal title={sentForm.id ? 'Edit outsourced test' : 'Send a test to a partner lab'} onClose={() => setSentForm(null)} wide>
          <form onSubmit={saveSent} className="grid grid-cols-2 gap-4">
            <Field label="Partner lab *" className="col-span-2">
              <select required value={sentForm.labId} onChange={e => setSentForm({ ...sentForm, labId: e.target.value })} className={inputCls}>
                {labs.filter(l => l.isActive || String(l.id) === sentForm.labId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Patient name *"><input type="text" required value={sentForm.patientName} onChange={e => setSentForm({ ...sentForm, patientName: e.target.value })} className={inputCls} /></Field>
            <Field label="Order no. (optional)"><input type="text" value={sentForm.orderNo} onChange={e => setSentForm({ ...sentForm, orderNo: e.target.value })} className={inputCls} /></Field>
            <Field label="Test *"><input type="text" required value={sentForm.testName} onChange={e => setSentForm({ ...sentForm, testName: e.target.value })} className={inputCls} placeholder="e.g. Vitamin D" /></Field>
            <Field label="Cost (₹)"><input type="number" min="0" step="any" value={sentForm.cost} onChange={e => setSentForm({ ...sentForm, cost: e.target.value })} className={inputCls} /></Field>
            <Field label="Sent on"><input type="date" value={sentForm.sentAt} onChange={e => setSentForm({ ...sentForm, sentAt: e.target.value })} className={inputCls} /></Field>
            <Field label="Notes"><input type="text" value={sentForm.notes} onChange={e => setSentForm({ ...sentForm, notes: e.target.value })} className={inputCls} /></Field>
            <div className="col-span-2 mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setSentForm(null)} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save</button>
            </div>
          </form>
        </Modal>
      )}
      <ToastView toast={toast} />
    </AppLayout>
  );
}
