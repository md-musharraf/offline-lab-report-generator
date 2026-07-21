"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  KeyRound, Cpu, Calendar, Copy, Check, AlertCircle, 
  History, Settings2, Trash2, Sparkles, Loader2,
  Pause, Play, StopCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface GeneratedLicense {
  id: number;
  machineId: string;
  expiryDate: string;
  licenseKey: string;
  status: string;
  price: number;
  createdAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE:  { bg: 'bg-emerald-100 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-400', label: 'Active' },
  PAUSED:  { bg: 'bg-yellow-100 dark:bg-yellow-950/50',   text: 'text-yellow-700 dark:text-yellow-400',   label: 'Paused' },
  STOPPED: { bg: 'bg-red-100 dark:bg-red-950/50',         text: 'text-red-700 dark:text-red-400',         label: 'Stopped' },
  DELETED: { bg: 'bg-zinc-100 dark:bg-zinc-800',          text: 'text-zinc-500 dark:text-zinc-400',       label: 'Deleted' },
};

export default function SettingsPage() {
  const [machineId, setMachineId] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<number | string | null>(null);
  const [history, setHistory] = useState<GeneratedLicense[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Action loading state per license id
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  // Price edit state per license id
  const [editingPrice, setEditingPrice] = useState<Record<number, string>>({});
  const [priceSaving, setPriceSaving] = useState<Record<number, boolean>>({});
  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{ licenseId: number; action: string; machineName: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load history of generated keys on mount
  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await fetch('/api/generate-license');
      const data = await res.json();
      if (res.ok && data.success) {
        setHistory(data.licenses || []);
      } else {
        console.error('Failed to fetch history:', data.error);
      }
    } catch (e) {
      console.error('Error fetching history:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // Default expiry date to 1 year from now
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setExpiryDate(nextYear.toISOString().slice(0, 10));
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineId.trim()) {
      setError('Please enter a Machine ID.');
      return;
    }
    if (!expiryDate) {
      setError('Please select an Expiration Date.');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedKey(null);

    try {
      const res = await fetch('/api/generate-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: machineId.trim(),
          expiryDate,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setGeneratedKey(data.licenseKey);
        fetchHistory(); // refresh history
      } else {
        setError(data.error || 'Failed to generate license key.');
      }
    } catch {
      setError('Network error: Failed to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (key: string, id: number | string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(key);
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const setPresetExpiry = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setExpiryDate(date.toISOString().slice(0, 10));
  };

  // ─── License Action Handler ─────────────────────────────
  const handleLicenseAction = async (licenseId: number, action: string) => {
    // For destructive actions, show confirmation dialog first
    if ((action === 'STOP' || action === 'DELETE') && !confirmDialog) {
      const lic = history.find(l => l.id === licenseId);
      setConfirmDialog({ licenseId, action, machineName: lic?.machineId || 'Unknown' });
      return;
    }
    setConfirmDialog(null);

    setActionLoading(prev => ({ ...prev, [licenseId]: action }));
    try {
      const res = await fetch('/api/license/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: licenseId, action }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `License ${action.toLowerCase()}d successfully.`, 'success');
        await fetchHistory();
      } else {
        showToast(data.error || `Failed to ${action.toLowerCase()} license.`, 'error');
      }
    } catch {
      showToast(`Network error: Failed to ${action.toLowerCase()} license.`, 'error');
    } finally {
      setActionLoading(prev => {
        const updated = { ...prev };
        delete updated[licenseId];
        return updated;
      });
    }
  };

  // ─── Price Update Handler ───────────────────────────────
  const handlePriceSave = async (licenseId: number) => {
    const priceStr = editingPrice[licenseId];
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) {
      showToast('Please enter a valid non-negative price.', 'error');
      return;
    }

    setPriceSaving(prev => ({ ...prev, [licenseId]: true }));
    try {
      const res = await fetch('/api/license/update-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: licenseId, price }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Price updated successfully.', 'success');
        // Clear editing state and refresh
        setEditingPrice(prev => {
          const updated = { ...prev };
          delete updated[licenseId];
          return updated;
        });
        await fetchHistory();
      } else {
        showToast(data.error || 'Failed to update price.', 'error');
      }
    } catch {
      showToast('Network error: Failed to update price.', 'error');
    } finally {
      setPriceSaving(prev => ({ ...prev, [licenseId]: false }));
    }
  };

  // Filter out DELETED licenses from the visible list (they are soft-deleted)
  const visibleLicenses = history.filter(l => l.status !== 'DELETED');

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold shadow-lg border ${
              toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
            }`}
          >
            {toast.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {confirmDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setConfirmDialog(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-background border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  confirmDialog.action === 'DELETE' ? 'bg-red-100 dark:bg-red-950/50' : 'bg-orange-100 dark:bg-orange-950/50'
                }`}>
                  {confirmDialog.action === 'DELETE' ? (
                    <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                  ) : (
                    <StopCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-foreground">
                    {confirmDialog.action === 'DELETE' ? 'Delete License?' : 'Stop License?'}
                  </h3>
                  <p className="text-xs text-muted-foreground">This action affects the client machine.</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                {confirmDialog.action === 'DELETE'
                  ? `Are you sure you want to delete the license for machine "${confirmDialog.machineName}"? The client will see a "DELETED" status and lose access.`
                  : `Are you sure you want to stop the license for machine "${confirmDialog.machineName}"? The client's software features will be disabled.`
                }
              </p>
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleLicenseAction(confirmDialog.licenseId, confirmDialog.action)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-all active:scale-95 ${
                    confirmDialog.action === 'DELETE'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {confirmDialog.action === 'DELETE' ? 'Yes, Delete' : 'Yes, Stop'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings &amp; License Generator</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Create, manage, and encrypt 128-bit key activations for Pathology LIS local clients.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Vendor Admin Portal</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Generator Form */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-md backdrop-blur-sm bg-card/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" /> Generate License
              </CardTitle>
              <CardDescription>Encrypt new subscription activation keys.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleGenerate} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5" /> Machine ID
                  </label>
                  <input
                    type="text"
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    placeholder="Paste client Machine Guid..."
                    className="w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Expiration Date
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>

                {/* Expiry Presets */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPresetExpiry(30)}
                    className="text-xs py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-medium transition-all"
                  >
                    30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetExpiry(90)}
                    className="text-xs py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-medium transition-all"
                  >
                    90 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetExpiry(365)}
                    className="text-xs py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-medium transition-all"
                  >
                    1 Year
                  </button>
                </div>

                {error && (
                  <div className="flex gap-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 p-3 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm px-4 py-2.5 shadow transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <span>Generate Key</span>
                  )}
                </button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Display Generated Key & History */}
        <div className="md:col-span-2 space-y-6">
          {/* Active Generation Box */}
          <AnimatePresence mode="wait">
            {generatedKey && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="border-emerald-200 dark:border-emerald-900/60 bg-emerald-500/5 backdrop-blur-sm overflow-hidden">
                  <div className="h-1 w-full bg-emerald-500" />
                  <CardHeader className="pb-3">
                    <CardTitle className="text-emerald-700 dark:text-emerald-400 text-base font-bold flex items-center gap-2">
                      <Sparkles className="h-4 w-4" /> License Key Generated Successfully
                    </CardTitle>
                    <CardDescription className="text-emerald-600/80 dark:text-emerald-400/70">
                      Copy and share this activation string with the pathology lab client.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200/60 dark:border-emerald-950 bg-emerald-500/10 p-3 font-mono text-xs select-all break-all text-emerald-800 dark:text-emerald-300">
                      <span>{generatedKey}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(generatedKey, 'active')}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all shadow"
                      >
                        {copiedKey === 'active' ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Key</span>
                          </>
                        )}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* History */}
          <Card className="border-slate-200/80 dark:border-slate-800/80 shadow-md">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" /> Generated Licenses History
                </CardTitle>
                <CardDescription>Overview of all activation keys generated in this portal.</CardDescription>
              </div>
              <button 
                onClick={fetchHistory} 
                className="text-xs text-primary hover:underline font-semibold"
              >
                Refresh List
              </button>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/75" />
                  <p className="text-sm text-muted-foreground">Loading history records...</p>
                </div>
              ) : visibleLicenses.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-xl border-slate-200 dark:border-slate-800">
                  <KeyRound className="h-10 w-10 text-muted-foreground/45 mx-auto mb-3" />
                  <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">No generated keys found</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                    License keys you generate will appear here for tracking, auditing, and re-copying.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b">
                      <tr>
                        <th className="px-4 py-3">Client Machine Guid</th>
                        <th className="px-4 py-3">Expiry Date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Price (₹)</th>
                        <th className="px-4 py-3">Generated Key</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {visibleLicenses.map((lic) => {
                        const statusStyle = STATUS_STYLES[lic.status] || STATUS_STYLES.ACTIVE;
                        const isActionInProgress = !!actionLoading[lic.id];
                        const currentAction = actionLoading[lic.id];
                        const isPriceEditing = editingPrice[lic.id] !== undefined;
                        const isSavingPrice = priceSaving[lic.id];

                        return (
                          <tr 
                            key={lic.id}
                            className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                          >
                            {/* Machine ID */}
                            <td className="px-4 py-3 font-mono text-xs max-w-[150px] truncate" title={lic.machineId}>
                              {lic.machineId}
                            </td>

                            {/* Expiry Date */}
                            <td className="px-4 py-3 text-xs font-semibold">
                              {new Date(lic.expiryDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </td>

                            {/* Status Badge */}
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                                {statusStyle.label}
                              </span>
                            </td>

                            {/* Price Input */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground text-xs">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={isPriceEditing ? editingPrice[lic.id] : (lic.price || 0)}
                                  onChange={(e) => setEditingPrice(prev => ({ ...prev, [lic.id]: e.target.value }))}
                                  onFocus={() => {
                                    if (!isPriceEditing) {
                                      setEditingPrice(prev => ({ ...prev, [lic.id]: String(lic.price || 0) }));
                                    }
                                  }}
                                  className="w-20 rounded border bg-background/50 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                  disabled={lic.status === 'STOPPED' || lic.status === 'DELETED'}
                                />
                                {isPriceEditing && (
                                  <button
                                    onClick={() => handlePriceSave(lic.id)}
                                    disabled={isSavingPrice}
                                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
                                  >
                                    {isSavingPrice ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                    Save
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* License Key */}
                            <td className="px-4 py-3 font-mono text-xs max-w-[160px] truncate" title={lic.licenseKey}>
                              {lic.licenseKey}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {/* Copy Button */}
                                <button
                                  type="button"
                                  onClick={() => handleCopy(lic.licenseKey, lic.id)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all active:scale-95"
                                  title="Copy license key"
                                >
                                  {copiedKey === lic.id ? (
                                    <>
                                      <Check className="h-3 w-3 text-green-500" />
                                      <span className="text-green-500">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>

                                {/* Pause / Resume Button */}
                                {lic.status === 'ACTIVE' && (
                                  <button
                                    onClick={() => handleLicenseAction(lic.id, 'PAUSE')}
                                    disabled={isActionInProgress}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-950/50 dark:hover:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 transition-all active:scale-95 disabled:opacity-50"
                                    title="Pause license"
                                  >
                                    {currentAction === 'PAUSE' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                                    <span>Pause</span>
                                  </button>
                                )}
                                {lic.status === 'PAUSED' && (
                                  <button
                                    onClick={() => handleLicenseAction(lic.id, 'RESUME')}
                                    disabled={isActionInProgress}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 transition-all active:scale-95 disabled:opacity-50"
                                    title="Resume license"
                                  >
                                    {currentAction === 'RESUME' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                    <span>Resume</span>
                                  </button>
                                )}

                                {/* Stop Button */}
                                {(lic.status === 'ACTIVE' || lic.status === 'PAUSED') && (
                                  <button
                                    onClick={() => handleLicenseAction(lic.id, 'STOP')}
                                    disabled={isActionInProgress}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-orange-100 hover:bg-orange-200 dark:bg-orange-950/50 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 transition-all active:scale-95 disabled:opacity-50"
                                    title="Stop/revoke license"
                                  >
                                    {currentAction === 'STOP' ? <Loader2 className="h-3 w-3 animate-spin" /> : <StopCircle className="h-3 w-3" />}
                                    <span>Stop</span>
                                  </button>
                                )}

                                {/* Delete Button */}
                                <button
                                  onClick={() => handleLicenseAction(lic.id, 'DELETE')}
                                  disabled={isActionInProgress}
                                  className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-red-100 hover:bg-red-200 dark:bg-red-950/50 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 transition-all active:scale-95 disabled:opacity-50"
                                  title="Delete license"
                                >
                                  {currentAction === 'DELETE' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
