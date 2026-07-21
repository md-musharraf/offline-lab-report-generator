"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Search, Download, Filter, User, Clock } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';

interface AuditLogEntry {
  id: number;
  user: string;
  action: string;
  module: string;
  details: string;
  time: string;
  date: string;
}

const initialLogs: AuditLogEntry[] = [];

const moduleColors: Record<string, string> = {
  Patients: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  Billing: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  Samples: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400',
  Results: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  Reports: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
  Settings: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  Backup: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
};

const ALL_MODULES = ['Patients', 'Billing', 'Samples', 'Results', 'Reports', 'Settings', 'Backup'];

/** Helper: parse dd/mm/yyyy to a Date object (midnight). */
function parseDDMMYYYY(dateStr: string): Date | null {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}

/** Add a new audit log entry to the beginning of the provided setter's list. */
function addAuditLog(
  setter: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>,
  entry: Omit<AuditLogEntry, 'id' | 'time' | 'date'>
) {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  const time = `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
  const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  setter((prev) => [
    { ...entry, id: Date.now(), time, date },
    ...prev,
  ]);
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Derive unique users from logs
  const allUsers = useMemo(() => Array.from(new Set(logs.map((l) => l.user))), [logs]);

  const toggleModule = useCallback((mod: string) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      next.has(mod) ? next.delete(mod) : next.add(mod);
      return next;
    });
  }, []);

  const toggleUser = useCallback((user: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      next.has(user) ? next.delete(user) : next.add(user);
      return next;
    });
  }, []);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Text search across all text fields
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.user.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          l.module.toLowerCase().includes(q) ||
          l.details.toLowerCase().includes(q)
      );
    }

    // Module filter
    if (selectedModules.size > 0) {
      result = result.filter((l) => selectedModules.has(l.module));
    }

    // User filter
    if (selectedUsers.size > 0) {
      result = result.filter((l) => selectedUsers.has(l.user));
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((l) => {
        const d = parseDDMMYYYY(l.date);
        return d ? d >= from : true;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo);
      result = result.filter((l) => {
        const d = parseDDMMYYYY(l.date);
        return d ? d <= to : true;
      });
    }

    return result;
  }, [logs, search, selectedModules, selectedUsers, dateFrom, dateTo]);

  // Export filtered logs as CSV
  const handleExport = useCallback(() => {
    if (filteredLogs.length === 0) {
      setToast({ message: 'No logs to export', type: 'error' });
      return;
    }
    const headers = ['Date', 'Time', 'User', 'Action', 'Module', 'Details'];
    const rows = filteredLogs.map((l) =>
      [l.date, l.time, l.user, l.action, l.module, l.details]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: `Exported ${filteredLogs.length} log entries`, type: 'success' });
  }, [filteredLogs]);

  const clearFilters = useCallback(() => {
    setSelectedModules(new Set());
    setSelectedUsers(new Set());
    setDateFrom('');
    setDateTo('');
  }, []);

  const activeFilterCount = selectedModules.size + selectedUsers.size + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  return (
    <AppLayout title="Audit Log" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Audit Log' }]}>
      <div className="space-y-4 animate-fade-in-up">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search logs..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 rounded-xl border bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary" 
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters((p) => !p)}
              className={`btn-action flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-accent transition-all ${
                showFilters ? 'bg-accent ring-2 ring-primary text-foreground border-primary' : ''
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-[11px] px-2 py-0.5 font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button 
              onClick={handleExport} 
              className="btn-action flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-accent transition-all"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }} 
            className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow duration-200 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Filters</h3>
              <button onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline p-1">Clear All</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Module filter */}
              <div>
                <label className="form-label mb-2">Module</label>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {ALL_MODULES.map((mod) => (
                    <label key={mod} className="flex items-center gap-2.5 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedModules.has(mod)}
                        onChange={() => toggleModule(mod)}
                        className="rounded border-gray-300 text-primary focus:ring-primary h-4.5 w-4.5"
                      />
                      <span className={`badge ${moduleColors[mod]}`}>{mod}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* User filter */}
              <div>
                <label className="form-label mb-2">User</label>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {allUsers.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">No users available</div>
                  ) : (
                    allUsers.map((user) => (
                      <label key={user} className="flex items-center gap-2.5 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(user)}
                          onChange={() => toggleUser(user)}
                          className="rounded border-gray-300 text-primary focus:ring-primary h-4.5 w-4.5"
                        />
                        <span>{user}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              {/* Date range */}
              <div>
                <label className="form-label mb-2">Date Range</label>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">From</label>
                    <input 
                      type="date" 
                      value={dateFrom} 
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full h-11 rounded-xl border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">To</label>
                    <input 
                      type="date" 
                      value={dateTo} 
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full h-11 rounded-xl border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider table-row-standard">
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr className="table-row-standard">
                  <td colSpan={5} className="text-center text-muted-foreground py-10">
                    No audit log entries match your filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((l, i) => (
                  <motion.tr 
                    key={l.id} 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    transition={{ delay: i * 0.02 }} 
                    className="border-b hover:bg-accent/50 odd:bg-background even:bg-muted/20 dark:even:bg-muted/10 table-row-standard"
                  >
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{l.date} {l.time}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{l.user}</span>
                      </div>
                    </td>
                    <td className="font-medium text-foreground">{l.action}</td>
                    <td>
                      <span className={`badge ${moduleColors[l.module]}`}>
                        {l.module}
                      </span>
                    </td>
                    <td className="text-xs text-muted-foreground">{l.details}</td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Results count */}
        <div className="text-xs text-muted-foreground text-right">
          Showing {filteredLogs.length} of {logs.length} entries
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`toast-global toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
