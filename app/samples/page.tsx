"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { Search, FlaskConical, CheckCircle, XCircle, Clock, AlertTriangle, Printer, QrCode, X, RotateCcw } from 'lucide-react';
import { db } from '@/lib/db';
import { useLive } from '@/components/kit';

// Samples are the lab's real orders: collecting or rejecting one is saved on the order (on this PC).
interface Sample {
  id: number;
  orderStatus: string;
  orderNo: string;
  patient: string;
  patientId: string;
  tests: string[];
  container: string;
  priority: string;
  status: string;
  time: string;
  rejectionReason?: string;
  collectedAt?: string;
  collectedToday?: boolean;
}

const REJECT_PREFIX = 'Sample rejected: ';
const clock = (d: string | Date) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const isToday = (d?: string | Date | null) => !!d && new Date(d).toDateString() === new Date().toDateString();

function toSample(o: any): Sample {
  return {
    id: o.id,
    orderStatus: o.status,
    orderNo: o.orderNo,
    patient: o.patient?.name || '—',
    patientId: o.patientId,
    tests: (o.items || []).map((i: any) => i.test?.shortName || i.test?.name).filter(Boolean),
    container: Array.from(new Set((o.items || []).map((i: any) => i.test?.container).filter(Boolean))).join(', ') || '—',
    priority: o.priority || 'ROUTINE',
    status: o.status === 'REJECTED' ? 'REJECTED' : o.collectedAt ? 'COLLECTED' : 'PENDING',
    time: clock(o.createdAt),
    rejectionReason: o.note?.startsWith(REJECT_PREFIX) ? o.note.slice(REJECT_PREFIX.length) : undefined,
    collectedAt: o.collectedAt ? clock(o.collectedAt) : undefined,
    collectedToday: isToday(o.collectedAt),
  };
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  PENDING: { icon: Clock, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-950/50' },
  COLLECTED: { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-950/50' },
  REJECTED: { icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-950/50' },
};

const priorityConfig: Record<string, string> = {
  ROUTINE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  URGENT: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  EMERGENCY: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 animate-pulse',
};

const REJECTION_REASONS = [
  'Hemolyzed sample',
  'Clotted sample',
  'Insufficient quantity',
  'Wrong container',
  'Unlabeled sample',
  'Patient ID mismatch',
  'Lipemic sample',
  'Expired container',
  'Other',
];

export default function SamplesPage() {
  const [samples, setSamples] = useState<Sample[]>([]);

  // Last 3 days plus anything still waiting for collection.
  const loadSamples = () => {
    const since = new Date(Date.now() - 3 * 864e5);
    return db.query('testOrder', 'findMany', {
      where: { OR: [{ createdAt: { gte: since } }, { collectedAt: null, status: { in: ['PENDING', 'REJECTED'] } }] },
      include: { patient: true, items: { include: { test: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }).then((orders: any[]) => setSamples(orders.map(toSample))).catch((err: any) => setToast({ message: err.message, type: 'error' }));
  };
  useLive(loadSamples, ['testOrder', 'patient']);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectOrderNo, setRejectOrderNo] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const filtered = samples.filter(s => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || s.patient.toLowerCase().includes(q) || s.orderNo.toLowerCase().includes(q) || s.patientId.toLowerCase().includes(q);
    const matchFilter = filter === 'ALL' || s.status === filter;
    return matchSearch && matchFilter;
  });

  // Compute stats from state
  const pendingCount = samples.filter(s => s.status === 'PENDING').length;
  const collectedCount = samples.filter(s => s.status === 'COLLECTED' && s.collectedToday).length;
  const rejectedCount = samples.filter(s => s.status === 'REJECTED').length;

  // Collect: stamp the collection time; the order number becomes the tube barcode analyzers read.
  const handleCollect = useCallback(async (orderNo: string) => {
    const sample = samples.find(x => x.orderNo === orderNo);
    if (!sample) return;
    try {
      await db.query('testOrder', 'update', {
        where: { id: sample.id },
        data: {
          collectedAt: new Date(),
          barcodeData: orderNo,
          ...(['PENDING', 'REJECTED'].includes(sample.orderStatus) ? { status: 'COLLECTED', note: null } : {}),
        },
      });
      setToast({ message: `Sample ${orderNo} collected`, type: 'success' });
      loadSamples();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples]);

  // Open reject modal
  const openRejectModal = useCallback((orderNo: string) => {
    setRejectOrderNo(orderNo);
    setRejectionReason('');
    setCustomReason('');
    setShowRejectModal(true);
  }, []);

  // Submit rejection
  const submitRejection = useCallback(async () => {
    const finalReason = rejectionReason === 'Other' ? customReason : rejectionReason;
    if (!finalReason.trim()) {
      setToast({ message: 'Please select or enter a rejection reason', type: 'error' });
      return;
    }
    const sample = samples.find(x => x.orderNo === rejectOrderNo);
    if (!sample) return;
    try {
      await db.query('testOrder', 'update', { where: { id: sample.id }, data: { status: 'REJECTED', collectedAt: null, note: `${REJECT_PREFIX}${finalReason}` } });
      loadSamples();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
      return;
    }
    setShowRejectModal(false);
    setToast({ message: `Sample ${rejectOrderNo} rejected — ${finalReason}`, type: 'success' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejectOrderNo, rejectionReason, customReason, samples]);

  // Print Label handler — generates a small PDF label using pdf-lib
  const handlePrintLabel = useCallback(async (sample: Sample) => {
    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

      // Create a small label: 4" x 2" (288 x 144 points)
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([288, 144]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Header
      page.drawText('LAB SAMPLE LABEL', { x: 10, y: 126, size: 9, font: fontBold, color: rgb(0, 0, 0) });

      // Order No
      page.drawText(`Order: ${sample.orderNo}`, { x: 10, y: 112, size: 8, font: fontBold, color: rgb(0, 0, 0) });

      // Patient
      page.drawText(`Patient: ${sample.patient.replace(/[^\x20-\xFF]/g, '?')}`, { x: 10, y: 98, size: 7, font, color: rgb(0, 0, 0) });
      page.drawText(`ID: ${sample.patientId}`, { x: 10, y: 86, size: 7, font, color: rgb(0, 0, 0) });

      // Tests
      page.drawText(`Tests: ${sample.tests.join(', ')}`, { x: 10, y: 74, size: 7, font, color: rgb(0, 0, 0) });

      // Container
      page.drawText(`Container: ${sample.container}`, { x: 10, y: 62, size: 6.5, font, color: rgb(0, 0, 0) });

      // Collection time
      const collTime = sample.collectedAt || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      page.drawText(`Time: ${collTime}`, { x: 10, y: 50, size: 6.5, font, color: rgb(0, 0, 0) });

      // Priority badge
      if (sample.priority === 'URGENT' || sample.priority === 'EMERGENCY') {
        page.drawText(`!! ${sample.priority}`, { x: 200, y: 126, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
      }

      // Scannable Code 128 barcode of the order number
      const res = await fetch('/api/barcode/png', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: sample.orderNo }) });
      if (!res.ok) throw new Error('Barcode could not be generated');
      const barcode = await pdfDoc.embedPng(new Uint8Array(await res.arrayBuffer()));
      page.drawImage(barcode, { x: 10, y: 8, width: 268, height: 36 });

      // Save and download (opens with the PC's PDF viewer / label printer driver)
      const pdfBytes = await pdfDoc.save();
      const url = URL.createObjectURL(new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `label-${sample.orderNo}.pdf`;
      a.click();
      setToast({ message: `Label PDF generated for ${sample.orderNo}`, type: 'success' });
    } catch (err) {
      console.error('Label generation error:', err);
      setToast({ message: 'Failed to generate label PDF', type: 'error' });
    }
  }, []);

  return (
    <AppLayout title="Sample Collection" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Samples' }]}>
      <div className="space-y-6">
        {/* Top Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Scan barcode or search..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 rounded-xl border bg-background pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary" 
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['ALL', 'PENDING', 'COLLECTED', 'REJECTED'].map((f) => (
              <button 
                key={f} 
                onClick={() => setFilter(f)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  filter === f 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'border bg-card hover:bg-accent text-foreground'
                }`}
              >
                {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pending Collection</p>
            <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">{pendingCount}</p>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Collected Today</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{collectedCount}</p>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rejected</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{rejectedCount}</p>
          </div>
        </div>

        {/* Samples List */}
        <div className="space-y-3">
          {filtered.map((s, i) => {
            const sc = statusConfig[s.status] || statusConfig.PENDING;
            const StatusIcon = sc.icon;
            return (
              <motion.div 
                key={s.orderNo} 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${sc.bg}`}>
                      <StatusIcon className={`h-5 w-5 ${sc.color}`} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-primary">{s.orderNo}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${priorityConfig[s.priority]}`}>
                          {s.priority}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {s.patient} <span className="text-xs font-normal text-muted-foreground">({s.patientId})</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>Tests: <span className="text-foreground font-medium">{s.tests.join(', ')}</span></span>
                        <span className="hidden sm:inline">•</span>
                        <span>Container: <span className="text-foreground font-medium">{s.container}</span></span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between lg:justify-end gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-border/50">
                    <span className="text-xs text-muted-foreground font-medium">{s.time}</span>
                    <div className="flex items-center gap-2">
                      {s.status === 'PENDING' && (
                        <>
                          <button 
                            onClick={() => handlePrintLabel(s)} 
                            className="flex items-center gap-1 rounded-lg border px-3.5 py-2 text-xs font-semibold hover:bg-accent transition-colors"
                          >
                            <Printer className="h-4 w-4" />Print Label
                          </button>
                          <button 
                            onClick={() => handleCollect(s.orderNo)} 
                            className="flex items-center gap-1 rounded-lg bg-green-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
                          >
                            <CheckCircle className="h-4 w-4" />Collect
                          </button>
                          <button 
                            onClick={() => openRejectModal(s.orderNo)} 
                            className="flex items-center gap-1 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                          >
                            <XCircle className="h-4 w-4" />Reject
                          </button>
                        </>
                      )}
                      {s.status === 'COLLECTED' && (
                        <>
                          <button onClick={() => handlePrintLabel(s)} className="flex items-center gap-1 rounded-lg border px-3.5 py-2 text-xs font-semibold hover:bg-accent transition-colors">
                            <Printer className="h-4 w-4" />Label
                          </button>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sc.bg} ${sc.color}`} title={`Collected ${s.collectedAt || ''}`}>
                            ✓ Collected {s.collectedAt}
                          </span>
                        </>
                      )}
                      {s.status === 'REJECTED' && (
                        <>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sc.bg} ${sc.color}`} title={s.rejectionReason}>
                            ✗ Rejected{s.rejectionReason ? `: ${s.rejectionReason}` : ''}
                          </span>
                          <button onClick={() => handleCollect(s.orderNo)} className="flex items-center gap-1 rounded-lg bg-green-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-700 transition-colors">
                            <RotateCcw className="h-4 w-4" />Re-collect
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              No samples found matching your search or filter.
            </div>
          )}
        </div>
      </div>

      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRejectModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl relative animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Reject Sample</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Order: <span className="font-mono font-semibold text-primary">{rejectOrderNo}</span></p>
              </div>
              <button 
                onClick={() => setShowRejectModal(false)} 
                className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Rejection Reason</label>
            <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto pr-1">
              {REJECTION_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-3 py-2 px-2.5 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="rejectionReason"
                    value={reason}
                    checked={rejectionReason === reason}
                    onChange={() => setRejectionReason(reason)}
                    className="h-5 w-5 cursor-pointer accent-primary text-primary focus:ring-primary border-muted"
                  />
                  <span className="text-sm font-medium text-foreground">{reason}</span>
                </label>
              ))}
            </div>

            {rejectionReason === 'Other' && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Custom Reason</label>
                <input
                  type="text"
                  placeholder="Enter custom reason..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full rounded-xl border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setShowRejectModal(false)} 
                className="px-5 py-2.5 font-bold rounded-xl border text-sm hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={submitRejection} 
                className="px-5 py-2.5 font-bold rounded-xl bg-red-600 text-white text-sm hover:bg-red-700 transition-colors"
              >
                Reject Sample
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'} z-[200]`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{toast.message}</span>
        </div>
      )}
    </AppLayout>
  );
}
