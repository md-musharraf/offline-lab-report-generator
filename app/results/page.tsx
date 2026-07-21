"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Filter, Clock, CheckCircle, AlertTriangle, Play, Edit3, Eye, FileText, Trash2, XIcon, Plus, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { db } from '@/lib/db';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface TestOrder {
  id: string; // Patient ID (string)
  name: string;
  age: number;
  ageUnit: string;
  gender: string;
  mobile?: string;
  registeredAt: string;
  orderId?: number; // Optional order details
  orderNo?: string;
  tests: string;
  priority: string;
  status: string;
  createdAt: string;
}

const statusBadges: Record<string, { bg: string; text: string; label: string }> = {
  PENDING_BILL: { bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30', text: 'text-red-700 dark:text-red-400', label: 'Bill Pending' },
  PENDING: { bg: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300', label: 'Pending' },
  COLLECTED: { bg: 'bg-indigo-100 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700', text: 'text-indigo-700 dark:text-indigo-400', label: 'Collected' },
  PROCESSING: { bg: 'bg-amber-100 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-400', label: 'Processing' },
  RESULT_ENTERED: { bg: 'bg-orange-100 dark:bg-orange-950/50 border-orange-300 dark:border-orange-700', text: 'text-orange-700 dark:text-orange-400', label: 'Entered' },
  APPROVED: { bg: 'bg-green-100 dark:bg-green-950/50 border-green-300 dark:border-green-700', text: 'text-green-700 dark:text-green-400', label: 'Approved' },
  DELIVERED: { bg: 'bg-emerald-100 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-400', label: 'Delivered' }
};

const priorityBadges: Record<string, { bg: string; text: string; label: string }> = {
  ROUTINE: { bg: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400', text: 'text-blue-700 dark:text-blue-300', label: 'Routine' },
  URGENT: { bg: 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400', text: 'text-orange-700 dark:text-orange-300', label: 'Urgent' },
  EMERGENCY: { bg: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400', text: 'text-red-700 dark:text-red-300', label: 'Emergency' }
};

type FilterTab = 'ALL_ACTIVE' | 'PENDING_ENTRY' | 'ENTERED' | 'APPROVED';

export default function ResultsDashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('pathology_lab_current_user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {}
    }
  }, []);

  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';

  const [orders, setOrders] = useState<TestOrder[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL_ACTIVE');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<TestOrder | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const itemsPerPage = 10;

  const [sortField, setSortField] = useState<keyof TestOrder | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const requestSort = (field: keyof TestOrder) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortField === field && sortDirection === 'asc') {
      direction = 'desc';
    }
    setSortField(field);
    setSortDirection(direction);
  };

  const SortHeader = ({ field, label }: { field: keyof TestOrder; label: string }) => {
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

  const fetchOrders = useCallback(async () => {
    try {
      const patientsData = await db.query('patient', 'findMany', {
        include: {
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
        orderBy: {
          registeredAt: 'desc'
        }
      });
      if (patientsData) {
        const mappedList: TestOrder[] = [];
        patientsData.forEach((p: any) => {
          if (!p.orders || p.orders.length === 0) {
            mappedList.push({
              id: p.id,
              name: p.name,
              age: p.age,
              ageUnit: p.ageUnit,
              gender: p.gender,
              mobile: p.mobile || '',
              registeredAt: p.registeredAt || p.createdAt,
              status: 'PENDING_BILL',
              tests: 'No tests selected',
              priority: 'ROUTINE',
              createdAt: p.registeredAt || p.createdAt
            });
          } else {
            const sortedOrders = [...p.orders].sort((a: any, b: any) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            const latestOrder = sortedOrders[0];
            const testListStr = latestOrder.items?.map((item: any) => item.test?.shortName || item.test?.name || '').filter(Boolean).join(', ') || 'None';
            mappedList.push({
              id: p.id,
              name: p.name,
              age: p.age,
              ageUnit: p.ageUnit,
              gender: p.gender,
              mobile: p.mobile || '',
              registeredAt: p.registeredAt || p.createdAt,
              orderId: latestOrder.id,
              orderNo: latestOrder.orderNo,
              tests: testListStr,
              priority: latestOrder.priority || 'ROUTINE',
              status: latestOrder.status || 'PENDING',
              createdAt: latestOrder.createdAt
            });
          }
        });
        mappedList.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());
        setOrders(mappedList);
      }
    } catch (err) {
      console.error("Failed to fetch patients/orders:", err);
      setToast({ message: "Failed to load patient data", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedPatientIds([]);
  }, [search, activeTab]);

  // Filter and search logic
  const filteredOrders = useMemo(() => {
    let matched = orders;
    const q = search.toLowerCase().trim();
    if (q) {
      matched = orders.filter(o => {
        const patientName = o.name?.toLowerCase() || '';
        const orderNo = o.orderNo?.toLowerCase() || '';
        const patientId = o.id?.toLowerCase() || '';
        const mobile = o.mobile || '';
        const testNames = o.tests?.toLowerCase() || '';
        
        return patientName.includes(q) || 
          orderNo.includes(q) || 
          patientId.includes(q) || 
          mobile.includes(q) || 
          testNames.includes(q);
      });

      // Prioritize prefix and word-start matches
      matched = [...matched].sort((a, b) => {
        const nameA = a.name?.toLowerCase() || '';
        const nameB = b.name?.toLowerCase() || '';
        const mobileA = a.mobile || '';
        const mobileB = b.mobile || '';
        const idA = a.id?.toLowerCase() || '';
        const idB = b.id?.toLowerCase() || '';
        
        const aStarts = nameA.startsWith(q) || mobileA.startsWith(q) || idA.startsWith(q);
        const bStarts = nameB.startsWith(q) || mobileB.startsWith(q) || idB.startsWith(q);
        
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        
        const aWordStarts = nameA.split(/\s+/).some((w) => w.startsWith(q));
        const bWordStarts = nameB.split(/\s+/).some((w) => w.startsWith(q));
        
        if (aWordStarts && !bWordStarts) return -1;
        if (!aWordStarts && bWordStarts) return 1;
        
        return 0;
      });
    }

    return matched.filter(o => {
      let matchesTab = true;
      if (activeTab === 'ALL_ACTIVE') {
        matchesTab = o.status !== 'DELIVERED';
      } else if (activeTab === 'PENDING_ENTRY') {
        matchesTab = ['PENDING', 'COLLECTED', 'PROCESSING', 'PENDING_BILL'].includes(o.status);
      } else if (activeTab === 'ENTERED') {
        matchesTab = o.status === 'RESULT_ENTERED';
      } else if (activeTab === 'APPROVED') {
        matchesTab = ['APPROVED', 'DELIVERED'].includes(o.status);
      }
      return matchesTab;
    });
  }, [orders, search, activeTab]);

  const sortedOrders = useMemo(() => {
    let result = [...filteredOrders];
    if (sortField) {
      result.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // 1. Priority comparison
        if (sortField === 'priority') {
          const priorityWeights: Record<string, number> = { EMERGENCY: 3, URGENT: 2, ROUTINE: 1 };
          const weightA = priorityWeights[a.priority] || 0;
          const weightB = priorityWeights[b.priority] || 0;
          return sortDirection === 'asc' ? weightA - weightB : weightB - weightA;
        }

        // 2. Status comparison
        if (sortField === 'status') {
          const statusWeights: Record<string, number> = {
            PENDING_BILL: 1,
            PENDING: 2,
            COLLECTED: 3,
            PROCESSING: 4,
            RESULT_ENTERED: 5,
            APPROVED: 6,
            DELIVERED: 7
          };
          const weightA = statusWeights[a.status] || 0;
          const weightB = statusWeights[b.status] || 0;
          return sortDirection === 'asc' ? weightA - weightB : weightB - weightA;
        }

        // 3. Date comparison (registeredAt / createdAt)
        if (sortField === 'registeredAt') {
          const timeA = new Date(a.registeredAt).getTime();
          const timeB = new Date(b.registeredAt).getTime();
          return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
        }

        // 4. String comparison
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        // 5. Numeric comparison
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        return 0;
      });
    }
    return result;
  }, [filteredOrders, sortField, sortDirection]);

  // Compute KPI figures
  const kpis = useMemo(() => {
    let pendingEntry = 0;
    let resultsEntered = 0;
    let approved = 0;
    let total = orders.length;

    orders.forEach(o => {
      if (['PENDING', 'COLLECTED', 'PROCESSING', 'PENDING_BILL'].includes(o.status)) {
        pendingEntry++;
      } else if (o.status === 'RESULT_ENTERED') {
        resultsEntered++;
      } else if (['APPROVED', 'DELIVERED'].includes(o.status)) {
        approved++;
      }
    });

    return { pendingEntry, resultsEntered, approved, total };
  }, [orders]);

  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage) || 1;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [sortedOrders.length, totalPages, currentPage]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedOrders.slice(start, start + itemsPerPage);
  }, [sortedOrders, currentPage]);

  const handleToggleSelect = (patientId: string) => {
    setSelectedPatientIds(prev =>
      prev.includes(patientId) ? prev.filter(id => id !== patientId) : [...prev, patientId]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pagePatientIds = paginatedOrders.map(o => o.id);
      setSelectedPatientIds(prev => {
        const next = [...prev];
        pagePatientIds.forEach(id => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
    } else {
      const pagePatientIds = paginatedOrders.map(o => o.id);
      setSelectedPatientIds(prev => prev.filter(id => !pagePatientIds.includes(id)));
    }
  };

  const deleteOrderData = async (orderId: number) => {
    const orderItems = await db.query('testOrderItem', 'findMany', { where: { orderId } });
    for (const item of (orderItems || [])) {
      const results = await db.query('testResult', 'findMany', { where: { orderItemId: item.id } });
      for (const r of (results || [])) {
        await db.query('testResult', 'delete', { where: { id: r.id } });
      }
      await db.query('testOrderItem', 'delete', { where: { id: item.id } });
    }
    const report = await db.query('report', 'findFirst', { where: { orderId } });
    if (report) {
      await db.query('report', 'delete', { where: { id: report.id } });
    }
    await db.query('testOrder', 'delete', { where: { id: orderId } });
  };

  const deletePatientOrOrder = async (o: any) => {
    if (o.orderId) {
      await deleteOrderData(o.orderId);
    }
    await db.query('patient', 'delete', { where: { id: o.id } });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const name = deleteConfirm.name;
    try {
      await deletePatientOrOrder(deleteConfirm);
      setSelectedPatientIds(prev => prev.filter(id => id !== deleteConfirm.id));
      await fetchOrders();
      setDeleteConfirm(null);
      setToast({ message: `Record for ${name} deleted successfully`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      setToast({ message: `Failed to delete record: ${err.message || err}`, type: 'error' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPatientIds.length === 0) return;
    try {
      for (const id of selectedPatientIds) {
        const o = orders.find(x => x.id === id);
        if (o) {
          await deletePatientOrOrder(o);
        }
      }
      setSelectedPatientIds([]);
      await fetchOrders();
      setShowBulkDeleteConfirm(false);
      setToast({ message: 'Selected records deleted successfully', type: 'success' });
    } catch (err: any) {
      console.error(err);
      setToast({ message: `Failed to delete some records: ${err.message || err}`, type: 'error' });
    }
  };

  const handleAction = (orderId: number) => {
    router.push(`/results/entry?orderId=${orderId}`);
  };

  return (
    <AppLayout 
      title="Results Entry Dashboard" 
      breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Results' }]}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        
        {/* KPI Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Orders</p>
                <p className="text-3xl font-bold text-foreground mt-1">{loading ? '...' : kpis.total}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 dark:bg-blue-950/30 dark:text-blue-400">
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Pending Entry</p>
                <p className="text-3xl font-bold text-amber-500 mt-1">{loading ? '...' : kpis.pendingEntry}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 dark:bg-amber-950/30 dark:text-amber-400">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Entered (Drafts)</p>
                <p className="text-3xl font-bold text-orange-500 mt-1">{loading ? '...' : kpis.resultsEntered}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 dark:bg-orange-950/30 dark:text-orange-400">
                <Edit3 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Approved Reports</p>
                <p className="text-3xl font-bold text-green-500 mt-1">{loading ? '...' : kpis.approved}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-500 dark:bg-green-950/30 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar: Search, Filters & Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search by order no, patient name or test..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)}
                className="w-full py-2.5 rounded-xl border bg-background pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow" 
              />
            </div>
            {isAdmin && selectedPatientIds.length > 0 && (

              <motion.button
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 text-sm font-bold transition-colors shadow-sm whitespace-nowrap animate-in fade-in zoom-in-95 duration-150"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedPatientIds.length})
              </motion.button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-1.5 border-b md:border-b-0 pb-2 md:pb-0 overflow-x-auto">
            {(['ALL_ACTIVE', 'PENDING_ENTRY', 'ENTERED', 'APPROVED'] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent hover:border-border'
                }`}
              >
                {tab === 'ALL_ACTIVE' && 'Active Orders'}
                {tab === 'PENDING_ENTRY' && 'Pending Entry'}
                {tab === 'ENTERED' && 'Entered'}
                {tab === 'APPROVED' && 'Approved & Archived'}
              </button>
            ))}
          </div>
        </div>

        {/* Orders Table */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading orders...</div>
          ) : paginatedOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No matching test orders found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedPatientIds.includes(o.id))}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary h-[18px] w-[18px] bg-background cursor-pointer"
                    />
                  </th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wider w-40"><SortHeader field="orderNo" label="Order No" /></th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wider"><SortHeader field="name" label="Patient" /></th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wider"><SortHeader field="tests" label="Tests Requested" /></th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wider w-48"><SortHeader field="registeredAt" label="Date Registered" /></th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wider w-28"><SortHeader field="priority" label="Priority" /></th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wider w-28"><SortHeader field="status" label="Status" /></th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wider w-48 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((o, i) => {
                  const patientAge = `${o.age}${o.ageUnit === 'YEARS' ? 'Y' : o.ageUnit === 'MONTHS' ? 'M' : 'D'}`;
                  const testListStr = o.tests;
                  const dateStr = new Date(o.registeredAt).toLocaleDateString('en-GB');
                  const timeStr = new Date(o.registeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  
                  const statusInfo = statusBadges[o.status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: o.status };
                  const priorityInfo = priorityBadges[o.priority] || { bg: 'bg-gray-50', text: 'text-gray-600', label: o.priority };
                  
                  const needsEntry = ['PENDING', 'COLLECTED', 'PROCESSING'].includes(o.status);
                  const isEntered = o.status === 'RESULT_ENTERED';
                  const isPendingBill = o.status === 'PENDING_BILL';
                  const isSelected = selectedPatientIds.includes(o.id);

                  return (
                    <motion.tr 
                      key={o.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={`border-b hover:bg-accent/30 transition-colors ${isSelected ? 'bg-blue-500/5 dark:bg-blue-950/10' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="px-5 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(o.id)}
                          className="rounded border-border text-primary focus:ring-primary h-[18px] w-[18px] bg-background cursor-pointer"
                        />
                      </td>
                      {/* Order No */}
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-primary">
                        {o.orderNo || '—'}
                      </td>
                      {/* Patient */}
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-foreground">{o.name || 'Walk-in'}</div>
                        <div className="text-xs text-muted-foreground">{patientAge} / {o.gender?.toLowerCase()}</div>
                      </td>
                      {/* Tests */}
                      <td className="px-5 py-3.5 max-w-xs truncate" title={testListStr}>
                        <span className="text-foreground font-medium">{testListStr}</span>
                      </td>
                      {/* Date */}
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        <div>{dateStr}</div>
                        <div>{timeStr}</div>
                      </td>
                      {/* Priority */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${priorityInfo.bg} ${priorityInfo.text}`}>
                          {priorityInfo.label}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusInfo.bg} ${statusInfo.text}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      {/* Action Buttons */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isPendingBill ? (
                            <Link 
                              href={`/billing/new?patientId=${o.id}`}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 text-xs font-bold transition-colors shadow-sm"
                            >
                              <Plus className="h-4 w-4" />
                              Create Order
                            </Link>
                          ) : needsEntry ? (
                            <button 
                              onClick={() => handleAction(o.orderId!)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-2 text-xs font-bold transition-colors shadow-sm btn-primary-glow"
                            >
                              <Play className="h-4 w-4" />
                              Enter Results
                            </button>
                          ) : isEntered ? (
                            <button 
                              onClick={() => handleAction(o.orderId!)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-500/50 bg-orange-500/5 text-orange-600 hover:bg-orange-500/10 px-3.5 py-2 text-xs font-bold transition-colors shadow-sm"
                            >
                              <Edit3 className="h-4 w-4" />
                              Edit Results
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleAction(o.orderId!)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground px-3.5 py-2 text-xs font-bold transition-colors shadow-sm"
                            >
                              <Eye className="h-4 w-4" />
                              View Results
                            </button>
                          )}
                           {isAdmin && (
                             <button
                               onClick={() => setDeleteConfirm(o)}
                               className="btn-action flex items-center justify-center border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 hover:text-red-700 transition-colors p-2 rounded-lg"
                               title="Delete Record"
                             >
                               <Trash2 className="h-4 w-4" />
                             </button>
                           )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && (
            <div className="flex items-center justify-between border-t px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {paginatedOrders.length} of {filteredOrders.length} records
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3.5 py-2 rounded-lg border text-xs hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(pNo => (
                  <button
                     key={pNo}
                    onClick={() => setCurrentPage(pNo)}
                    className={`px-3.5 py-2 rounded-lg text-xs transition-colors ${
                      currentPage === pNo 
                        ? 'bg-primary text-primary-foreground font-bold' 
                        : 'border hover:bg-accent'
                    }`}
                  >
                    {pNo}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3.5 py-2 rounded-lg border text-xs hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setDeleteConfirm(null)}>
          <div className="relative bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setDeleteConfirm(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg border border-border bg-muted/20 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close modal"
            >
              <XIcon className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete Record</h2>
                <p className="text-xs text-muted-foreground">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Are you sure you want to delete record for <span className="font-semibold text-foreground">{deleteConfirm.name}</span>? All associated test results and reports will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setDeleteConfirm(null)} 
                className="px-5 py-2.5 rounded-xl border text-sm font-bold hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete} 
                className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setShowBulkDeleteConfirm(false)}>
          <div className="relative bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setShowBulkDeleteConfirm(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg border border-border bg-muted/20 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close modal"
            >
              <XIcon className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Bulk Delete Records</h2>
                <p className="text-xs text-muted-foreground">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Are you sure you want to delete <span className="font-semibold text-foreground">{selectedPatientIds.length}</span> selected records? All associated test results and reports will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setShowBulkDeleteConfirm(false)} 
                className="px-5 py-2.5 rounded-xl border text-sm font-bold hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleBulkDelete} 
                className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[200] toast-global ${
          toast.type === 'success' ? 'toast-success' : 'toast-error'
        }`}>
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="p-0.5 rounded hover:bg-black/10 transition-colors" aria-label="Close notification">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </AppLayout>
  );
}
