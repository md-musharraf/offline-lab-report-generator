"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
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

  const checkLicenseStatus = async () => {
    try {
      let currentMachineId = 'UNKNOWN';
      let offlineValidation = { valid: false, expiryDate: null, reason: 'License check in progress' };
      
      // 1. Perform instant local/offline validation
      if (isElectron()) {
        const data = await (window as any).electronAPI.licenseCheck();
        currentMachineId = data.machineId || 'UNKNOWN';
        offlineValidation = data;
      } else {
        const response = await fetch('/api/license/check');
        const data = await response.json();
        currentMachineId = data.machineId || 'UNKNOWN';
        offlineValidation = data;
      }
      setMachineId(currentMachineId);

      // If valid offline, unlock the app instantly
      if (offlineValidation.valid) {
        setIsValid(true);
        setExpiryDate(offlineValidation.expiryDate || null);
        setReason(null);
        setChecked(true);
      }

      // 2. Perform online verification check in the background
      fetch(`/api/license/remote-check?machineId=${encodeURIComponent(currentMachineId)}`)
        .then(async (remoteRes) => {
          if (remoteRes.ok) {
            const remoteData = await remoteRes.json();
            if (remoteData.success) {
              const remoteStatus = remoteData.status;
              
              if (remoteStatus === 'PAUSED') {
                setIsValid(false);
                setReason('Your JharLab license is temporarily PAUSED by the administrator. Please contact support to resume access.');
                return;
              }
              
              if (remoteStatus === 'STOPPED') {
                setIsValid(false);
                setReason('Your JharLab license has been STOPPED/REVOKED by the administrator. Software features are disabled.');
                return;
              }

              // Auto-renew: if active and we got a new license key from server, write it locally
              if (remoteStatus === 'ACTIVE' && remoteData.licenseKey) {
                if (isElectron()) {
                  await (window as any).electronAPI.licenseActivate(remoteData.licenseKey);
                } else {
                  await fetch('/api/license/activate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ licenseKey: remoteData.licenseKey }),
                  });
                }
              }
              
              // Maintain active state
              setIsValid(true);
              setExpiryDate(remoteData.expiryDate || offlineValidation.expiryDate || null);
              setReason(null);
            } else if (remoteData.status === 'DELETED') {
              setIsValid(false);
              setReason('Your JharLab license registration has been DELETED by the administrator. Please register the machine again.');
            } else {
              // Fallback to offline status if online fails
              setIsValid(!!offlineValidation.valid);
              setExpiryDate(offlineValidation.expiryDate || null);
              setReason(offlineValidation.reason || null);
            }
          } else {
            // Non-ok response (fallback to local database status)
            setIsValid(!!offlineValidation.valid);
            setExpiryDate(offlineValidation.expiryDate || null);
            setReason(offlineValidation.reason || null);
          }
        })
        .catch((remoteErr) => {
          console.warn('Online license verification unreachable. Relying on offline check.', remoteErr);
          // Fallback to local database status
          setIsValid(!!offlineValidation.valid);
          setExpiryDate(offlineValidation.expiryDate || null);
          setReason(offlineValidation.reason || null);
        })
        .finally(() => {
          setChecked(true);
        });

    } catch (e) {
      console.error('Failed to check license:', e);
      setIsValid(false);
      setReason('Failed to connect to license validation service.');
      setChecked(true);
    }
  };

  useEffect(() => {
    checkLicenseStatus();

    // Periodic check every 15 seconds to lock/unlock in real-time
    const interval = setInterval(() => {
      checkLicenseStatus();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // Hook to check for software updates when license is active
  useEffect(() => {
    if (isValid) {
      const checkUpdates = async () => {
        try {
          const res = await fetch('/api/updates/check');
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.update) {
              const currentVersion = '1.0.0';
              
              // Semver comparison helper
              const isVersionNewer = (curr: string, next: string) => {
                const currParts = curr.split('.').map(Number);
                const nextParts = next.split('.').map(Number);
                for (let i = 0; i < 3; i++) {
                  if ((nextParts[i] || 0) > (currParts[i] || 0)) return true;
                  if ((nextParts[i] || 0) < (currParts[i] || 0)) return false;
                }
                return false;
              };

              if (isVersionNewer(currentVersion, data.update.version)) {
                setUpdateInfo(data.update);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to check for software updates:', err);
        }
      };
      checkUpdates();
    }
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
        updateInfo.version
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
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-200">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-sm font-medium tracking-wide text-slate-400">Verifying LIS License status...</p>
      </div>
    );
  }

  if (isValid) {
    return (
      <LicenseContext.Provider value={{ machineId, expiryDate, isValid, triggerRecheck: checkLicenseStatus }}>
        {children}
        
        {/* Modern Toast Software Update Notification */}
        {updateInfo && (
          <div className="fixed bottom-6 right-6 z-[9999] max-w-sm backdrop-blur-md bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl animate-fade-in-up">
            <div className="flex items-start justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              {!updateInfo.isCritical && updateStatus !== 'downloading' && updateStatus !== 'installing' && (
                <button 
                  onClick={() => {
                    setUpdateInfo(null);
                    setUpdateStatus('idle');
                    setDownloadProgress(null);
                    setUpdateErrorMessage(null);
                  }}
                  className="text-slate-500 hover:text-slate-355 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-white text-sm">Update Available</h4>
                <span className="font-mono text-[10px] bg-primary/10 border border-primary/25 text-primary px-1.5 py-0.5 rounded">
                  v{updateInfo.version}
                </span>
                {updateInfo.isCritical && (
                  <span className="text-[9px] font-black uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 rounded">
                    Forced
                  </span>
                )}
              </div>
              <p className="font-semibold text-slate-300 mt-1 text-xs">{updateInfo.title}</p>
              
              {updateStatus === 'idle' && (
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed whitespace-pre-line border-l-2 border-slate-800 pl-2">
                  {updateInfo.releaseNotes}
                </p>
              )}

              {/* Progress and status UI */}
              {(updateStatus === 'downloading' || updateStatus === 'installing') && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium animate-pulse">
                      {updateStatus === 'downloading' ? 'Downloading features...' : 'Preparing installer...'}
                    </span>
                    <span className="font-mono text-primary font-bold">{downloadProgress ?? 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary via-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${downloadProgress ?? 0}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 text-center">
                    {updateStatus === 'downloading' ? 'Please keep the application open.' : 'The app will close to complete installation.'}
                  </p>
                </div>
              )}

              {updateStatus === 'error' && (
                <div className="mt-3 rounded-lg border border-red-955/40 bg-red-955/15 p-2.5 text-xs text-red-400">
                  <div className="flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{updateErrorMessage || 'An error occurred during update.'}</span>
                  </div>
                </div>
              )}

              {updateStatus === 'idle' && (
                <div className="mt-4 flex items-center gap-2">
                  <a 
                    href={updateInfo.downloadUrl} 
                    onClick={handleDownloadUpdate}
                    className="flex-1 bg-primary text-white text-xs font-bold py-2 px-3 rounded-lg text-center hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/10"
                  >
                    Download Update
                  </a>
                  {!updateInfo.isCritical && (
                    <button 
                      onClick={() => setUpdateInfo(null)}
                      className="bg-slate-800 text-slate-300 hover:bg-slate-750 text-xs font-semibold py-2 px-3 rounded-lg active:scale-95 transition-all cursor-pointer"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )}

              {updateStatus === 'error' && (
                <div className="mt-4 flex items-center gap-2">
                  <button 
                    onClick={handleDownloadUpdate}
                    className="flex-1 bg-primary text-white text-xs font-bold py-2 px-3 rounded-lg text-center hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/10"
                  >
                    Retry Download
                  </button>
                  <button 
                    onClick={() => {
                      setUpdateStatus('idle');
                      setDownloadProgress(null);
                      setUpdateErrorMessage(null);
                    }}
                    className="bg-slate-800 text-slate-300 hover:bg-slate-750 text-xs font-semibold py-2 px-3 rounded-lg active:scale-95 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </LicenseContext.Provider>
    );
  }

  // Render Premium Activation Lock Screen
  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-slate-950 px-4 font-sans text-slate-100 selection:bg-primary selection:text-white">
      {/* Background Ambient Glows */}
      <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-blue-900/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-violet-900/10 blur-[120px]" />

      <div className="z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-xl shadow-2xl transition-all duration-300">
        {/* Header Indicator */}
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
        
        <div className="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-950/40 border border-red-800/40 text-red-500 shadow-inner mb-6">
              <Lock className="h-8 w-8 animate-pulse" />
            </div>
            
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Software Lock Active</h2>
            <p className="mt-2 text-sm text-slate-400 max-w-md">
              JharLab Laboratory Information System. The system has been locked by the administrator or the license has expired.
            </p>
          </div>

          {/* Machine ID Section */}
          <div className="mt-8 rounded-xl border border-slate-850 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">
              <span className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" /> Your Machine ID</span>
              <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">Offline Valid</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-sm font-mono text-slate-300">
              <span className="truncate select-all">{machineId}</span>
              <button
                type="button"
                onClick={handleCopyMachineId}
                className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-green-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-550 leading-relaxed">
              {reason || 'Send this ID to your administrator to generate or renew your subscription activation key.'}
            </p>
          </div>

          {/* Form Section */}
          <form onSubmit={handleActivate} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="licenseKey" className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> Enter License Key
              </label>
              <textarea
                id="licenseKey"
                rows={3}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Paste your subscription activation key here..."
                disabled={submitting || success}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm font-mono text-slate-200 placeholder-slate-600 shadow-inner focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all disabled:opacity-50 resize-none"
              />
            </div>

            {/* Notifications */}
            {reason && !error && !success && (
              <div className="flex gap-2.5 rounded-xl border border-red-950/40 bg-red-950/15 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{reason}</span>
              </div>
            )}

            {error && (
              <div className="flex gap-2.5 rounded-xl border border-red-950/40 bg-red-950/15 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex gap-2.5 rounded-xl border border-green-950/40 bg-green-950/15 p-3 text-xs text-green-400 animate-bounce">
                <Check className="h-4 w-4 shrink-0 mt-0.5" />
                <span>License Key verified! Unlocking LIS dashboard...</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || success}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 px-4 py-3 text-sm font-bold text-white shadow-lg hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Validating Key...</span>
                </>
              ) : (
                <span>Activate License</span>
              )}
            </button>
          </form>

          <div className="relative my-6 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <span className="relative bg-[#090d16] px-3 text-xs text-slate-500 uppercase tracking-widest">or</span>
          </div>

          {/* Trial Activation Button */}
          <button
            type="button"
            onClick={handleStartTrial}
            disabled={submitting || success}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-850 bg-slate-900/60 hover:bg-slate-800 hover:text-white text-slate-300 px-4 py-3 text-sm font-bold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-inner"
          >
            <Sparkles className="h-4.5 w-4.5 text-amber-500" />
            Start 7-Day Free Trial
          </button>

          {/* Footer Info */}
          <div className="mt-8 pt-6 border-t border-slate-800/60 text-center text-xs text-slate-500">
            JharLab © {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </div>
  );
}
