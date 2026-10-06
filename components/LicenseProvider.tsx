"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { KeyRound, Copy, Check, AlertCircle, Cpu, Calendar, Lock, Loader2, Sparkles, X } from 'lucide-react';

interface LicenseContextType {
  machineId: string;
  expiryDate: string | null;
  isValid: boolean;
  triggerRecheck: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export function useLicense() {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
}

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [machineId, setMachineId] = useState('');
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  // Form state
  const [keyInput, setKeyInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Software update state
  const [updateInfo, setUpdateInfo] = useState<any | null>(null);

  // Update downloading states
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'downloading' | 'installing' | 'error'>('idle');
  const [updateErrorMessage, setUpdateErrorMessage] = useState<string | null>(null);

  const isElectron = () => {
    return typeof window !== 'undefined' && !!(window as any).electronAPI && !!(window as any).electronAPI.licenseCheck;
  };

  // Admin-dashboard locks (pause/stop/delete) apply whenever the dashboard is reachable. When it is not
  // (no internet) the lab keeps working on its local licence until it reconnects.
  const REMOTE_LOCK = 'jharlab_remote_lock';
  const REMOTE_REGISTERED = 'jharlab_remote_registered';
  const renewedKey = useRef<string | null>(null);

  const storage = {
    get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  const applyState = (valid: boolean, expiry: string | null, why: string | null) => {
    setIsValid(valid);
    setExpiryDate(expiry);
    setReason(why);
  };

  const localLicense = async () => {
    if (isElectron()) return (window as any).electronAPI.licenseCheck();
    return (await fetch('/api/license/check')).json();
  };

  const remoteLicense = async (id: string): Promise<{ state: 'unreachable' } | { state: 'active'; licenseKey?: string; expiryDate?: string } | { state: 'locked'; reason: string }> => {
    try {
      const res = await fetch(`/api/license/remote-check?machineId=${encodeURIComponent(id)}`);
      if (!res.ok) return { state: 'unreachable' };
      const data = await res.json();
      if (data.success) {
        storage.set(REMOTE_REGISTERED, '1');
        if (data.status === 'PAUSED') return { state: 'locked', reason: 'Your JharLab license is temporarily PAUSED by the administrator. Please contact support to resume access.' };
        if (data.status === 'STOPPED') return { state: 'locked', reason: 'Your JharLab license has been STOPPED/REVOKED by the administrator. Software features are disabled.' };
        return { state: 'active', licenseKey: data.licenseKey, expiryDate: data.expiryDate };
      }
      // A machine that was never registered (e.g. on a local trial) is not "deleted".
      if (data.status === 'DELETED' && storage.get(REMOTE_REGISTERED)) {
        return { state: 'locked', reason: 'Your JharLab license registration has been DELETED by the administrator. Please register the machine again.' };
      }
      return { state: 'unreachable' };
    } catch {
      return { state: 'unreachable' };
    }
  };

  const checkLicenseStatus = async () => {
    try {
      const local = await localLicense();
      const id = local.machineId || 'UNKNOWN';
      setMachineId(id);

      // Unlock instantly from the local licence unless the dashboard locked us last time.
      if (local.valid && !storage.get(REMOTE_LOCK)) {
        applyState(true, local.expiryDate || null, null);
        setChecked(true);
      }

      const remote = await remoteLicense(id);
      if (remote.state === 'locked') {
        storage.set(REMOTE_LOCK, remote.reason);
        applyState(false, null, remote.reason);
      } else if (remote.state === 'active') {
        // ACTIVE only means "not paused/stopped". The licence key still decides validity, so an expired
        // subscription locks even when online; a key renewed on the dashboard is installed automatically.
        storage.set(REMOTE_LOCK, null);
        let lic = local;
        let activationError: string | null = null;
        if (remote.licenseKey && renewedKey.current !== remote.licenseKey) {
          renewedKey.current = remote.licenseKey;
          const res = isElectron()
            ? await (window as any).electronAPI.licenseActivate(remote.licenseKey)
            : await (await fetch('/api/license/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ licenseKey: remote.licenseKey }) })).json();
          if (res?.success) lic = await localLicense();
          else activationError = res?.error || null;
        }
        applyState(!!lic.valid, lic.expiryDate || null, lic.valid ? null : activationError || lic.reason || null);
      } else {
        storage.set(REMOTE_LOCK, null);
        applyState(!!local.valid, local.expiryDate || null, local.reason || null);
      }
    } catch (e) {
      console.error('Failed to check license:', e);
      applyState(false, null, 'Failed to connect to license validation service.');
    } finally {
      setChecked(true);
    }
  };

  useEffect(() => {
    checkLicenseStatus();
    // Re-check every 15 seconds so admin pause/resume takes effect quickly.
    const interval = setInterval(checkLicenseStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  // Check for software updates once the licence is active.
  useEffect(() => {
    if (!isValid) return;
    const isVersionNewer = (curr: string, next: string) => {
      const a = curr.split('.').map(Number);
      const b = String(next).split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if ((b[i] || 0) !== (a[i] || 0)) return (b[i] || 0) > (a[i] || 0);
      }
      return false;
    };
    fetch('/api/updates/check')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.success && data.update && isVersionNewer(process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0', data.update.version)) {
          setUpdateInfo(data.update);
        }
      })
      .catch(err => console.warn('Failed to check for software updates:', err));
  }, [isValid]);

  // Hook to handle Electron auto-update IPC listeners
  useEffect(() => {
    if (isElectron()) {
      const unsubscribeProgress = (window as any).electronAPI.onUpdateProgress((data: any) => {
        if (data && data.percent !== undefined) {
          setDownloadProgress(data.percent);
          setUpdateStatus('downloading');
        }
      });

      const unsubscribeError = (window as any).electronAPI.onUpdateError((err: string) => {
        setUpdateStatus('error');
        setUpdateErrorMessage(err || 'Failed to download update.');
      });

      return () => {
        unsubscribeProgress();
        unsubscribeError();
      };
    }
  }, []);

  const handleDownloadUpdate = async (e: React.MouseEvent) => {
    if (isElectron()) {
      e.preventDefault();
      setUpdateStatus('downloading');
      setDownloadProgress(0);
      setUpdateErrorMessage(null);
      
      const res = await (window as any).electronAPI.downloadAndInstallUpdate(
        updateInfo.downloadUrl,
        updateInfo.version,
        updateInfo.sha256
      );
      
      if (res && res.success) {
        setUpdateStatus('installing');
      } else {
        setUpdateStatus('error');
        setUpdateErrorMessage(res?.error || 'Failed to start download.');
      }
    }
  };

  const handleCopyMachineId = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(machineId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      setError('Please enter a license key.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      if (isElectron()) {
        const data = await (window as any).electronAPI.licenseActivate(keyInput.trim());
        if (data.success) {
          setSuccess(true);
          setTimeout(async () => {
            await checkLicenseStatus();
            setSuccess(false);
            setKeyInput('');
          }, 1500);
        } else {
          setError(data.error || 'Failed to activate. Please double-check your license key.');
        }
      } else {
        const response = await fetch('/api/license/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: keyInput.trim() }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setSuccess(true);
          setTimeout(async () => {
            await checkLicenseStatus();
            setSuccess(false);
            setKeyInput('');
          }, 1500);
        } else {
          setError(data.error || 'Failed to activate. Please double-check your license key.');
        }
      }
    } catch (e) {
      setError(isElectron() ? (e instanceof Error ? e.message : 'Failed to activate license') : 'A network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartTrial = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      let data;
      if (isElectron()) {
        data = await (window as any).electronAPI.licenseRequestTrial();
      } else {
        const response = await fetch('/api/license/trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        data = await response.json();
      }

      if (data.success) {
        setSuccess(true);
        setReason(null);
        setTimeout(async () => {
          await checkLicenseStatus();
          setSuccess(false);
        }, 1500);
      } else {
        setError(data.error || 'Trial has already been activated on this computer.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to request trial.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!checked) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Starting JharLab…</p>
      </div>
    );
  }

  if (isValid) {
    return (
      <LicenseContext.Provider value={{ machineId, expiryDate, isValid, triggerRecheck: checkLicenseStatus }}>
        {children}

        {updateInfo && (
          <div role="status" className="fixed bottom-6 right-6 z-[9999] w-[360px] rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl animate-fade-in-up">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold">Update available</h4>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">v{updateInfo.version}</span>
                  {updateInfo.isCritical && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-destructive">Required</span>}
                </div>
                {updateInfo.title && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{updateInfo.title}</p>}
              </div>
              {!updateInfo.isCritical && updateStatus !== 'downloading' && updateStatus !== 'installing' && (
                <button
                  aria-label="Dismiss update"
                  onClick={() => {
                    setUpdateInfo(null);
                    setUpdateStatus('idle');
                    setDownloadProgress(null);
                    setUpdateErrorMessage(null);
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {updateStatus === 'idle' && updateInfo.releaseNotes && (
              <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-line border-l-2 pl-3 text-xs leading-relaxed text-muted-foreground">{updateInfo.releaseNotes}</p>
            )}

            {(updateStatus === 'downloading' || updateStatus === 'installing') && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{updateStatus === 'downloading' ? 'Downloading…' : 'Starting installer… JharLab will restart.'}</span>
                  <span className="font-mono font-semibold text-primary">{downloadProgress ?? 0}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${downloadProgress ?? 0}%` }} />
                </div>
              </div>
            )}

            {updateStatus === 'error' && (
              <div className="mt-3 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{updateErrorMessage || 'The update could not be downloaded.'}</span>
              </div>
            )}

            {(updateStatus === 'idle' || updateStatus === 'error') && (
              <div className="mt-4 flex gap-2">
                <a
                  href={updateInfo.downloadUrl}
                  onClick={handleDownloadUpdate}
                  className="flex-1 rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {updateStatus === 'error' ? 'Retry download' : 'Install update'}
                </a>
                {!updateInfo.isCritical && (
                  <button
                    onClick={() => (updateStatus === 'error' ? setUpdateStatus('idle') : setUpdateInfo(null))}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-accent"
                  >
                    Later
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </LicenseContext.Provider>
    );
  }

  // Activation / lock screen
  return (
    <div className="min-h-screen w-full overflow-y-auto bg-background px-4 py-10 font-sans text-foreground">
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-amber-500 to-red-500" />
        <div className="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
              <Lock className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Activate JharLab</h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Enter your licence key, or start a free 7-day trial. Your lab data on this PC is safe either way.
            </p>
          </div>

          {reason && !error && !success && (
            <div role="alert" className="mt-6 flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{reason}</span>
            </div>
          )}

          <div className="mt-6 rounded-lg border bg-muted/40 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" /> Machine ID (send this to your administrator)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate font-mono text-sm select-all">{machineId}</code>
              <button
                type="button"
                onClick={handleCopyMachineId}
                className="flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium hover:bg-accent"
              >
                {copied ? <><Check className="h-3.5 w-3.5 text-green-600" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
          </div>

          <form onSubmit={handleActivate} className="mt-5 space-y-3">
            <label htmlFor="licenseKey" className="flex items-center gap-1.5 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-muted-foreground" /> Licence key
            </label>
            <textarea
              id="licenseKey"
              rows={3}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste your activation key here"
              disabled={submitting || success}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 font-mono text-sm disabled:opacity-50"
            />

            {error && (
              <div role="alert" className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div role="status" className="flex gap-2.5 rounded-lg border border-green-600/30 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Activated. Opening JharLab…</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || success}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking key…</> : 'Activate licence'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={handleStartTrial}
            disabled={submitting || success}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            Start 7-Day Free Trial
          </button>

          <p className="mt-6 text-center text-xs text-muted-foreground">JharLab v{process.env.NEXT_PUBLIC_APP_VERSION} © {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}
