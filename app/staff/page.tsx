"use client";
import { AppLayout } from '@/components/AppLayout';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Users, Calendar, Edit, Trash2, X, KeyRound, Clock } from 'lucide-react';
import { ROLES, STAFF_ROLES } from '@/lib/roles';

// Staff, their sign-in accounts, roles and shifts. Owner/admin only (the backend enforces it).

type StaffRow = {
  id: number;
  name: string;
  role: string;
  mobile: string | null;
  salary: number | null;
  joinedAt: string | null;
  shift: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  onDuty: boolean;
  attendance: string | null;
  login: { id: number; email: string; role: string; isActive: boolean; lastLogin: string | null } | null;
};

const SHIFTS: Record<string, { label: string; start?: string; end?: string }> = {
  MORNING: { label: 'Morning', start: '08:00', end: '14:00' },
  EVENING: { label: 'Evening', start: '14:00', end: '20:00' },
  NIGHT: { label: 'Night', start: '20:00', end: '08:00' },
  FULL_DAY: { label: 'Full day', start: '08:00', end: '20:00' },
  CUSTOM: { label: 'Custom hours' },
};

const ROLE_HELP: Record<string, string> = {
  TECHNICIAN: 'Runs the lab: registration, billing and payments, results, approving and printing reports, machines and settings. Cannot delete patients, manage staff, restore backups or see the audit log.',
  PATHOLOGIST: 'Enters and reviews results and approves reports.',
  RECEPTIONIST: 'Optional, for bigger labs: registration, billing and printing reports.',
  PHLEBOTOMIST: 'Sample collection and home collection.',
  ADMIN: 'Full control like the owner, including deleting patients and managing staff.',
};

const ROLE_COLORS: Record<string, string> = {
  TECHNICIAN: 'bg-green-600/10 text-green-700 dark:text-green-400',
  PATHOLOGIST: 'bg-primary/10 text-primary',
  RECEPTIONIST: 'bg-purple-600/10 text-purple-700 dark:text-purple-400',
  PHLEBOTOMIST: 'bg-orange-600/10 text-orange-700 dark:text-orange-400',
  ADMIN: 'bg-red-600/10 text-red-700 dark:text-red-400',
};

const emptyForm = {
  id: null as number | null,
  name: '',
  role: 'TECHNICIAN',
  mobile: '',
  salary: '',
  joinedAt: '',
  shift: 'MORNING',
  shiftStart: '08:00',
  shiftEnd: '14:00',
  loginEnabled: true,
  email: '',
  password: '',
  accessResults: false,
};

async function api(path: string, body?: unknown) {
  const res = await fetch(`/api/${path}`, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || 'Request failed');
  return data;
}

const shiftText = (s: Pick<StaffRow, 'shift' | 'shiftStart' | 'shiftEnd'>) =>
  s.shift ? `${SHIFTS[s.shift]?.label || s.shift}${s.shiftStart && s.shiftEnd ? ` · ${s.shiftStart}–${s.shiftEnd}` : ''}` : '—';

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [tab, setTab] = useState<'staff' | 'attendance'>('staff');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<StaffRow | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = () => api('staff/list').then(d => setStaff(d.staff)).catch(err => setToast({ message: err.message, type: 'error' }));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter(s => !q || s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q) || (s.mobile || '').includes(q) || (s.login?.email || '').includes(q));
  }, [staff, search]);

  const openAdd = () => {
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (s: StaffRow) => {
    setForm({
      id: s.id,
      name: s.name,
      role: STAFF_ROLES.includes(s.role) ? s.role : s.role === 'DOCTOR' ? 'PATHOLOGIST' : 'TECHNICIAN',
      mobile: s.mobile || '',
      salary: s.salary === null ? '' : String(s.salary),
      joinedAt: s.joinedAt ? s.joinedAt.slice(0, 10) : '',
      shift: s.shift || 'MORNING',
      shiftStart: s.shiftStart || SHIFTS[s.shift || 'MORNING']?.start || '',
      shiftEnd: s.shiftEnd || SHIFTS[s.shift || 'MORNING']?.end || '',
      loginEnabled: !!s.login?.isActive,
      email: s.login?.email || '',
      password: '',
      accessResults: (s.login?.role || '').includes('ACCESS_RESULTS'),
    });
    setFormError(null);
    setShowForm(true);
  };

  const pickShift = (shift: string) => {
    const preset = SHIFTS[shift];
    setForm(f => ({ ...f, shift, shiftStart: preset.start ?? f.shiftStart, shiftEnd: preset.end ?? f.shiftEnd }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api('staff/save', {
        id: form.id,
        name: form.name,
        role: form.role,
        mobile: form.mobile,
        salary: form.salary,
        joinedAt: form.joinedAt || null,
        shift: form.shift,
        shiftStart: form.shiftStart,
        shiftEnd: form.shiftEnd,
        login: {
          enabled: form.loginEnabled,
          email: form.email,
          password: form.password,
          addons: form.role === 'RECEPTIONIST' && form.accessResults ? ['ACCESS_RESULTS'] : [],
        },
      });
      setShowForm(false);
      setToast({ message: `${form.name} saved`, type: 'success' });
      load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: StaffRow) => {
    try {
      await api('staff/remove', { id: s.id });
      setConfirmRemove(null);
      setToast({ message: `${s.name} removed${s.login ? ' and their login disabled' : ''}`, type: 'success' });
      load();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const mark = async (s: StaffRow, status: string) => {
    try {
      await api('staff/attendance', { staffId: s.id, status });
      setStaff(list => list.map(x => (x.id === s.id ? { ...x, attendance: status } : x)));
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const input = 'w-full rounded-lg border bg-background px-3 text-sm';
  const label = 'mb-1 block text-xs font-medium text-muted-foreground';

  return (
    <AppLayout title="Staff & Logins" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Staff & Logins' }]}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border bg-card p-1">
            {([['staff', 'Staff & logins', Users], ['attendance', 'Attendance today', Calendar]] as const).map(([id, text, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon className="h-4 w-4" /> {text}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff" aria-label="Search staff" className={`${input} pl-9`} />
          </div>
          <button onClick={openAdd} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Add staff
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Shift</th>
                {tab === 'staff' ? (
                  <>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Login</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </>
                ) : (
                  <th className="px-4 py-3 text-right">Today</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No staff yet. Add your technicians (one login each) so every bill and result shows who did it.
                  </td>
                </tr>
              )}
              {filtered.map(s => (
                <tr key={s.id} data-testid={`staff-row-${s.name}`}>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[s.role] || 'bg-muted text-muted-foreground'}`}>{ROLES[s.role]?.label || s.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-muted-foreground">{shiftText(s)}</span>
                    {s.onDuty && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-600/10 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-400"><Clock className="h-3 w-3" /> On duty</span>}
                  </td>
                  {tab === 'staff' ? (
                    <>
                      <td className="px-4 py-3 text-muted-foreground">{s.mobile || '—'}</td>
                      <td className="px-4 py-3">
                        {s.login?.isActive ? (
                          <div className="leading-tight">
                            <div className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5 text-muted-foreground" />{s.login.email}</div>
                            <div className="text-xs text-muted-foreground">{s.login.lastLogin ? `Last sign-in ${new Date(s.login.lastLogin).toLocaleString('en-IN')}` : 'Never signed in'}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No login</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => openEdit(s)} className="btn-action" aria-label={`Edit ${s.name}`} title="Edit"><Edit className="h-4 w-4" /></button>
                          <button onClick={() => setConfirmRemove(s)} className="btn-action text-destructive" aria-label={`Remove ${s.name}`} title="Remove"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {(['PRESENT', 'ABSENT', 'LEAVE'] as const).map(st => (
                          <button
                            key={st}
                            onClick={() => mark(s, st)}
                            className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${s.attendance === st ? (st === 'PRESENT' ? 'border-green-600 bg-green-600 text-white' : st === 'ABSENT' ? 'border-destructive bg-destructive text-white' : 'border-amber-500 bg-amber-500 text-white') : 'hover:bg-accent'}`}
                          >
                            {st === 'PRESENT' ? 'Present' : st === 'ABSENT' ? 'Absent' : 'Leave'}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onMouseDown={() => setShowForm(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label={form.id ? 'Edit staff member' : 'Add staff member'}
            onSubmit={save}
            onMouseDown={e => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{form.id ? 'Edit staff member' : 'Add staff member'}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="staff-name">Full name *</label>
                <input id="staff-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label} htmlFor="staff-mobile">Mobile</label>
                <input id="staff-mobile" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} className={input} />
              </div>
              <div className="col-span-2">
                <label className={label} htmlFor="staff-role">Role *</label>
                <select id="staff-role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={input}>
                  {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLES[r].label}</option>)}
                </select>
                <p className="mt-1.5 text-xs text-muted-foreground">{ROLE_HELP[form.role]}</p>
                {form.role === 'RECEPTIONIST' && (
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.accessResults} onChange={e => setForm({ ...form, accessResults: e.target.checked })} />
                    Also allow results entry
                  </label>
                )}
              </div>
              <div>
                <label className={label} htmlFor="staff-shift">Shift</label>
                <select id="staff-shift" value={form.shift} onChange={e => pickShift(e.target.value)} className={input}>
                  {Object.entries(SHIFTS).map(([k, v]) => <option key={k} value={k}>{v.label}{v.start ? ` (${v.start}–${v.end})` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label} htmlFor="staff-start">From</label>
                  <input id="staff-start" type="time" value={form.shiftStart} onChange={e => setForm({ ...form, shift: 'CUSTOM', shiftStart: e.target.value })} className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="staff-end">To</label>
                  <input id="staff-end" type="time" value={form.shiftEnd} onChange={e => setForm({ ...form, shift: 'CUSTOM', shiftEnd: e.target.value })} className={input} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="staff-salary">Monthly salary (₹)</label>
                <input id="staff-salary" type="number" min="0" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label} htmlFor="staff-joined">Joined on</label>
                <input id="staff-joined" type="date" value={form.joinedAt} onChange={e => setForm({ ...form, joinedAt: e.target.value })} className={input} />
              </div>
            </div>

            <div className="mt-5 rounded-lg border bg-muted/30 p-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={form.loginEnabled} onChange={e => setForm({ ...form, loginEnabled: e.target.checked })} />
                Can sign in to JharLab
              </label>
              {form.loginEnabled && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <label className={label} htmlFor="staff-email">Login email *</label>
                    <input id="staff-email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={input} autoComplete="off" />
                  </div>
                  <div>
                    <label className={label} htmlFor="staff-password">{form.id ? 'New password (blank = keep)' : 'Password * (min 6)'}</label>
                    <input id="staff-password" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={input} autoComplete="new-password" minLength={6} required={!form.id} />
                  </div>
                </div>
              )}
            </div>

            {formError && <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-accent">Cancel</button>
              <button type="submit" disabled={saving} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save staff member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onMouseDown={() => setConfirmRemove(null)}>
          <div role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()} className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Remove {confirmRemove.name}?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              They disappear from the staff list{confirmRemove.login ? ' and can no longer sign in' : ''}. Bills, results and reports they made keep their name in the audit log.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmRemove(null)} className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-accent">Cancel</button>
              <button onClick={() => remove(confirmRemove)} className="h-10 rounded-lg bg-destructive px-4 text-sm font-semibold text-white hover:bg-destructive/90">Remove</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div role="status" className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.message}</div>}
    </AppLayout>
  );
}
