"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, Filter, Download, Eye, Printer, CreditCard, Receipt, ArrowUpDown, XIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/shared/constants';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db } from '@/lib/db';
import { useRouter } from 'next/navigation';

interface Bill {
  id?: number;
  billNo: string;
  patient: string;
  patientId: string;
  mobile?: string;
  tests: string;
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  paid: number;
  due: number;
  method: string;
  status: string;
  date: string;
}

const initialBills: Bill[] = [];

const paymentStatusStyles: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  PARTIAL: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  UNPAID: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  REFUNDED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function getTodayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function BillingPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [bills, setBills] = useState<Bill[]>(initialBills);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [sortField, setSortField] = useState<keyof Bill | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const requestSort = (field: keyof Bill) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortField === field && sortDirection === 'asc') {
      direction = 'desc';
    }
    setSortField(field);
    setSortDirection(direction);
  };

  const SortHeader = ({ field, label }: { field: keyof Bill; label: string }) => {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => requestSort(field)}
        className="flex items-center gap-1 hover:text-foreground font-semibold transition-colors focus:outline-none"
      >
        <span>{label}</span>
        {isActive ? (
          sortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-80" />
        )}
      </button>
    );
  };

  // Modals
  const [showNewBill, setShowNewBill] = useState(false);
  const [showViewBill, setShowViewBill] = useState<Bill | null>(null);
  const [showCollect, setShowCollect] = useState<Bill | null>(null);
  const [showDayClose, setShowDayClose] = useState(false);

  // New bill form state
  const [newPatient, setNewPatient] = useState('');
  const [newPatientId, setNewPatientId] = useState('');
  const [newTests, setNewTests] = useState('');
  const [newSubtotal, setNewSubtotal] = useState<number>(0);
  const [newDiscountPct, setNewDiscountPct] = useState<number>(0);
  const [newMethod, setNewMethod] = useState('Cash');
  const [newAmountPaid, setNewAmountPaid] = useState<number>(0);

  // Collect payment form
  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [collectMethod, setCollectMethod] = useState('Cash');

  const fetchBills = async () => {
    try {
      const dbBills = await db.query('bill', 'findMany', {
        include: {
          patient: true,
          orders: {
            include: {
              items: {
                include: {
                  test: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      if (dbBills) {
        const mappedBills = dbBills.map((b: any) => {
          const testNames = b.orders?.flatMap((o: any) => 
            o.items?.map((item: any) => item.test?.shortName || item.test?.name || '')
          ).filter(Boolean).join(', ') || 'No tests';

          const dateObj = new Date(b.createdAt);
          const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

          return {
            id: b.id,
            billNo: b.billNo,
            patient: b.patient?.name || 'Unknown',
            patientId: b.patientId,
            mobile: b.patient?.mobile || '',
            tests: testNames,
            subtotal: b.subtotal,
            discount: b.discountAmount || 0,
            gst: b.gstAmount || 0,
            total: b.totalAmount,
            paid: b.paidAmount,
            due: b.dueAmount,
            method: b.paymentMethod ? (b.paymentMethod.charAt(0) + b.paymentMethod.slice(1).toLowerCase()) : 'Cash',
            status: b.paymentStatus || 'UNPAID',
            date: formattedDate,
          };
        });
        setBills(mappedBills);
      }
    } catch (err) {
      console.error('Error loading bills:', err);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Auto-calculated fields for new bill
  const newDiscount = Math.round(newSubtotal * newDiscountPct / 100);
  const newAfterDiscount = newSubtotal - newDiscount;
  const newGst = Math.round(newAfterDiscount * 18 / 100);
  const newTotal = newAfterDiscount + newGst;
  const newDue = Math.max(0, newTotal - newAmountPaid);

  // Filtered bills
  const filteredBills = useMemo(() => {
    if (!search.trim()) return bills;
    const q = search.toLowerCase();
    return bills.filter(b =>
      b.billNo.toLowerCase().includes(q) ||
      b.patient.toLowerCase().includes(q) ||
      b.patientId.toLowerCase().includes(q) ||
      (b.mobile && b.mobile.toLowerCase().includes(q)) ||
      b.tests.toLowerCase().includes(q) ||
      b.method.toLowerCase().includes(q) ||
      b.status.toLowerCase().includes(q)
    );
  }, [bills, search]);

  const sortedBills = useMemo(() => {
    let result = [...filteredBills];
    if (sortField) {
      result.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // Date sorting
        if (sortField === 'date') {
          const parseDate = (dStr: string) => {
            const parts = dStr.split('/');
            if (parts.length === 3) {
              return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
            }
            return 0;
          };
          return sortDirection === 'asc'
            ? parseDate(String(valA)) - parseDate(String(valB))
            : parseDate(String(valB)) - parseDate(String(valA));
        }

        // String comparison
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        // Numeric comparison
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        return 0;
      });
    }
    return result;
  }, [filteredBills, sortField, sortDirection]);

  // KPIs computed from state
  const todayStr = getTodayStr();
  const kpis = useMemo(() => {
    const todayBills = bills.filter(b => b.date === todayStr);
    const todayCollection = todayBills.reduce((s, b) => s + b.paid, 0);
    const totalDue = bills.reduce((s, b) => s + b.due, 0);
    const billsToday = todayBills.length;
    const refunds = bills.filter(b => b.status === 'REFUNDED').reduce((s, b) => s + b.total, 0);
    return { todayCollection, totalDue, billsToday, refunds };
  }, [bills, todayStr]);

  // Reset new bill form
  const resetNewBillForm = () => {
    setNewPatient('');
    setNewPatientId('');
    setNewTests('');
    setNewSubtotal(0);
    setNewDiscountPct(0);
    setNewMethod('Cash');
    setNewAmountPaid(0);
  };

  // Submit new bill (fallback, though we redirect to /billing/new now)
  const handleNewBillSubmit = () => {
    router.push('/billing/new');
  };

  // Collect payment
  const handleCollectPayment = async () => {
    if (!showCollect || collectAmount <= 0) {
      setToast({ message: 'Enter a valid amount', type: 'error' });
      return;
    }
    try {
      const dbBill = await db.query('bill', 'findUnique', {
        where: { id: showCollect.id }
      });
      if (!dbBill) throw new Error("Bill not found");

      const newPaid = Math.min(dbBill.paidAmount + collectAmount, dbBill.totalAmount);
      const newDueAmt = Math.max(0, dbBill.totalAmount - newPaid);
      let newStatus = 'UNPAID';
      if (newDueAmt <= 0) newStatus = 'PAID';
      else if (newPaid > 0) newStatus = 'PARTIAL';

      // 1. Save payment record
      await db.query('payment', 'create', {
        data: {
          billId: dbBill.id,
          amount: collectAmount,
          method: collectMethod.toUpperCase(),
          receivedBy: 1 // Admin user
        }
      });

      // 2. Update Bill status/due in DB
      await db.query('bill', 'update', {
        where: { id: dbBill.id },
        data: {
          paidAmount: newPaid,
          dueAmount: newDueAmt,
          paymentStatus: newStatus,
          paymentMethod: collectMethod.toUpperCase()
        }
      });

      setToast({ message: `Payment of ${formatCurrency(collectAmount)} collected for ${showCollect.billNo}`, type: 'success' });
      setShowCollect(null);
      setCollectAmount(0);
      setCollectMethod('Cash');
      
      // Refresh list
      await fetchBills();
    } catch (err: any) {
      setToast({ message: `Failed to collect payment: ${err.message || err}`, type: 'error' });
    }
  };

  // PDF Invoice Generation
  const handlePrint = async (bill: Bill) => {
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]); // A4
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const { height } = page.getSize();
      const blue = rgb(0.1, 0.3, 0.6);
      const black = rgb(0, 0, 0);
      const gray = rgb(0.4, 0.4, 0.4);

      let y = height - 50;

      // Header
      page.drawText('JharLab', { x: 50, y, size: 22, font: fontBold, color: blue });
      y -= 20;
      page.drawText('Tax Invoice / Receipt', { x: 50, y, size: 11, font, color: gray });
      y -= 8;
      page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1.5, color: blue });
      y -= 25;

      // Bill info
      page.drawText(`Bill No: ${bill.billNo}`, { x: 50, y, size: 11, font: fontBold, color: black });
      page.drawText(`Date: ${bill.date}`, { x: 400, y, size: 10, font, color: gray });
      y -= 20;
      page.drawText(`Patient: ${bill.patient}`, { x: 50, y, size: 11, font, color: black });
      y -= 16;
      page.drawText(`Patient ID: ${bill.patientId}`, { x: 50, y, size: 10, font, color: gray });
      y -= 30;

      // Tests heading
      page.drawRectangle({ x: 50, y: y - 2, width: 495, height: 20, color: rgb(0.93, 0.93, 0.97) });
      page.drawText('Tests / Services', { x: 60, y: y + 3, size: 10, font: fontBold, color: black });
      page.drawText('Amount', { x: 470, y: y + 3, size: 10, font: fontBold, color: black });
      y -= 22;

      // Test items
      const testList = bill.tests.split(',').map(t => t.trim());
      const perTest = testList.length > 0 ? Math.round(bill.subtotal / testList.length) : bill.subtotal;
      for (const test of testList) {
        page.drawText(test, { x: 60, y, size: 10, font, color: black });
        page.drawText(formatCurrency(perTest), { x: 465, y, size: 10, font, color: black });
        y -= 18;
      }

      y -= 10;
      page.drawLine({ start: { x: 350, y }, end: { x: 545, y }, thickness: 0.5, color: gray });
      y -= 18;

      // Totals
      const drawRow = (label: string, value: string, bold = false) => {
        page.drawText(label, { x: 360, y, size: 10, font: bold ? fontBold : font, color: black });
        page.drawText(value, { x: 465, y, size: 10, font: bold ? fontBold : font, color: black });
        y -= 18;
      };

      drawRow('Subtotal:', formatCurrency(bill.subtotal));
      if (bill.discount > 0) drawRow('Discount:', `- ${formatCurrency(bill.discount)}`);
      drawRow('GST (18%):', formatCurrency(bill.gst));
      page.drawLine({ start: { x: 350, y: y + 12 }, end: { x: 545, y: y + 12 }, thickness: 1, color: black });
      y -= 4;
      drawRow('Total:', formatCurrency(bill.total), true);
      drawRow('Paid:', formatCurrency(bill.paid));
      if (bill.due > 0) drawRow('Due:', formatCurrency(bill.due));

      y -= 15;
      page.drawText(`Payment Method: ${bill.method}`, { x: 50, y, size: 10, font, color: gray });
      page.drawText(`Status: ${bill.status}`, { x: 250, y, size: 10, font: fontBold, color: bill.status === 'PAID' ? rgb(0, 0.5, 0) : rgb(0.8, 0, 0) });

      // Footer
      page.drawLine({ start: { x: 50, y: 80 }, end: { x: 545, y: 80 }, thickness: 0.5, color: gray });
      page.drawText('Thank you for choosing our services.', { x: 50, y: 60, size: 9, font, color: gray });
      page.drawText('HSN: 999315 | GSTIN: As applicable', { x: 50, y: 46, size: 8, font, color: gray });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bill.billNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ message: `Invoice ${bill.billNo} downloaded`, type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to generate PDF', type: 'error' });
    }
  };

  // CSV Export
  const handleExport = () => {
    const headers = ['Bill No', 'Patient', 'Patient ID', 'Tests', 'Subtotal', 'Discount', 'GST', 'Total', 'Paid', 'Due', 'Method', 'Status', 'Date'];
    const rows = filteredBills.map(b => [b.billNo, b.patient, b.patientId, `"${b.tests}"`, b.subtotal, b.discount, b.gst, b.total, b.paid, b.due, b.method, b.status, b.date]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bills_export_${todayStr.replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: 'Bills exported as CSV', type: 'success' });
  };

  // Day Close summary
  const daySummary = useMemo(() => {
    const todayBills = bills.filter(b => b.date === todayStr);
    const totalCollection = todayBills.reduce((s, b) => s + b.paid, 0);
    const totalBills = todayBills.length;
    const cashTotal = todayBills.filter(b => b.method === 'Cash').reduce((s, b) => s + b.paid, 0);
    const upiTotal = todayBills.filter(b => b.method === 'UPI').reduce((s, b) => s + b.paid, 0);
    const cardTotal = todayBills.filter(b => b.method === 'Card').reduce((s, b) => s + b.paid, 0);
    const creditTotal = todayBills.filter(b => b.method === 'Credit').reduce((s, b) => s + b.paid, 0);
    const paidCount = todayBills.filter(b => b.status === 'PAID').length;
    const partialCount = todayBills.filter(b => b.status === 'PARTIAL').length;
    const unpaidCount = todayBills.filter(b => b.status === 'UNPAID').length;
    const totalDue = todayBills.reduce((s, b) => s + b.due, 0);
    return { totalCollection, totalBills, cashTotal, upiTotal, cardTotal, creditTotal, paidCount, partialCount, unpaidCount, totalDue };
  }, [bills, todayStr]);

  // Input style reusable
  const inputClass = "w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const labelClass = "block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider";

  return (
    <AppLayout title="Billing" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Billing' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search bills..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 rounded-lg border bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex items-center gap-2">
            {/* Header buttons: py-2 → py-2.5, rounded-lg → rounded-xl */}
            <button onClick={() => setShowDayClose(true)} className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm hover:bg-accent"><Receipt className="h-4 w-4" />Day Close</button>
            <button onClick={handleExport} className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm hover:bg-accent"><Download className="h-4 w-4" />Export</button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/billing/new')}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" />New Bill
            </motion.button>
          </div>
        </div>

        {/* KPIs — responsive grid-cols-2 md:grid-cols-4, text-3xl font-bold */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Today's Collection", value: formatCurrency(kpis.todayCollection), color: 'text-green-600 dark:text-green-400' },
            { label: 'Due Amount', value: formatCurrency(kpis.totalDue), color: 'text-red-600 dark:text-red-400' },
            { label: 'Bills Today', value: String(kpis.billsToday), color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Refunds', value: formatCurrency(kpis.refunds), color: 'text-orange-600 dark:text-orange-400' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Bills Table */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              {/* Table headers: text-xs font-semibold uppercase tracking-wider */}
              <tr className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold"><SortHeader field="billNo" label="Bill No" /></th>
                <th className="px-4 py-3 font-semibold"><SortHeader field="patient" label="Patient" /></th>
                <th className="px-4 py-3 font-semibold"><SortHeader field="tests" label="Tests" /></th>
                <th className="px-4 py-3 font-semibold"><SortHeader field="total" label="Total" /></th>
                <th className="px-4 py-3 font-semibold"><SortHeader field="paid" label="Paid" /></th>
                <th className="px-4 py-3 font-semibold"><SortHeader field="due" label="Due" /></th>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold"><SortHeader field="status" label="Status" /></th>
                <th className="px-4 py-3 font-semibold"><SortHeader field="date" label="Date" /></th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedBills.map((b, i) => (
                <motion.tr key={b.billNo} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className="border-b hover:bg-accent/50 transition-colors">
                  {/* Bill number: font-bold instead of font-semibold */}
                  <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{b.billNo}</td>
                  {/* Patient ID: text-[11px] instead of text-[10px] */}
                  <td className="px-4 py-3"><div className="font-medium text-foreground text-xs">{b.patient}</div><div className="text-[11px] text-muted-foreground">{b.patientId}</div></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate">{b.tests}</td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(b.total)}</td>
                  <td className="px-4 py-3 text-green-600 dark:text-green-400 font-medium">{formatCurrency(b.paid)}</td>
                  <td className="px-4 py-3 text-red-600 dark:text-red-400 font-medium">{b.due > 0 ? formatCurrency(b.due) : '—'}</td>
                  <td className="px-4 py-3"><span className="text-xs rounded-md bg-muted px-2 py-0.5">{b.method}</span></td>
                  {/* Status badges: text-[11px] with px-2.5 */}
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${paymentStatusStyles[b.status]}`}>{b.status}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{b.date}</td>
                  {/* Table action buttons: btn-action class, h-4 w-4 icons */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setShowViewBill(b)} className="btn-action" title="View"><Eye className="h-4 w-4 text-muted-foreground" /></button>
                      <button onClick={() => handlePrint(b)} className="btn-action" title="Print"><Printer className="h-4 w-4 text-muted-foreground" /></button>
                      {b.due > 0 && <button onClick={() => { setCollectAmount(0); setCollectMethod('Cash'); setShowCollect(b); }} className="btn-action" title="Collect"><CreditCard className="h-4 w-4 text-green-600" /></button>}
                    </div>
                  </td>
                </motion.tr>
              ))}
              {sortedBills.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">No bills found matching &quot;{search}&quot;</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ TOAST — consistent toast-global classes with z-[200] ═══ */}
      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70"><XIcon className="h-4 w-4" /></button>
        </div>
      )}

      {/* ═══ NEW BILL MODAL ═══ */}
      {showNewBill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewBill(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">New Bill</h2>
              <button onClick={() => setShowNewBill(false)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Patient Name *</label>
                <input className={inputClass} value={newPatient} onChange={e => setNewPatient(e.target.value)} placeholder="e.g. Rajesh Kumar" />
              </div>
              <div>
                <label className={labelClass}>Patient ID</label>
                <input className={inputClass} value={newPatientId} onChange={e => setNewPatientId(e.target.value)} placeholder="e.g. LAB-2026-00150 (auto if blank)" />
              </div>
              <div>
                <label className={labelClass}>Tests (comma separated) *</label>
                <input className={inputClass} value={newTests} onChange={e => setNewTests(e.target.value)} placeholder="e.g. CBC, LFT, KFT" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Subtotal (₹) *</label>
                  <input className={inputClass} type="number" min={0} value={newSubtotal || ''} onChange={e => setNewSubtotal(Number(e.target.value))} placeholder="0" />
                </div>
                <div>
                  <label className={labelClass}>Discount %</label>
                  <input className={inputClass} type="number" min={0} max={100} value={newDiscountPct || ''} onChange={e => setNewDiscountPct(Number(e.target.value))} placeholder="0" />
                </div>
              </div>
              {/* Auto-calculated preview */}
              <div className="rounded-lg bg-muted/50 border p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(newSubtotal)}</span></div>
                {newDiscount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount ({newDiscountPct}%)</span><span className="text-red-500">- {formatCurrency(newDiscount)}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">GST (18%)</span><span>{formatCurrency(newGst)}</span></div>
                <div className="flex justify-between font-bold text-sm border-t pt-1"><span>Total</span><span>{formatCurrency(newTotal)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Payment Method</label>
                  <select className={inputClass} value={newMethod} onChange={e => setNewMethod(e.target.value)}>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Amount Paid (₹)</label>
                  <input className={inputClass} type="number" min={0} value={newAmountPaid || ''} onChange={e => setNewAmountPaid(Number(e.target.value))} placeholder="0" />
                </div>
              </div>
              {newTotal > 0 && (
                <div className="text-xs text-right text-muted-foreground">
                  Due: <span className={newDue > 0 ? 'text-red-500 font-semibold' : 'text-green-600 font-semibold'}>{formatCurrency(newDue)}</span>
                </div>
              )}
            </div>
            {/* Modal submit buttons: py-2.5 px-5 font-bold rounded-xl */}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowNewBill(false)} className="rounded-xl border px-5 py-2.5 text-sm font-bold hover:bg-accent">Cancel</button>
              <button onClick={handleNewBillSubmit} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90">Create Bill</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ VIEW BILL MODAL ═══ */}
      {showViewBill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowViewBill(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Bill Details</h2>
              <button onClick={() => setShowViewBill(null)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Bill No</span><span className="font-mono font-bold text-primary">{showViewBill.billNo}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{showViewBill.date}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Patient</span><span className="font-medium">{showViewBill.patient}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Patient ID</span><span>{showViewBill.patientId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tests</span><span className="text-right max-w-[200px]">{showViewBill.tests}</span></div>
              <div className="border-t my-2" />
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(showViewBill.subtotal)}</span></div>
              {showViewBill.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-red-500">- {formatCurrency(showViewBill.discount)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">GST (18%)</span><span>{formatCurrency(showViewBill.gst)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span>{formatCurrency(showViewBill.total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-green-600 font-medium">{formatCurrency(showViewBill.paid)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span className={showViewBill.due > 0 ? 'text-red-500 font-medium' : ''}>{showViewBill.due > 0 ? formatCurrency(showViewBill.due) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{showViewBill.method}</span></div>
              {/* Status badge in view modal: text-[11px] with px-2.5 */}
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${paymentStatusStyles[showViewBill.status]}`}>{showViewBill.status}</span></div>
            </div>
            {/* Modal submit buttons: py-2.5 px-5 font-bold rounded-xl */}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { handlePrint(showViewBill); }} className="flex items-center gap-1 rounded-xl border px-5 py-2.5 text-sm font-bold hover:bg-accent"><Printer className="h-4 w-4" />Print</button>
              <button onClick={() => setShowViewBill(null)} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ COLLECT PAYMENT MODAL ═══ */}
      {showCollect && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCollect(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Collect Payment</h2>
              <button onClick={() => setShowCollect(null)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 border p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Bill</span><span className="font-mono font-bold">{showCollect.billNo}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Patient</span><span>{showCollect.patient}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>{formatCurrency(showCollect.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span className="text-green-600">{formatCurrency(showCollect.paid)}</span></div>
                <div className="flex justify-between font-bold text-sm border-t pt-1"><span>Outstanding Due</span><span className="text-red-500">{formatCurrency(showCollect.due)}</span></div>
              </div>
              <div>
                <label className={labelClass}>Amount to Collect (₹)</label>
                <input className={inputClass} type="number" min={0} max={showCollect.due} value={collectAmount || ''} onChange={e => setCollectAmount(Math.min(Number(e.target.value), showCollect.due))} placeholder={`Max ${showCollect.due}`} />
              </div>
              {/* Collect Full Due quick button */}
              <button
                type="button"
                onClick={() => setCollectAmount(showCollect.due)}
                className="w-full rounded-lg border border-dashed border-green-400 dark:border-green-600 px-3 py-2 text-sm font-semibold text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
              >
                Collect Full Due — {formatCurrency(showCollect.due)}
              </button>
              <div>
                <label className={labelClass}>Payment Method</label>
                <select className={inputClass} value={collectMethod} onChange={e => setCollectMethod(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                </select>
              </div>
            </div>
            {/* Modal submit buttons: py-2.5 px-5 font-bold rounded-xl */}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCollect(null)} className="rounded-xl border px-5 py-2.5 text-sm font-bold hover:bg-accent">Cancel</button>
              <button onClick={handleCollectPayment} className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-700">Collect {collectAmount > 0 ? formatCurrency(collectAmount) : ''}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DAY CLOSE MODAL ═══ */}
      {showDayClose && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDayClose(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Day Close Summary — {todayStr}</h2>
              <button onClick={() => setShowDayClose(false)} className="btn-action"><XIcon className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              {/* Day Close summary: bigger text-3xl for stat values */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Bills</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{daySummary.totalBills}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Collection</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">{formatCurrency(daySummary.totalCollection)}</p>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 border p-3 space-y-2 text-sm">
                <p className="font-bold text-sm mb-2">Payment Mode Breakdown</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Cash</span><span className="font-medium">{formatCurrency(daySummary.cashTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">UPI</span><span className="font-medium">{formatCurrency(daySummary.upiTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Card</span><span className="font-medium">{formatCurrency(daySummary.cardTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Credit</span><span className="font-medium">{formatCurrency(daySummary.creditTotal)}</span></div>
              </div>
              <div className="rounded-lg bg-muted/50 border p-3 space-y-2 text-sm">
                <p className="font-bold text-sm mb-2">Status Breakdown</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-green-600 dark:text-green-400 font-semibold">{daySummary.paidCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Partial</span><span className="text-yellow-600 dark:text-yellow-400 font-semibold">{daySummary.partialCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Unpaid</span><span className="text-red-600 dark:text-red-400 font-semibold">{daySummary.unpaidCount}</span></div>
              </div>
              {daySummary.totalDue > 0 && (
                <div className="flex justify-between font-bold border-t pt-2">
                  <span>Today&apos;s Outstanding Due</span>
                  <span className="text-red-500">{formatCurrency(daySummary.totalDue)}</span>
                </div>
              )}
            </div>
            {/* Modal close button: py-2.5 px-5 font-bold rounded-xl */}
            <div className="flex justify-end mt-5">
              <button onClick={() => setShowDayClose(false)} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90">Close</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
