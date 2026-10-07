"use client";
import { AppLayout } from '@/components/AppLayout';
import { useEffect, useState } from 'react';
import { Database, HardDriveDownload, FolderOpen, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { can } from '@/lib/roles';

// Real backups of the lab database (SQLite VACUUM INTO copies), made by the backend:
// automatically once a day (14 kept), on demand, or saved to any folder / pendrive. Restore is owner/admin only.

type Backup = { name: string; file: string; sizeBytes: number; createdAt: string; type: 'AUTO' | 'MANUAL' | 'SAFETY' | 'UPDATE' };

const TYPE_LABEL: Record<Backup['type'], string> = { AUTO: 'Automatic (daily)', MANUAL: 'Manual', SAFETY: 'Safety copy before a restore', UPDATE: 'Copy before an app update' };
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const electron = () => (typeof window !== 'undefined' ? (window as any).electronAPI : null);

export default function BackupPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Backup | 'FILE' | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch('/api/backup/list').then(r => r.json()).catch(() => null);
    if (res?.success) {
      setBackups(res.backups);
      setDir(res.dir);
    }
  };

  useEffect(() => {
    try {
      setRole(JSON.parse(localStorage.getItem('pathology_lab_current_user') || 'null')?.role || null);
    } catch {}
    load();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const canRestore = can(role, 'backup:restore');
  const lastAuto = backups.find(b => b.type === 'AUTO');

  const backupNow = async () => {
    setBusy('now');
    try {
      const res = await fetch('/api/backup/create', { method: 'POST' }).then(r => r.json());
      if (!res.success) throw new Error(res.error);
      setToast({ message: `Backup saved (${size(res.backup.sizeBytes)})`, type: 'success' });
      load();
    } catch (err: any) {
      setToast({ message: err.message || 'Backup failed', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const exportCopy = async () => {
    setBusy('export');
    try {
      const res = await electron().backupExport();
      if (res.canceled) return;
      if (!res.success) throw new Error(res.error);
      setToast({ message: `Copy saved to ${res.file}`, type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message || 'Could not save the copy', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    const target = restoreTarget;
    setRestoreTarget(null);
    setBusy('restore');
    const res = await electron().backupRestore(target === 'FILE' ? undefined : target?.file);
    setBusy(null);
    if (res?.canceled) return;
    if (!res?.success) setToast({ message: res?.error || 'Restore failed', type: 'error' });
    // On success the app restarts on the restored data.
  };

  const card = 'rounded-xl border bg-card p-5 shadow-sm';
  const btn = 'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-50';

  return (
    <AppLayout title="Backup & Restore" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Backup' }]}>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className={`${card} flex flex-wrap items-center gap-4`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-600/10 text-green-700 dark:text-green-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Automatic backup is on</h2>
            <p className="text-sm text-muted-foreground">
              {lastAuto ? `Last automatic backup: ${new Date(lastAuto.createdAt).toLocaleString('en-IN')}. ` : 'The first automatic backup is made shortly after start-up. '}
              A copy is made every day and the last 14 are kept on this PC. Also save a copy to a pendrive regularly, in case this PC is lost or its disk fails.
            </p>
            {dir && <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={dir}>{dir}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={backupNow} disabled={!!busy} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
            <Database className="h-4 w-4" /> {busy === 'now' ? 'Backing up…' : 'Back up now'}
          </button>
          <button onClick={exportCopy} disabled={!!busy || !electron()} className={`${btn} border hover:bg-accent`}>
            <HardDriveDownload className="h-4 w-4" /> Save a copy to pendrive / folder…
          </button>
          <button onClick={() => electron()?.backupOpenFolder()} disabled={!electron()} className={`${btn} border hover:bg-accent`}>
            <FolderOpen className="h-4 w-4" /> Open backup folder
          </button>
          {canRestore && (
            <button onClick={() => setRestoreTarget('FILE')} disabled={!!busy || !electron()} className={`${btn} ml-auto border border-destructive/40 text-destructive hover:bg-destructive/10`}>
              <Upload className="h-4 w-4" /> Restore from a file…
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Backup</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Made on</th>
                <th className="px-4 py-3">Size</th>
                {canRestore && <th className="px-4 py-3 text-right">Restore</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {backups.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No backups yet. Click “Back up now”.</td></tr>
              )}
              {backups.map(b => (
                <tr key={b.name} data-testid="backup-row">
                  <td className="px-4 py-3 font-mono text-xs">{b.name}</td>
                  <td className="px-4 py-3">{TYPE_LABEL[b.type]}</td>
                  <td className="px-4 py-3">{new Date(b.createdAt).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">{size(b.sizeBytes)}</td>
                  {canRestore && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setRestoreTarget(b)} disabled={!!busy || !electron()} className="btn-action" aria-label={`Restore ${b.name}`} title="Restore this backup">
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!canRestore && <p className="text-xs text-muted-foreground">Restoring a backup replaces all data, so only the lab owner or an admin can do it.</p>}
      </div>

      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onMouseDown={() => setRestoreTarget(null)}>
          <div role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()} className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Restore {restoreTarget === 'FILE' ? 'a backup file' : 'this backup'}?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              All current data is replaced with the backup{restoreTarget !== 'FILE' ? ` from ${new Date(restoreTarget.createdAt).toLocaleString('en-IN')}` : ''}.
              A safety copy of today&apos;s data is saved first, and JharLab restarts on the restored data.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setRestoreTarget(null)} className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-accent">Cancel</button>
              <button onClick={restore} className="h-10 rounded-lg bg-destructive px-4 text-sm font-semibold text-white hover:bg-destructive/90">Restore and restart</button>
            </div>
          </div>
        </div>
      )}

      {busy === 'restore' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 text-sm font-medium">Restoring… JharLab will restart.</div>
      )}
      {toast && <div role="status" className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>{toast.message}</div>}
    </AppLayout>
  );
}
