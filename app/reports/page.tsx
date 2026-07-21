"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { FileText, Printer, MessageCircle, Mail, Download, Eye, CheckCircle, Search, XIcon } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateReportPDF, getMockReportData, buildReportDataFromDb, generateCombinedReportsPDF } from '@/lib/report-pdf';
import { db } from '@/lib/db';

interface Report {
  orderNo: string;
  patient: string;
  mobile: string;
  tests: string;
  status: string;
  approvedBy: string;
  date: string;
  printed: number;
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

  const canApprove = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN' || currentUser?.role === 'PATHOLOGIST';

  const [search, setSearch] = useState('');

  const [reports, setReports] = useState<Report[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [labSettings, setLabSettings] = useState<any>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setSelectedReportIds([]);
      
      // Load lab profile settings
      const settings = await db.query('labSettings', 'findFirst', { where: { id: 1 } });
      let mergedSettings = settings || {};
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('pathology_lab_general_settings');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            mergedSettings = { ...mergedSettings, ...parsed };
          } catch (e) {
            console.error('Failed to parse general settings', e);
          }
        }
      }
      setLabSettings(mergedSettings);

      const dbOrders = await db.query('testOrder', 'findMany', {
        where: {
          status: { in: ['RESULT_ENTERED', 'APPROVED', 'DELIVERED'] }
        },
        include: {
          patient: {
            include: {
              doctor: true
            }
          },
          items: {
            include: {
              test: {
                include: {
                  parameters: {
                    include: { refRanges: true }
                  }
                }
              },
              results: true
            }
          },
          report: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      setOrders(dbOrders || []);
      
      const mapped: Report[] = (dbOrders || []).map((order: any) => ({
        orderNo: order.orderNo,
        patient: order.patient?.name || 'Unknown',
        patientId: order.patientId || '',
        mobile: order.patient?.mobile || '',
        tests: (order.items || []).map((item: any) => item.test?.shortName || item.test?.name).join(', '),
        status: order.status === 'RESULT_ENTERED' ? 'VERIFIED' : order.status,
        approvedBy: order.status === 'APPROVED' || order.status === 'DELIVERED' ? (mergedSettings?.pathologyDoctorName || mergedSettings?.doctorName || 'Dr. Anjali Verma') : 'Draft Report',

        date: new Date(order.createdAt).toLocaleDateString('en-GB'),
        printed: order.report?.printCount || 0,
      }));
      
      setReports(mapped);
    } catch (error) {
      console.error('Failed to load reports from database', error);
      setToast({ message: 'Failed to load reports', type: 'error' });
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (typeof window !== 'undefined' && orders.length > 0 && reports.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const orderIdStr = params.get('orderId');
      if (orderIdStr) {
        const orderId = parseInt(orderIdStr, 10);
        if (!isNaN(orderId)) {
          const order = orders.find(o => o.id === orderId);
          if (order) {
            const r = reports.find(rep => rep.orderNo === order.orderNo);
            if (r) {
              setPreviewReport(r);
            }
          }
        }
      }
    }
  }, [orders, reports]);

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
          r.approvedBy.toLowerCase().includes(q) ||
          r.date.toLowerCase().includes(q)
        );
      });

      // Prioritize prefix and word-start matches on patient name, mobile or order number
      matched = [...matched].sort((a, b) => {
        const nameA = a.patient.toLowerCase();
        const nameB = b.patient.toLowerCase();
        const mobileA = a.mobile;
        const mobileB = b.mobile;
        const orderNoA = a.orderNo.toLowerCase();
        const orderNoB = b.orderNo.toLowerCase();

        const aStarts = nameA.startsWith(q) || mobileA.startsWith(q) || orderNoA.startsWith(q);
        const bStarts = nameB.startsWith(q) || mobileB.startsWith(q) || orderNoB.startsWith(q);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aWordStarts = nameA.split(/\s+/).some(w => w.startsWith(q));
        const bWordStarts = nameB.split(/\s+/).some(w => w.startsWith(q));

        if (aWordStarts && !bWordStarts) return -1;
        if (!aWordStarts && bWordStarts) return 1;

        return 0;
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
    if (checked) {
      setSelectedReportIds(filteredReports.map(r => r.orderNo));
    } else {
      setSelectedReportIds([]);
    }
  };

  // Computed stats from state
  const stats = {
    pendingApproval: reports.filter((r) => r.status === 'VERIFIED').length,
    approvedToday: reports.filter((r) => r.status === 'APPROVED').length,
    delivered: reports.filter((r) => r.status === 'DELIVERED').length,
    amended: 0,
  };

  // Build report input for fallback
  const buildReportInput = (r: Report) => ({
    orderNo: r.orderNo,
    patientName: r.patient,
    patientId: r.patientId,
    tests: r.tests,
    date: r.date,
    approvedBy: r.approvedBy,
  });

  const handleApprove = async (r: Report) => {
    try {
      const order = orders.find(o => o.orderNo === r.orderNo);
      if (!order) return;
      
      await db.query('testOrder', 'update', {
        where: { id: order.id },
        data: { status: 'APPROVED' }
      });
      
      const reportRecord = await db.query('report', 'findFirst', {
        where: { orderId: order.id }
      });
      
      if (reportRecord) {
        await db.query('report', 'update', {
          where: { id: reportRecord.id },
          data: {
            approvedBy: currentUser?.id || 1,
            approvedAt: new Date().toISOString()
          }
        });
      } else {
        await db.query('report', 'create', {
          data: {
            orderId: order.id,
            approvedBy: currentUser?.id || 1,
            approvedAt: new Date().toISOString(),
            printCount: 0
          }
        });
      }

      
      setToast({ message: `Report approved for ${r.patient}`, type: 'success' });
      await fetchOrders();
    } catch (error) {
      console.error('Failed to approve report', error);
      setToast({ message: 'Failed to approve report', type: 'error' });
    }
  };

  // Generate and download PDF for a single report
  const handlePrint = useCallback(async (r: Report) => {
    try {
      const order = orders.find(o => o.orderNo === r.orderNo);
      if (!order) {
        setToast({ message: 'Order not found', type: 'error' });
        return;
      }
      const reportData = buildReportDataFromDb(order, labSettings);
      const pdfBytes = await generateReportPDF(reportData);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${r.orderNo}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Increment printed count in DB
      const reportRecord = await db.query('report', 'findFirst', {
        where: { orderId: order.id }
      });
      if (reportRecord) {
        await db.query('report', 'update', {
          where: { id: reportRecord.id },
          data: { printCount: (reportRecord.printCount || 0) + 1 }
        });
      } else {
        await db.query('report', 'create', {
          data: {
            orderId: order.id,
            printCount: 1
          }
        });
      }

      setToast({ message: `PDF downloaded for ${r.orderNo}`, type: 'success' });
      await fetchOrders();
    } catch (error) {
      console.error(error);
      setToast({ message: 'Failed to generate PDF', type: 'error' });
    }
  }, [orders, fetchOrders]);

  // Preview handler
  const handlePreview = (r: Report) => {
    setPreviewReport(r);
  };

  // WhatsApp handler
  const handleWhatsApp = async (r: Report) => {
    let textStr = `Dear ${r.patient},\n\nYour lab report for order ${r.orderNo} (${r.tests}) is ready.\n\nRegards,\n${labSettings?.labName || 'Diagnostic Centre'}`;
    
    if (typeof window !== 'undefined' && window.navigator.onLine) {
      try {
        const order = orders.find(o => o.orderNo === r.orderNo);
        if (order) {
          const reportData = buildReportDataFromDb(order, labSettings);
          const qrResponse = await fetch('/api/reports/qrcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...reportData, getUrlOnly: true }),
          });
          if (qrResponse.ok) {
            const resData = await qrResponse.json();
            if (resData.success && resData.verifyUrl) {
              textStr = `Dear ${r.patient},\n\nYour lab report for order ${r.orderNo} (${r.tests}) is ready.\n\nYou can view and verify your report online here:\n${resData.verifyUrl}\n\nRegards,\n${labSettings?.labName || 'Diagnostic Centre'}`;
            }
          }
        }
      } catch (e) {
        console.error('Failed to pre-fetch WhatsApp verifyUrl:', e);
      }
    }

    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      // Offline mode: Queue alert
      const queueStr = localStorage.getItem('pathology_lab_outbox_queue') || '[]';
      try {
        const queue = JSON.parse(queueStr);
        queue.push({
          id: Date.now() + Math.random().toString(),
          type: 'WhatsApp',
          patient: r.patient,
          contact: r.mobile || 'WhatsApp contact',
          text: textStr,
          date: new Date().toISOString()
        });
        localStorage.setItem('pathology_lab_outbox_queue', JSON.stringify(queue));
        
        // Add sync log
        const syncLogs = JSON.parse(localStorage.getItem('pathology_lab_sync_logs') || '[]');
        syncLogs.unshift({
          id: Date.now() + Math.random().toString(),
          timestamp: new Date().toISOString(),
          message: `[Offline Mode] Queued WhatsApp alert for patient: ${r.patient}`
        });
        localStorage.setItem('pathology_lab_sync_logs', JSON.stringify(syncLogs));
        
        window.dispatchEvent(new Event('storage'));
        setToast({ message: `No WiFi connection. WhatsApp alert for ${r.patient} has been queued in Outbox.`, type: 'success' });
      } catch (e) {
        console.error(e);
      }
    } else {
      // Online mode: Send immediately
      const phone = r.mobile ? r.mobile.replace(/[^0-9]/g, '') : '';
      const formattedPhone = phone.length === 10 ? '91' + phone : phone;
      const text = encodeURIComponent(textStr);
      window.open(`https://wa.me/${formattedPhone}?text=${text}`, '_blank');
    }
  };

  // Email handler
  const handleEmail = (r: Report) => {
    const subjectStr = `Lab Report - ${r.orderNo}`;
    const bodyStr = `Dear ${r.patient},\n\nYour lab report for order ${r.orderNo} (${r.tests}) is ready.\n\nPlease collect from the lab.\n\nRegards,\nJharLab`;
    
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      // Offline mode: Queue alert
      const queueStr = localStorage.getItem('pathology_lab_outbox_queue') || '[]';
      try {
        const queue = JSON.parse(queueStr);
        queue.push({
          id: Date.now() + Math.random().toString(),
          type: 'Email',
          patient: r.patient,
          contact: r.mobile || 'Email contact',
          subject: subjectStr,
          body: bodyStr,
          date: new Date().toISOString()
        });
        localStorage.setItem('pathology_lab_outbox_queue', JSON.stringify(queue));
        
        // Add sync log
        const syncLogs = JSON.parse(localStorage.getItem('pathology_lab_sync_logs') || '[]');
        syncLogs.unshift({
          id: Date.now() + Math.random().toString(),
          timestamp: new Date().toISOString(),
          message: `[Offline Mode] Queued Email alert for patient: ${r.patient}`
        });
        localStorage.setItem('pathology_lab_sync_logs', JSON.stringify(syncLogs));
        
        window.dispatchEvent(new Event('storage'));
        setToast({ message: `No WiFi connection. Email alert for ${r.patient} has been queued in Outbox.`, type: 'success' });
      } catch (e) {
        console.error(e);
      }
    } else {
      // Online mode: Send immediately
      const subject = encodeURIComponent(subjectStr);
      const body = encodeURIComponent(bodyStr);
      window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
    }
  };

  // Bulk Download
  const handleBulkDownload = async () => {
    const selectedReports = filteredReports.filter(r => selectedReportIds.includes(r.orderNo));
    if (selectedReports.length === 0) {
      setToast({ message: 'Please select at least one report to download', type: 'error' });
      return;
    }
    setBulkProcessing(true);
    setToast({ message: `Generating combined PDF for ${selectedReports.length} report(s)...`, type: 'success' });
    try {
      const reportsDataToCombine = [];
      for (const r of selectedReports) {
        const order = orders.find(o => o.orderNo === r.orderNo);
        if (!order) continue;
        const reportData = buildReportDataFromDb(order, labSettings);
        reportsDataToCombine.push(reportData);
        
        // Update printed count in DB
        const reportRecord = await db.query('report', 'findFirst', {
          where: { orderId: order.id }
        });
        if (reportRecord) {
          await db.query('report', 'update', {
            where: { id: reportRecord.id },
            data: { printCount: (reportRecord.printCount || 0) + 1 }
          });
        } else {
          await db.query('report', 'create', {
            data: {
              orderId: order.id,
              printCount: 1
            }
          });
        }
      }
      
      if (reportsDataToCombine.length > 0) {
        const pdfBytes = await generateCombinedReportsPDF(reportsDataToCombine);
        const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `combined_reports_${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setToast({ message: `${selectedReports.length} report(s) combined & downloaded`, type: 'success' });
      } else {
        setToast({ message: 'Failed to generate PDF: No data found', type: 'error' });
      }
      await fetchOrders();
    } catch (error) {
      console.error(error);
      setToast({ message: 'Failed to download reports', type: 'error' });
    } finally {
      setBulkProcessing(false);
    }
  };

  // Bulk Print
  const handleBulkPrint = async () => {
    const selectedReports = filteredReports.filter(r => selectedReportIds.includes(r.orderNo));
    if (selectedReports.length === 0) {
      setToast({ message: 'Please select at least one report to print', type: 'error' });
      return;
    }
    const confirmed = window.confirm(`Are you sure you want to print ${selectedReports.length} report(s)?`);
    if (!confirmed) return;

    // Open print window synchronously to prevent popup blocker
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Loading Reports...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;background-color:#fafafa;"><div>Generating combined report PDF, please wait...</div></body></html>');
    }

    setBulkProcessing(true);
    setToast({ message: `Generating combined PDF for ${selectedReports.length} report(s) for print...`, type: 'success' });
    try {
      const reportsDataToCombine = [];
      for (const r of selectedReports) {
        const order = orders.find(o => o.orderNo === r.orderNo);
        if (!order) continue;
        const reportData = buildReportDataFromDb(order, labSettings);
        reportsDataToCombine.push(reportData);
        
        // Update printed count in DB
        const reportRecord = await db.query('report', 'findFirst', {
          where: { orderId: order.id }
        });
        if (reportRecord) {
          await db.query('report', 'update', {
            where: { id: reportRecord.id },
            data: { printCount: (reportRecord.printCount || 0) + 1 }
          });
        } else {
          await db.query('report', 'create', {
            data: {
              orderId: order.id,
              printCount: 1
            }
          });
        }
      }
      
      if (reportsDataToCombine.length > 0) {
        const pdfBytes = await generateCombinedReportsPDF(reportsDataToCombine);
        const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        if (printWindow) {
          printWindow.location.href = url;
        } else {
          window.open(url, '_blank');
        }
        setToast({ message: `${selectedReports.length} report(s) opened in a single print window`, type: 'success' });
      } else {
        if (printWindow) printWindow.close();
        setToast({ message: 'Failed to generate PDF: No data found', type: 'error' });
      }
      await fetchOrders();
    } catch (error) {
      console.error(error);
      if (printWindow) {
        printWindow.document.body.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Failed to generate PDF report. Please try again.</div>';
      }
      setToast({ message: 'Failed to generate print PDF', type: 'error' });
    } finally {
      setBulkProcessing(false);
    }
  };

  // Get report data for preview
  const getPreviewData = (r: Report) => {
    const order = orders.find(o => o.orderNo === r.orderNo);
    if (!order) return getMockReportData(buildReportInput(r));
    return buildReportDataFromDb(order, labSettings);
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
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"><p className="text-xs text-muted-foreground">Approved Today</p><p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.approvedToday}</p></div>
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"><p className="text-xs text-muted-foreground">Delivered</p><p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.delivered}</p></div>
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"><p className="text-xs text-muted-foreground">Amended</p><p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.amended}</p></div>
        </div>

        <div className="space-y-3">
          {filteredReports.length === 0 && (
            <div className="rounded-xl border bg-card p-8 shadow-sm text-center text-muted-foreground">
              No reports found matching &quot;{search}&quot;
            </div>
          )}
          {filteredReports.map((r, i) => {
            const isSelected = selectedReportIds.includes(r.orderNo);
            return (
              <motion.div key={r.orderNo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={`rounded-xl border p-4 shadow-sm hover:shadow-md transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-950/20' : 'bg-card border-border'
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(r.orderNo)}
                      className="rounded border-border text-primary focus:ring-primary h-[18px] w-[18px] cursor-pointer bg-background"
                    />
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">{r.orderNo}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusStyles[r.status]}`}>{r.status}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{r.patient}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.tests} • Approved by: {r.approvedBy} • {r.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.printed > 0 && <span className="text-xs text-muted-foreground mr-1">Printed {r.printed}x</span>}
                    {canApprove && r.status === 'VERIFIED' && (
                      <button onClick={() => handleApprove(r)} className="flex items-center gap-1.5 rounded-lg bg-yellow-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-yellow-700">
                        <CheckCircle className="h-4 w-4" />Approve
                      </button>
                    )}

                    <button onClick={() => handlePreview(r)} className="flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold hover:bg-accent"><Eye className="h-4 w-4" />Preview</button>
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

      {/* Preview Modal */}
      {previewReport && (() => {
        const data = getPreviewData(previewReport);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setPreviewReport(null)}>
            <div className="bg-card border rounded-xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground">Report Preview</h2>
                <button onClick={() => setPreviewReport(null)} className="rounded-lg p-1 hover:bg-accent text-muted-foreground hover:text-foreground">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Lab Header */}
              <div className="rounded-lg bg-primary/10 p-4 mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {data.printShowLogo && data.logo && (
                    <div className="h-16 w-16 bg-white rounded-lg p-1 border flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                      <img src={data.logo} className="h-full w-full object-contain" alt="Lab Logo" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-base font-bold text-primary">{data.labName.toUpperCase()}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{data.labAddress}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1 font-medium">
                      {data.labMobile && <span>Phone: {data.labMobile}</span>}
                      {data.labEmail && <span>Email: {data.labEmail}</span>}
                      {data.labWebsite && <span>Web: {data.labWebsite}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5 font-medium">
                      {data.gstNumber && <span>GSTIN: {data.gstNumber}</span>}
                      {data.registrationNo && <span>Reg No: {data.registrationNo}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex rounded-full bg-primary/20 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider">
                    Pathology Report
                  </span>
                </div>
              </div>

              {/* Patient Info */}
              <div className="rounded-lg border p-4 mb-4 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Patient Name:</span> <span className="font-semibold">{data.patientName}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Order No:</span> <span className="font-semibold font-mono">{data.orderNo}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Patient ID:</span> <span className="font-semibold">{data.patientId}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Date:</span> <span className="font-semibold">{data.date}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Age / Gender:</span> <span className="font-semibold">{data.age} / {data.gender}</span></div>
                <div><span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Referred By:</span> <span className="font-semibold">{data.referredBy}</span></div>
              </div>

              {/* Test Results */}
              {data.tests.map((test, ti) => (
                <div key={ti} className="mb-4">
                  <div className="rounded-t-lg bg-primary px-3 py-2">
                    <h4 className="text-sm font-bold text-primary-foreground">{test.testName}</h4>
                  </div>
                  <div className="border border-t-0 rounded-b-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Parameter</th>
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Result</th>
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Unit</th>
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {test.parameters.map((p, pi) => (
                          <tr key={pi} className={p.isHeader ? 'bg-muted/30' : 'border-t border-border/50'}>
                            <td className={`px-3 py-1.5 ${p.isHeader ? 'font-bold' : ''}`}>{p.name}</td>
                            {p.isHeader ? (
                              <td colSpan={3}></td>
                            ) : (
                              <>
                                <td className={`px-3 py-1.5 font-semibold ${p.flag === '↑' || p.flag === 'H' ? 'text-orange-600 dark:text-orange-400' : p.flag === '↓' || p.flag === 'L' ? 'text-blue-600 dark:text-blue-400' : p.flag === '!!' ? 'text-red-600 dark:text-red-400' : ''}`}>
                                  {p.value}{p.flag ? ` ${p.flag === '↑' ? 'H' : p.flag === '↓' ? 'L' : p.flag}` : ''}
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground">{p.unit}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{p.refRange}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Footer */}
              <div className="border-t pt-3 mt-2 flex items-center justify-between text-xs text-muted-foreground font-sans">
                <p className="italic">This is a computer-generated report. Results should be correlated clinically.</p>
                <div className="text-right">
                  {data.approvedBy !== 'Draft Report (Pending Approval)' ? (
                    <>
                      <p className="font-bold text-foreground text-sm">{data.approvedBy}</p>
                      <p className="italic text-xs">{data.doctorQualification || 'Pathologist'}</p>
                      {data.doctorRegNo && <p className="text-[10px] text-muted-foreground mt-0.5">Reg No: {data.doctorRegNo}</p>}
                    </>
                  ) : (
                    <p className="text-red-500 font-bold italic">{data.approvedBy}</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4 pt-3 border-t">
                {previewReport.status === 'VERIFIED' && (
                  <button onClick={() => { handleApprove(previewReport); setPreviewReport(null); }} className="flex items-center gap-1.5 bg-yellow-600 px-5 py-2.5 text-sm font-bold rounded-xl text-white hover:bg-yellow-700 transition-colors">
                    <CheckCircle className="h-4 w-4" />Approve
                  </button>
                )}
                <button onClick={() => { handlePrint(previewReport); }} className="flex items-center gap-1.5 bg-primary px-5 py-2.5 text-sm font-bold rounded-xl text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Printer className="h-4 w-4" />Print PDF
                </button>
                <button onClick={() => handleWhatsApp(previewReport)} className="flex items-center gap-1.5 bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 rounded-lg transition-colors">
                  <MessageCircle className="h-4 w-4" />WhatsApp
                </button>
                <button onClick={() => handleEmail(previewReport)} className="flex items-center gap-1.5 bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 rounded-lg transition-colors">
                  <Mail className="h-4 w-4" />Email
                </button>
                <button onClick={() => setPreviewReport(null)} className="ml-auto border px-5 py-2.5 text-sm font-bold rounded-xl hover:bg-accent text-foreground transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
