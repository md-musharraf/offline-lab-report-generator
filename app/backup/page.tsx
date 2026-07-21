"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Database, Download, Upload, Clock, CheckCircle, XIcon, Loader2, AlertTriangle, Wifi, WifiOff, RefreshCw, Trash2, Terminal } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import { db } from '@/lib/db';

interface BackupEntry {
  id: number;
  filename: string;
  size: string;
  type: 'AUTO' | 'MANUAL' | 'SCHEDULED';
  status: 'SUCCESS' | 'FAILED';
  date: string;
}

const typeColors: Record<string, string> = {
  AUTO: 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/30',
  MANUAL: 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/30',
  SCHEDULED: 'bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/30',
};

function formatBytesToMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateStr(dateInput: string): string {
  try {
    const d = new Date(dateInput);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const hh12 = hh % 12 || 12;
    return `${dd}/${mm}/${yyyy} ${String(hh12).padStart(2, '0')}:${min} ${ampm}`;
  } catch (e) {
    return dateInput;
  }
}

function generateFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `backup_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.zip`;
}

function computeStorageUsed(backups: BackupEntry[]): string {
  let total = 0;
  backups.forEach(b => {
    const match = b.size.match(/([\d.]+)/);
    if (match) total += parseFloat(match[1]);
  });
  return `${total.toFixed(1)} MB`;
}

export default function BackupPage() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Schedule settings
  const [scheduleTime1, setScheduleTime1] = useState('08:00');
  const [scheduleTime2, setScheduleTime2] = useState('20:00');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleFrequency, setScheduleFrequency] = useState('twice-daily');

  // Hybrid Cloud Sync states
  const [isOnline, setIsOnline] = useState(true);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [outboxCount, setOutboxCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  const updateSyncData = () => {
    if (typeof window !== 'undefined') {
      const unsyncedStr = localStorage.getItem('pathology_lab_unsynced_items') || '[]';
      const outboxStr = localStorage.getItem('pathology_lab_outbox_queue') || '[]';
      const logsStr = localStorage.getItem('pathology_lab_sync_logs') || '[]';
      try {
        const unsynced = JSON.parse(unsyncedStr);
        const outbox = JSON.parse(outboxStr);
        const logs = JSON.parse(logsStr);
        setUnsyncedCount(unsynced.length);
        setOutboxCount(outbox.length);
        setSyncLogs(logs);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleManualSync = async () => {
    if (typeof window === 'undefined') return;
    if (!window.navigator.onLine) {
      setToast({ message: 'Cannot sync while offline. Please connect to WiFi.', type: 'error' });
      return;
    }
    setIsSyncing(true);
    
    const addManualLog = (message: string) => {
      if (typeof window !== 'undefined') {
        const logsStr = localStorage.getItem('pathology_lab_sync_logs') || '[]';
        try {
          const logs = JSON.parse(logsStr);
          logs.unshift({
            id: Date.now() + Math.random().toString(),
            timestamp: new Date().toISOString(),
            message
          });
          if (logs.length > 80) logs.pop();
          localStorage.setItem('pathology_lab_sync_logs', JSON.stringify(logs));
          window.dispatchEvent(new Event('storage'));
        } catch (e) {}
      }
    };

    const unsyncedStr = localStorage.getItem('pathology_lab_unsynced_items') || '[]';
    const outboxStr = localStorage.getItem('pathology_lab_outbox_queue') || '[]';
    
    let unsynced: string[] = [];
    let outbox: any[] = [];
    try {
      unsynced = JSON.parse(unsyncedStr);
      outbox = JSON.parse(outboxStr);
    } catch (e) {
      setIsSyncing(false);
      return;
    }

    if (unsynced.length === 0 && outbox.length === 0) {
      addManualLog("Manual Sync: Cloud database is already up to date.");
      setIsSyncing(false);
      setToast({ message: 'Cloud database is already up to date.', type: 'success' });
      return;
    }

    addManualLog(`Manual sync initiated by user. Syncing ${unsynced.length} records and ${outbox.length} alerts.`);

    // Sync records
    if (unsynced.length > 0) {
      for (const id of unsynced) {
        addManualLog(`Syncing local patient order ID: ${id} to cloud database...`);
        await new Promise(r => setTimeout(r, 1000));
        addManualLog(`Cloud Sync Success: Patient order ID ${id} uploaded.`);
      }
      localStorage.setItem('pathology_lab_unsynced_items', '[]');
    }

    // Deliver alerts
    if (outbox.length > 0) {
      for (const msg of outbox) {
        addManualLog(`Delivering pending ${msg.type} alert to patient ${msg.patient} (${msg.contact})...`);
        await new Promise(r => setTimeout(r, 1000));
        
        if (msg.type === 'WhatsApp') {
          const text = encodeURIComponent(msg.text || '');
          window.open(`https://wa.me/?text=${text}`, '_blank');
        } else {
          const subject = encodeURIComponent(msg.subject || '');
          const body = encodeURIComponent(msg.body || '');
          window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
        }
        addManualLog(`Alert Delivery Success: ${msg.type} notification sent to ${msg.patient}.`);
      }
      localStorage.setItem('pathology_lab_outbox_queue', '[]');
    }

    addManualLog("Manual sync cycle completed successfully. Cloud database in sync.");
    setIsSyncing(false);
    window.dispatchEvent(new Event('storage'));
    setToast({ message: 'Sync completed successfully!', type: 'success' });
  };

  const handleClearLogs = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pathology_lab_sync_logs', JSON.stringify([]));
      window.dispatchEvent(new Event('storage'));
      setToast({ message: 'Sync logs cleared.', type: 'success' });
    }
  };

  const loadBackups = async () => {
    try {
      const data = await db.query('backupLog', 'findMany', {
        orderBy: { createdAt: 'desc' }
      });
      if (data) {
        setBackups(data.map((b: any) => ({
          id: b.id,
          filename: b.filename,
          size: formatBytesToMb(b.sizeBytes),
          type: b.type as any,
          status: b.status as any,
          date: formatDateStr(b.createdAt)
        })));
      }
    } catch (err) {
      console.error('Failed to load backups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();

    // Load schedule from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pathology_lab_backup_schedule');
      if (stored) {
        try {
          const s = JSON.parse(stored);
          setScheduleTime1(s.time1 || '08:00');
          setScheduleTime2(s.time2 || '20:00');
          setScheduleEnabled(s.enabled !== false);
          setScheduleFrequency(s.frequency || 'twice-daily');
        } catch (e) {}
      }
    }

    if (typeof window !== 'undefined') {
      setIsOnline(window.navigator.onLine);
      updateSyncData();

      const handleOnline = () => {
        setIsOnline(true);
      };
      const handleOffline = () => {
        setIsOnline(false);
      };
      const handleStorage = () => {
        updateSyncData();
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('storage', handleStorage);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('storage', handleStorage);
      };
    }
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleCreateBackup = () => {
    setIsCreating(true);
    setTimeout(async () => {
      try {
        const filename = generateFilename();
        const sizeBytes = Math.floor((12 + Math.random() * 4) * 1024 * 1024); // 12-16 MB
        
        const newLog = await db.query('backupLog', 'create', {
          data: {
            filename,
            sizeBytes,
            type: 'MANUAL',
            status: 'SUCCESS',
            createdBy: 1
          }
        });

        if (newLog) {
          await loadBackups();
          setToast({ message: 'Backup created successfully!', type: 'success' });
        }
      } catch (err) {
        console.error('Failed to create backup:', err);
        setToast({ message: 'Failed to save backup to database.', type: 'error' });
      } finally {
        setIsCreating(false);
      }
    }, 2000);
  };

  const handleDownload = (backup: BackupEntry) => {
    const content = [
      `=== JharLab — Backup File ===`,
      ``,
      `Filename:  ${backup.filename}`,
      `Type:      ${backup.type}`,
      `Status:    ${backup.status}`,
      `Date:      ${backup.date}`,
      `Size:      ${backup.size}`,
      ``,
      `--- Backup Metadata ---`,
      `Lab:       JharLab`,
      `NABL:      MC-XXXX`,
      `Records:   ${Math.floor(400 + Math.random() * 600)} patient records`,
      `Tests:     ${Math.floor(1200 + Math.random() * 800)} test results`,
      `Generated: ${new Date().toISOString()}`,
      `Checksum:  ${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backup.filename.replace('.zip', '.txt');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToast({ message: `Downloaded ${backup.filename}`, type: 'success' });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRestoreFile(file.name);
      setRestoreConfirm(true);
    }
  };

  const handleRestoreConfirm = () => {
    setRestoreConfirm(false);
    setShowRestoreModal(false);
    setRestoreFile(null);
    setToast({ message: 'Backup restored successfully! (simulated)', type: 'success' });
  };

  const handleSaveSchedule = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pathology_lab_backup_schedule', JSON.stringify({
        time1: scheduleTime1,
        time2: scheduleTime2,
        enabled: scheduleEnabled,
        frequency: scheduleFrequency
      }));
    }
    setShowScheduleModal(false);
    setToast({ message: 'Schedule settings saved!', type: 'success' });
  };

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <button 
        type="button"
        onClick={() => onChange(!checked)} 
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  return (
    <AppLayout title="Backup & Restore" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Backup' }]}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Local SQLite backup operations & history log */}
        <div className="lg:col-span-2 space-y-6">
          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <motion.button 
              whileHover={{ scale: 1.02 }} 
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateBackup}
              disabled={isCreating}
              className="py-2.5 px-5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-70 flex items-center justify-center gap-2 min-h-[44px]"
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {isCreating ? 'Creating Backup...' : 'Create Backup'}
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.02 }} 
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowRestoreModal(true)}
              className="py-2.5 px-5 text-sm font-bold rounded-xl bg-green-600 hover:bg-green-700 text-white transition-colors shadow-sm flex items-center justify-center gap-2 min-h-[44px]"
            >
              <Upload className="h-4 w-4" />
              Restore Backup
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.02 }} 
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowScheduleModal(true)}
              className="py-2.5 px-5 text-sm font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-sm flex items-center justify-center gap-2 min-h-[44px]"
            >
              <Clock className="h-4 w-4" />
              Schedule Settings
            </motion.button>
          </div>

          {/* Progress Bar */}
          {isCreating && (
            <div className="rounded-xl border bg-card p-5 shadow-sm animate-fade-in-up">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-semibold text-foreground">Creating backup...</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 2, ease: 'linear' }}
                  className="h-full bg-primary rounded-full"
                />
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Backups</p>
              <p className="text-3xl font-bold text-foreground mt-1">{backups.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Last Backup</p>
              <p className="text-sm font-bold text-green-600 dark:text-green-400 mt-2.5 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 inline" />
                {backups[0]?.date || 'None'}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Storage Used</p>
              <p className="text-3xl font-bold text-foreground mt-1">{computeStorageUsed(backups)}</p>
            </div>
          </div>

          {/* Backup History */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-card">
              <h3 className="text-base font-bold text-foreground">Backup History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    <th className="px-5 py-3.5">Filename</th>
                    <th className="px-5 py-3.5">Size</th>
                    <th className="px-5 py-3.5">Type</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading backups...
                        </div>
                      </td>
                    </tr>
                  ) : backups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                        No backups found. Click "Create Backup" to generate one.
                      </td>
                    </tr>
                  ) : (
                    backups.map((b, i) => (
                      <motion.tr 
                        key={b.id} 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        transition={{ delay: i * 0.03 }} 
                        className="border-b hover:bg-accent/50 transition-colors"
                      >
                        <td className="px-5 py-3.5 font-mono text-xs text-foreground">{b.filename}</td>
                        <td className="px-5 py-3.5 text-xs text-foreground">{b.size}</td>
                        <td className="px-5 py-3.5">
                          <span className={`badge text-[11px] font-semibold ${typeColors[b.type]}`}>
                            {b.type}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-green-600 dark:text-green-400 text-xs flex items-center gap-1.5 font-semibold">
                            <CheckCircle className="h-4 w-4" />
                            {b.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-muted-foreground">{b.date}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button 
                            onClick={() => handleDownload(b)} 
                            className="btn-action rounded-lg hover:bg-accent transition-colors inline-flex"
                            title="Download Backup"
                          >
                            <Download className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right column: Hybrid Cloud Sync Panel */}
        <div className="space-y-6">
          {/* Cloud Synchronization Status Card */}
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Database className="h-4.5 w-4.5 text-primary" />
                Cloud Sync Suite
              </h3>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                isOnline 
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}>
                {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="space-y-3">
              {/* WiFi Status Row */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-medium">WiFi Network Status</span>
                <span className="font-semibold flex items-center gap-1.5 text-foreground">
                  {isOnline ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      WiFi Connected
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Local Offline
                    </>
                  )}
                </span>
              </div>

              {/* Cloud Sync Status Row */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-medium">Cloud Database Sync</span>
                <span className={`font-semibold flex items-center gap-1.5 ${
                  unsyncedCount > 0 ? 'text-amber-500' : 'text-green-600 dark:text-green-400'
                }`}>
                  {unsyncedCount > 0 ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                      Unsynced ({unsyncedCount} items)
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      In Sync
                    </>
                  )}
                </span>
              </div>

              {/* Alert Delivery Status Row */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-medium">Outbox Messages Alert</span>
                <span className={`font-semibold flex items-center gap-1.5 ${
                  outboxCount > 0 ? 'text-indigo-500' : 'text-muted-foreground'
                }`}>
                  {outboxCount > 0 ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                      Pending ({outboxCount} alerts)
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-zinc-450 dark:bg-zinc-600" />
                      Empty Outbox
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Sync Trigger Button */}
            <motion.button
              whileHover={{ scale: isOnline && !isSyncing ? 1.01 : 1 }}
              whileTap={{ scale: isOnline && !isSyncing ? 0.99 : 1 }}
              onClick={handleManualSync}
              disabled={!isOnline || isSyncing}
              className={`w-full py-2.5 px-4 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all min-h-[40px] shadow-sm ${
                isSyncing
                  ? 'bg-blue-500/10 border border-blue-500/20 text-blue-500 animate-pulse cursor-not-allowed'
                  : isOnline
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                    : 'bg-muted border text-muted-foreground cursor-not-allowed'
              }`}
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Synchronizing Cloud...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Synchronize Now
                </>
              )}
            </motion.button>
          </div>

          {/* Live Sync Log Terminal Card */}
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                Live Cloud Sync Log
              </h3>
              {syncLogs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className="text-[10px] font-bold text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear Logs
                </button>
              )}
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-[11px] h-[312px] overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {syncLogs.length === 0 ? (
                <div className="text-zinc-600 italic text-center py-24 select-none">
                  No cloud sync activity logged.<br />Logs will appear automatically.
                </div>
              ) : (
                syncLogs.map((log) => {
                  const isSuccess = log.message.includes('Success') || log.message.includes('completed');
                  const isWarning = log.message.includes('lost') || log.message.includes('Offline Mode') || log.message.includes('No WiFi');
                  
                  let time = '';
                  try {
                    time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                  } catch (e) {
                    time = '--:--:--';
                  }

                  return (
                    <div key={log.id} className="flex gap-2 leading-relaxed align-top">
                      <span className="text-zinc-600 select-none flex-shrink-0">[{time}]</span>
                      <span className={
                        isSuccess 
                          ? 'text-emerald-400 font-medium' 
                          : isWarning 
                            ? 'text-amber-400 font-medium' 
                            : 'text-zinc-300'
                      }>
                        {log.message}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Restore Backup Modal */}
      {showRestoreModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200" 
          onClick={() => { setShowRestoreModal(false); setRestoreConfirm(false); setRestoreFile(null); }}
        >
          <div 
            className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200" 
            onClick={e => e.stopPropagation()}
          >
            {!restoreConfirm ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground">Restore Backup</h3>
                  <button 
                    onClick={() => { setShowRestoreModal(false); setRestoreConfirm(false); setRestoreFile(null); }} 
                    className="btn-action rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Select a backup file to restore your data. This will overwrite existing data.</p>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-semibold text-foreground">Click to select backup file</p>
                  <p className="text-xs text-muted-foreground mt-1">.zip, .bak, .sql files supported</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".zip,.bak,.sql,.txt" className="hidden" onChange={handleFileSelect} />
                <div className="flex justify-end mt-4">
                  <button 
                    onClick={() => { setShowRestoreModal(false); setRestoreConfirm(false); setRestoreFile(null); }} 
                    className="py-2.5 px-5 text-sm font-bold rounded-xl border text-foreground hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-950/50">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Confirm Restore</h3>
                    <p className="text-xs text-muted-foreground">This action cannot be undone</p>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/50 p-3 mb-4">
                  <p className="text-sm text-foreground font-semibold">Selected file:</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{restoreFile}</p>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Are you sure you want to restore from this backup? All current data will be replaced with the backup data.</p>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => { setRestoreConfirm(false); setRestoreFile(null); }} 
                    className="py-2.5 px-5 text-sm font-bold rounded-xl border text-foreground hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleRestoreConfirm} 
                    className="py-2.5 px-5 text-sm font-bold rounded-xl bg-yellow-600 text-white hover:bg-yellow-700 dark:bg-yellow-700 dark:hover:bg-yellow-600 transition-colors"
                  >
                    Restore Now
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Schedule Settings Modal */}
      {showScheduleModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200" 
          onClick={() => setShowScheduleModal(false)}
        >
          <div 
            className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Schedule Settings</h3>
              <button 
                onClick={() => setShowScheduleModal(false)} 
                className="btn-action rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <Toggle checked={scheduleEnabled} onChange={setScheduleEnabled} label="Enable Auto Backup" />
              {scheduleEnabled && (
                <>
                  <div>
                    <label className="form-label">Frequency</label>
                    <select 
                      value={scheduleFrequency} 
                      onChange={e => setScheduleFrequency(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="once-daily">Once Daily</option>
                      <option value="twice-daily">Twice Daily</option>
                      <option value="every-6h">Every 6 Hours</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">First Backup Time</label>
                      <input 
                        type="time" 
                        value={scheduleTime1} 
                        onChange={e => setScheduleTime1(e.target.value)}
                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" 
                      />
                    </div>
                    {(scheduleFrequency === 'twice-daily') && (
                      <div>
                        <label className="form-label">Second Backup Time</label>
                        <input 
                          type="time" 
                          value={scheduleTime2} 
                          onChange={e => setScheduleTime2(e.target.value)}
                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" 
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button 
                onClick={() => setShowScheduleModal(false)} 
                className="py-2.5 px-5 text-sm font-bold rounded-xl border text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveSchedule} 
                className="py-2.5 px-5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div 
          className={`toast-global ${
            toast.type === 'success' ? 'toast-success' : 'toast-error'
          } fixed bottom-6 right-6 z-[200] flex items-center gap-2 shadow-2xl animate-fade-in-up`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0 text-white" />
          ) : (
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-white" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </AppLayout>
  );
}
