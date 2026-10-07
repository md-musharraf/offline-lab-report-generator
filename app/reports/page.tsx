"use client";
import { AppLayout } from '@/components/AppLayout';
import { can } from '@/lib/roles';
import { motion } from 'framer-motion';
import { FileText, Printer, MessageCircle, Mail, Download, Eye, CheckCircle, Search, XIcon } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/db';
import { postApi } from '@/components/kit';
import { reportPdfUrl, downloadReportPdf, ReportPreview } from '@/components/ReportPreview';

interface Report {
  orderId: number;
  orderNo: string;
  patient: string;
  mobile: string;
  tests: string;
  status: string;
  approvedBy: string;
  date: string;
  printed: number;
  amended: boolean;
  patientId: string;
}

const statusStyles: Record<string, string> = {
  VERIFIED: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  DELIVERED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
};

export default function ReportsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('pathology_lab_current_user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {}
    }
  }, []);

  const canApprove = can(currentUser?.role, 'report:approve');

  const [search, setSearch] = useState('');

  const [reports, setReports] = useState<Report[]>([]);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [labName, setLabName] = useState('');

  const fetchOrders = useCallback(async () => {
    try {
      setSelectedReportIds([]);
      const settings = await db.query('labSettings', 'findFirst', { where: { id: 1 }, select: { labName: true } });
      setLabName(settings?.labName || '');

      const dbOrders = await db.query('testOrder', 'findMany', {
        where: { status: { in: ['RESULT_ENTERED', 'APPROVED', 'DELIVERED'] } },
        include: {
          patient: { select: { name: true, mobile: true } },
          items: { include: { test: { select: { name: true, shortName: true } } } },
          report: { select: { printCount: true, version: true, approvedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      setReports((dbOrders || []).map((order: any) => {
        const final = order.status === 'APPROVED' || order.status === 'DELIVERED';
        return {
          orderId: order.id,
          orderNo: order.orderNo,
          patient: order.patient?.name || 'Unknown',
          patientId: order.patientId || '',
          mobile: order.patient?.mobile || '',
          tests: (order.items || []).map((item: any) => item.test?.shortName || item.test?.name).join(', '),
          status: final ? order.status : 'VERIFIED',
          approvedBy: final && order.report?.approvedAt ? `Approved ${new Date(order.report.approvedAt).toLocaleDateString('en-GB')}` : 'Draft Report',
          date: new Date(order.createdAt).toLocaleDateString('en-GB'),
          printed: order.report?.printCount || 0,
          amended: final && (order.report?.version || 0) > 1,
        };
      }));
    } catch (error) {
      console.error('Failed to load reports from database', error);
      setToast({ message: 'Failed to load reports', type: 'error' });
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ?orderId= opens that report's preview (links from the results screens).
  useEffect(() => {
    const orderId = Number(new URLSearchParams(window.location.search).get('orderId'));
    const r = orderId && reports.find(rep => rep.orderId === orderId);
    if (r) setPreviewReport(r);
  }, [reports]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Filter reports by search with prefix match prioritization
  const filteredReports = useMemo(() => {
    let matched = reports;
    const q = search.toLowerCase().trim();
    if (q) {
      matched = reports.filter((r) => {
        return (
          r.orderNo.toLowerCase().includes(q) ||
          r.patient.toLowerCase().includes(q) ||
          r.mobile.toLowerCase().includes(q) ||
          r.tests.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          r.date.toLowerCase().includes(q)
        );
      });

      // Prioritize prefix and word-start matches on patient name, mobile or order number
      matched = [...matched].sort((a, b) => {
        const starts = (r: Report) => r.patient.toLowerCase().startsWith(q) || r.mobile.startsWith(q) || r.orderNo.toLowerCase().startsWith(q);
        const wordStarts = (r: Report) => r.patient.toLowerCase().split(/\s+/).some(w => w.startsWith(q));
        return Number(starts(b)) - Number(starts(a)) || Number(wordStarts(b)) - Number(wordStarts(a));
      });
    }
    return matched;
  }, [reports, search]);

  const handleToggleSelect = (orderNo: string) => {
    setSelectedReportIds(prev =>
      prev.includes(orderNo) ? prev.filter(id => id !== orderNo) : [...prev, orderNo]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedReportIds(checked ? filteredReports.map(r => r.orderNo) : []);
  };

  const stats = {
    pendingApproval: reports.filter((r) => r.status === 'VERIFIED').length,
    approved: reports.filter((r) => r.status === 'APPROVED').length,
    delivered: reports.filter((r) => r.status === 'DELIVERED').length,
    amended: reports.filter((r) => r.amended).length,
  };

  // Approval freezes the report: later changes to the logo, address, signatures, tests or patient
  // details do not change it.
  const handleApprove = async (r: Report) => {
    try {
      await postApi('reports/approve', { orderId: r.orderId });
      setToast({ message: `Report approved for ${r.patient}`, type: 'success' });
      await fetchOrders();
      return true;
    } catch (error: any) {
      setToast({ message: error.message || 'Failed to approve report', type: 'error' });
      return false;
    }
  };

  const handlePrint = useCallback(async (r: Report) => {
    try {
      await downloadReportPdf([r.orderId], `${r.orderNo}-report.pdf`);
      setToast({ message: `PDF downloaded for ${r.orderNo}`, type: 'success' });
      await fetchOrders();
    } catch (error: any) {
      setToast({ message: error.message || 'Failed to generate PDF', type: 'error' });
    }
  }, [fetchOrders]);

  // Queues the message in the Outbox when offline (sent from there later).
  const queueOffline = (entry: Record<string, string>) => {
    try {
      const queue = JSON.parse(localStorage.getItem('pathology_lab_outbox_queue') || '[]');
      queue.push({ id: Date.now() + Math.random().toString(), date: new Date().toISOString(), ...entry });
      localStorage.setItem('pathology_lab_outbox_queue', JSON.stringify(queue));
      const syncLogs = JSON.parse(localStorage.getItem('pathology_lab_sync_logs') || '[]');
      syncLogs.unshift({ id: Date.now() + Math.random().toString(), timestamp: new Date().toISOString(), message: `[Offline Mode] Queued ${entry.type} alert for patient: ${entry.patient}` });
      localStorage.setItem('pathology_lab_sync_logs', JSON.stringify(syncLogs));
      window.dispatchEvent(new Event('storage'));
      setToast({ message: `No internet connection. ${entry.type} alert for ${entry.patient} has been queued in Outbox.`, type: 'success' });
    } catch (e) {
      console.error(e);
    }
  };

  const signOff = labName || 'Diagnostic Centre';

  const handleWhatsApp = async (r: Report) => {
    let textStr = `Dear ${r.patient},\n\nYour lab report for order ${r.orderNo} (${r.tests}) is ready.\n\nRegards,\n${signOff}`;
    if (!navigator.onLine) {
      queueOffline({ type: 'WhatsApp', patient: r.patient, contact: r.mobile || 'WhatsApp contact', text: textStr });
      return;
    }
    if (r.status !== 'VERIFIED') {
      try {
        const { verifyUrl } = await postApi('reports/verify-url', { orderId: r.orderId });
        textStr = `Dear ${r.patient},\n\nYour lab report for order ${r.orderNo} (${r.tests}) is ready.\n\nYou can view and verify your report online here:\n${verifyUrl}\n\nRegards,\n${signOff}`;
      } catch (e) {
        console.error('Failed to get the report verification link:', e);
      }
    }
    const phone = r.mobile ? r.mobile.replace(/[^0-9]/g, '') : '';
    const formattedPhone = phone.length === 10 ? '91' + phone : phone;
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(textStr)}`, '_blank');
  };

  const handleEmail = (r: Report) => {
    const subjectStr = `Lab Report - ${r.orderNo}`;
    const bodyStr = `Dear ${r.patient},\n\nYour lab report for order ${r.orderNo} (${r.tests}) is ready.\n\nPlease collect from the lab.\n\nRegards,\n${signOff}`;
    if (!navigator.onLine) {
      queueOffline({ type: 'Email', patient: r.patient, contact: r.mobile || 'Email contact', subject: subjectStr, body: bodyStr });
      return;
    }
    window.open(`mailto:?subject=${encodeURIComponent(subjectStr)}&body=${encodeURIComponent(bodyStr)}`, '_self');
  };

  const selected = () => filteredReports.filter(r => selectedReportIds.includes(r.orderNo));

  const handleBulkDownload = async () => {
    const list = selected();
    if (list.length === 0) {
      setToast({ message: 'Please select at least one report to download', type: 'error' });
      return;
    }
    setBulkProcessing(true);
    try {
      await downloadReportPdf(list.map(r => r.orderId), `combined_reports_${new Date().toISOString().slice(0, 10)}.pdf`);
      setToast({ message: `${list.length} report(s) combined & downloaded`, type: 'success' });
      await fetchOrders();
    } catch (error: any) {
      setToast({ message: error.message || 'Failed to download reports', type: 'error' });
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkPrint = async () => {
    const list = selected();
    if (list.length === 0) {
      setToast({ message: 'Please select at least one report to print', type: 'error' });
      return;
    }
    if (!window.confirm(`Are you sure you want to print ${list.length} report(s)?`)) return;
    // Opened before the PDF is ready so it is not treated as a popup.
    const printWindow = window.open('', '_blank');
    printWindow?.document.write('<html><head><title>Loading Reports...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;background-color:#fafafa;"><div>Generating combined report PDF, please wait...</div></body></html>');
    setBulkProcessing(true);
    try {
      const url = await reportPdfUrl(list.map(r => r.orderId));
      if (printWindow) printWindow.location.href = url;
      else window.open(url, '_blank');
      setToast({ message: `${list.length} report(s) opened in a single print window`, type: 'success' });
      await fetchOrders();
    } catch (error: any) {
      if (printWindow) printWindow.document.body.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Failed to generate PDF report. Please try again.</div>';
      setToast({ message: error.message || 'Failed to generate print PDF', type: 'error' });
    } finally {
      setBulkProcessing(false);
    }
  };

  return (
    <AppLayout title="Reports" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Reports' }]}>
      <div className="space-y-4 font-sans">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search reports..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 rounded-lg border bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex items-center gap-3">
            {filteredReports.length > 0 && (
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none text-muted-foreground hover:text-foreground mr-2">
                <input
                  type="checkbox"
                  checked={selectedReportIds.length === filteredReports.length && filteredReports.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-[18px] w-[18px] cursor-pointer bg-background"
                />
                <span>Select All ({selectedReportIds.length})</span>
              </label>
            )}
            <button onClick={handleBulkDownload} disabled={bulkProcessing} className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-accent disabled:opacity-50"><Download className="h-4 w-4" />Bulk Download</button>
            <button onClick={handleBulkPrint} disabled={bulkProcessing} className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-accent disabled:opacity-50"><Printer className="h-4 w-4" />Bulk Print</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"><p className="text-xs text-muted-foreground">Pending Approval</p><p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pendingApproval}</p></div>
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"><p className="text-xs text-muted-foreground">Approved</p><p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.approved}</p></div>
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"><p className="text-xs text-muted-foreground">Delivered</p><p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.delivered}</p></div>
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"><p className="text-xs text-muted-foreground">Amended</p><p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.amended}</p></div>
        </div>

        <div className="space-y-3">
          {filteredReports.length === 0 && (
            <div className="rounded-xl border bg-card p-8 shadow-sm text-center text-muted-foreground">
              {search ? <>No reports found matching &quot;{search}&quot;</> : 'No reports yet. Reports appear here once results are entered.'}
            </div>
          )}
          {filteredReports.map((r, i) => {
            const isSelected = selectedReportIds.includes(r.orderNo);
            return (
              <motion.div key={r.orderNo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}
                className={`rounded-xl border p-4 shadow-sm hover:shadow-md transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-950/20' : 'bg-card border-border'
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.orderNo}`}
                      checked={isSelected}
                      onChange={() => handleToggleSelect(r.orderNo)}
                      className="rounded border-border text-primary focus:ring-primary h-[18px] w-[18px] cursor-pointer bg-background"
                    />
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">{r.orderNo}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusStyles[r.status]}`}>{r.status}</span>
                        {r.amended && <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-950/50 dark:text-orange-400">AMENDED</span>}
                      </div>
                      <p className="text-sm font-medium text-foreground">{r.patient}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.tests} • {r.approvedBy} • {r.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.printed > 0 && <span className="text-xs text-muted-foreground mr-1">Printed {r.printed}x</span>}
                    {canApprove && r.status === 'VERIFIED' && (
                      <button onClick={() => handleApprove(r)} className="flex items-center gap-1.5 rounded-lg bg-yellow-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-yellow-700">
                        <CheckCircle className="h-4 w-4" />Approve
                      </button>
                    )}
                    <button onClick={() => setPreviewReport(r)} className="flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold hover:bg-accent"><Eye className="h-4 w-4" />Preview</button>
                    <button onClick={() => handlePrint(r)} className="flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold hover:bg-accent"><Printer className="h-4 w-4" />Print</button>
                    <button onClick={() => handleWhatsApp(r)} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-700"><MessageCircle className="h-4 w-4" />WhatsApp</button>
                    <button onClick={() => handleEmail(r)} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Mail className="h-4 w-4" />Email</button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {previewReport && (
        <ReportPreview orderId={previewReport.orderId} title={`${previewReport.patient} · ${previewReport.orderNo}`} onClose={() => setPreviewReport(null)}>
          {canApprove && previewReport.status === 'VERIFIED' && (
            <button onClick={async () => { if (await handleApprove(previewReport)) setPreviewReport(null); }} className="flex items-center gap-1.5 bg-yellow-600 px-5 py-2.5 text-sm font-bold rounded-xl text-white hover:bg-yellow-700 transition-colors">
              <CheckCircle className="h-4 w-4" />Approve
            </button>
          )}
          <button onClick={() => handlePrint(previewReport)} className="flex items-center gap-1.5 bg-primary px-5 py-2.5 text-sm font-bold rounded-xl text-primary-foreground hover:bg-primary/90 transition-colors">
            <Download className="h-4 w-4" />Download PDF
          </button>
          <button onClick={() => handleWhatsApp(previewReport)} className="flex items-center gap-1.5 bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 rounded-lg transition-colors">
            <MessageCircle className="h-4 w-4" />WhatsApp
          </button>
          <button onClick={() => handleEmail(previewReport)} className="flex items-center gap-1.5 bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 rounded-lg transition-colors">
            <Mail className="h-4 w-4" />Email
          </button>
        </ReportPreview>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-global z-[200] ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-auto pl-2 hover:opacity-70"><XIcon className="h-4 w-4" /></button>
        </div>
      )}
    </AppLayout>
  );
}
