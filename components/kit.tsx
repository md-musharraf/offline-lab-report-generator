"use client";
// Small shared pieces for the record screens (expenses, inventory, samples, home collection, outsourcing,
// corporate): form styles, a dialog, toasts, the signed-in role and live refresh.
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export const inputCls = 'w-full rounded-lg border bg-background px-3 text-sm';
export const labelCls = 'mb-1 block text-xs font-medium text-muted-foreground';
export const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50';
export const btnGhost = 'inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50';
export const card = 'rounded-xl border bg-card shadow-sm';
export const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground';
export const td = 'px-4 py-3';

export function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={e => e.stopPropagation()}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border bg-card p-6 shadow-xl ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export type Toast = { message: string; type: 'success' | 'error' } | null;

export function useToast(): [Toast, (message: string, type?: 'success' | 'error') => void] {
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  return [toast, useCallback((message: string, type: 'success' | 'error' = 'success') => setToast({ message, type }), [])];
}

export function ToastView({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return <div role="status" className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.message}</div>;
}

export function useRole(): string | null {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    try {
      setRole(JSON.parse(localStorage.getItem('pathology_lab_current_user') || 'null')?.role || null);
    } catch {}
  }, []);
  return role;
}

// Runs load() now and again whenever the data changes anywhere in the app (another screen, an analyzer).
export function useLive(load: () => void, models?: string[]) {
  const latest = useRef(load);
  latest.current = load; // always the newest closure, so filters chosen later are respected
  useEffect(() => {
    latest.current();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = (window as any).electronAPI?.onDbChanged?.((model: string) => {
      if (models && !models.includes(model)) return;
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), 300);
    });
    return () => {
      off?.();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export async function postApi(path: string, body?: unknown) {
  const res = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || 'Request failed');
  return data;
}

export const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dateText = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// The owner's one-time recovery code (setup, forgot password, Settings). It is shown only this once.
export function RecoveryCode({ code, onContinue, continueLabel = 'Continue' }: { code: string; onContinue: () => void; continueLabel?: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-left">
      <p className="text-sm font-semibold">Owner recovery code</p>
      <p className="select-all rounded-lg border bg-background px-3 py-2.5 text-center font-mono text-lg font-bold tracking-widest">{code}</p>
      <p className="text-xs text-muted-foreground">
        If you forget your password, this code resets it on the sign-in screen. Write it on paper and keep it at home, not near
        the lab PC: anyone with it can sign in as owner. It works once, then you get a new one. It will not be shown again.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} className="h-4 w-4" />
        I have written down this code
      </label>
      <button type="button" disabled={!saved} onClick={onContinue} className={`${btnPrimary} w-full justify-center`}>{continueLabel}</button>
    </div>
  );
}
