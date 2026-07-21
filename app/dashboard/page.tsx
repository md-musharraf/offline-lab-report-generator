"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import {
  Users, FlaskConical, CreditCard, AlertTriangle,
  TrendingUp, Clock, FileCheck, Activity,
  ArrowUpRight, ArrowDownRight, ChevronRight,
  Printer, MessageCircle, Eye, UserPlus, FileText, Receipt,
  Truck
} from 'lucide-react';
import { formatCurrency } from '@/shared/constants';
import { db } from '@/lib/db';
import { useRouter } from 'next/navigation';

// ─── Time-based Greeting Helper ─────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// ─── Animated Counter Component ──────────────────────────

function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 800;
    const steps = 20;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <span className="tabular-nums">
      {prefix}{typeof value === 'number' && value >= 1000 ? count.toLocaleString('en-IN') : count}{suffix}
    </span>
  );
}

// ─── KPI Card Component ─────────────────────────────────

interface KPICardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon: React.ElementType;
  color: string;
  trend?: { value: number; isUp: boolean };
  onClick?: () => void;
}

function KPICard({ title, value, prefix, suffix, icon: Icon, color, trend, onClick }: KPICardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="cursor-pointer rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-foreground">
            <AnimatedCounter value={value} prefix={prefix} suffix={suffix} />
          </p>
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trend.isUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {trend.isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {trend.value}% vs yesterday
            </div>
          )}
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Status Pipeline Component ──────────────────────────

function StatusPipeline({ counts }: { counts: number[] }) {
  const stages = [
    { label: 'Registered', count: counts[0] || 0, color: 'bg-blue-500' },
    { label: 'Collected', count: counts[1] || 0, color: 'bg-indigo-500' },
    { label: 'Processing', count: counts[2] || 0, color: 'bg-yellow-500' },
    { label: 'Approved', count: counts[3] || 0, color: 'bg-green-500' },
    { label: 'Delivered', count: counts[4] || 0, color: 'bg-emerald-500' },
  ];

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-4">Today&apos;s Pipeline</h3>
      <div className="flex items-center justify-between gap-2 overflow-x-auto py-1">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-2 min-w-[80px]">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex flex-col items-center cursor-pointer group"
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-full ${stage.color} text-white font-bold text-xl shadow-lg group-hover:shadow-xl transition-shadow`}>
                {stage.count}
              </div>
              <span className="mt-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{stage.label}</span>
            </motion.div>
            {i < stages.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 -mt-4 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Alert Banner Component ─────────────────────────────

function AlertBanner({ type, count, message, onClick }: { type: 'critical' | 'tat' | 'stock'; count: number; message: string; onClick?: () => void }) {
  const styles = {
    critical: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400',
    tat: 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400',
    stock: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400',
  };

  const icons = {
    critical: '🔴',
    tat: '🟠',
    stock: '🟡',
  };

  if (count === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center justify-between rounded-lg border px-4 py-2.5 ${styles[type]}`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>{icons[type]}</span>
        <span>{message.replace('{count}', String(count))}</span>
      </div>
      <button onClick={onClick} className="text-xs font-semibold hover:underline flex items-center gap-1">
        View <ChevronRight className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ─── Recent Patients Table ──────────────────────────────

interface RecentPatientsTableProps {
  patients: any[];
  onView: (orderId: number) => void;
  onPrint: (orderId: number) => void;
}

function RecentPatientsTable({ patients, onView, onPrint }: RecentPatientsTableProps) {
  const statusColors: Record<string, string> = {
    Registered: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
    Collected: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400',
    Processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
    Approved: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
    Delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between p-5 pb-3">
          <h3 className="text-sm font-semibold text-foreground">Recent Patients</h3>
          <button onClick={() => onView(0)} className="text-xs text-primary border border-primary/30 rounded-lg px-3 py-1 hover:bg-primary/10 transition-colors font-medium">View All →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Patient ID</th>
                <th className="px-5 py-2.5 font-medium">Name</th>
                <th className="px-5 py-2.5 font-medium">Tests</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Time</th>
                <th className="px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.orderId} className="border-t hover:bg-accent/50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs font-medium text-primary">{p.id}</td>
                  <td className="px-5 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs max-w-[150px] truncate" title={p.tests}>{p.tests}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColors[p.status] || ''}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{p.time}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onView(p.orderId)} className="btn-action" title="View/Edit Results"><Eye className="h-4 w-4 text-muted-foreground" /></button>
                      <button onClick={() => onPrint(p.orderId)} className="btn-action" title="Print Report"><Printer className="h-4 w-4 text-muted-foreground" /></button>
                      <button className="btn-action" title="WhatsApp"><MessageCircle className="h-4 w-4 text-muted-foreground" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {patients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs text-muted-foreground">
                    No patient registrations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Due Payments Table ─────────────────────────────────

interface DuePaymentsTableProps {
  dues: any[];
  onCollect: () => void;
}

function DuePaymentsTable({ dues, onCollect }: DuePaymentsTableProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm h-full">
      <div className="flex items-center justify-between p-5 pb-3">
        <h3 className="text-sm font-semibold text-foreground">Due Payments</h3>
        <button onClick={onCollect} className="text-xs text-primary border border-primary/30 rounded-lg px-3 py-1 hover:bg-primary/10 transition-colors font-medium">View All →</button>
      </div>
      <div className="space-y-0">
        {dues.map((d, i) => (
          <div key={i} className="flex items-center justify-between border-t px-5 py-3 hover:bg-accent/50 transition-colors">
            <div>
              <p className="text-sm font-medium text-foreground">{d.patient}</p>
              <p className="text-xs text-muted-foreground">{d.days} days overdue</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(d.amount)}</span>
              <button onClick={onCollect} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                Collect
              </button>
            </div>
          </div>
        ))}
        {dues.length === 0 && (
          <div className="p-8 border-t text-center text-xs text-muted-foreground">
            No pending due payments!
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ─────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('pathology_lab_current_user');
      if (userStr) {
        try {
          setCurrentUser(JSON.parse(userStr));
        } catch (e) {}
      }
    }
  }, []);

  const [stats, setStats] = useState({
    todayPatients: 0,
    pendingResults: 0,
    todayRevenue: 0,
    criticalCases: 0,
    monthlyRevenue: 0,
    dueCollection: 0,
    reportsDelivered: 0,
    testsDoneToday: 0,
    pendingDelivery: 0,
    pipeline: [0, 0, 0, 0, 0],
    recentPatients: [] as any[],
    duePayments: [] as any[],
    criticalAlerts: 0,
    tatBreachAlerts: 0,
    lowStockAlerts: 0,
    chartData: [] as { name: string; revenue?: number; count?: number; patients?: number }[],
    testDistribution: [] as { name: string; count: number; pct: number; color: string }[],
  });

  const fetchDashboardData = async () => {
    try {
      const [patients, bills, payments, orders, results] = await Promise.all([
        db.query('patient', 'findMany'),
        db.query('bill', 'findMany', { include: { patient: true } }),
        db.query('payment', 'findMany'),
        db.query('testOrder', 'findMany', {
          include: {
            patient: true,
            items: {
              include: {
                test: {
                  include: { category: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        db.query('testResult', 'findMany')
      ]);

      const isToday = (dateInput: any) => {
        if (!dateInput) return false;
        const d = new Date(dateInput);
        const today = new Date();
        return d.getDate() === today.getDate() &&
          d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear();
      };

      const isThisMonth = (dateInput: any) => {
        if (!dateInput) return false;
        const d = new Date(dateInput);
        const today = new Date();
        return d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear();
      };

      // KPIs
      const todayPatients = patients.filter((p: any) => isToday(p.registeredAt || p.createdAt)).length;
      const todayRevenue = payments.filter((p: any) => isToday(p.paidAt)).reduce((sum: number, p: any) => sum + p.amount, 0);
      const monthlyRevenue = payments.filter((p: any) => isThisMonth(p.paidAt)).reduce((sum: number, p: any) => sum + p.amount, 0);
      const dueCollection = bills.reduce((sum: number, b: any) => sum + b.dueAmount, 0);
      const pendingResults = orders.filter((o: any) => ['PENDING', 'COLLECTED', 'PROCESSING'].includes(o.status)).length;
      const criticalCases = results.filter((r: any) => r.isCritical).length;
      const pendingDelivery = orders.filter((o: any) => o.status === 'APPROVED').length;

      let testsDoneToday = 0;
      orders.forEach((o: any) => {
        if (isToday(o.createdAt) && ['RESULT_ENTERED', 'APPROVED', 'DELIVERED'].includes(o.status)) {
          testsDoneToday += o.items?.length || 0;
        }
      });

      const reportsDelivered = orders.filter((o: any) => o.status === 'DELIVERED' && isToday(o.deliveredAt || o.updatedAt)).length;

      // Status Pipeline
      const pipeline = [
        orders.filter((o: any) => isToday(o.createdAt) && o.status === 'PENDING').length,
        orders.filter((o: any) => isToday(o.createdAt) && o.status === 'COLLECTED').length,
        orders.filter((o: any) => isToday(o.createdAt) && (o.status === 'PROCESSING' || o.status === 'RESULT_ENTERED')).length,
        orders.filter((o: any) => isToday(o.createdAt) && o.status === 'APPROVED').length,
        orders.filter((o: any) => isToday(o.createdAt) && o.status === 'DELIVERED').length,
      ];

      // Alerts
      const criticalAlerts = results.filter((r: any) => r.isCritical && r.status !== 'ACKNOWLEDGED').length;
      
      const now = new Date();
      const tatBreachAlerts = orders.filter((o: any) => 
        o.expectedAt && new Date(o.expectedAt) < now && !['APPROVED', 'DELIVERED'].includes(o.status)
      ).length;

      let lowStockAlerts = 0;
      if (typeof window !== 'undefined') {
        const storedInventory = localStorage.getItem('pathology_lab_inventory');
        if (storedInventory) {
          try {
            const inv = JSON.parse(storedInventory);
            lowStockAlerts = inv.filter((item: any) => item.stock < item.min).length;
          } catch (e) {}
        }
      }

      // Recent Patients List
      const recentPatients = orders.slice(0, 5).map((o: any) => {
        const testNames = o.items?.map((item: any) => item.test?.shortName || item.test?.name || '').filter(Boolean).join(', ') || 'No tests';
        const dateObj = new Date(o.createdAt);
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let status = 'Registered';
        if (o.status === 'COLLECTED') status = 'Collected';
        if (o.status === 'PROCESSING') status = 'Processing';
        if (o.status === 'RESULT_ENTERED') status = 'Processing';
        if (o.status === 'APPROVED') status = 'Approved';
        if (o.status === 'DELIVERED') status = 'Delivered';

        return {
          id: o.patientId,
          name: o.patient?.name || 'Unknown',
          tests: testNames,
          status,
          time: timeStr,
          orderId: o.id
        };
      });

      // Due Payments List
      const duePayments = bills
        .filter((b: any) => b.dueAmount > 0)
        .map((b: any) => {
          const diffTime = Math.abs(new Date().getTime() - new Date(b.createdAt).getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return {
            patient: b.patient?.name || 'Unknown',
            amount: b.dueAmount,
            days: diffDays,
            billId: b.id
          };
        })
        .slice(0, 5);

      // Chart Data: last 7 days of revenue
      const last7DaysList = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d;
      }).reverse();

      const chartData = last7DaysList.map(date => {
        const dayStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const amount = payments
          .filter((p: any) => {
            const pDate = new Date(p.paidAt);
            return pDate.getDate() === date.getDate() &&
              pDate.getMonth() === date.getMonth() &&
              pDate.getFullYear() === date.getFullYear();
          })
          .reduce((sum: number, p: any) => sum + p.amount, 0);

        // Calculate completed test count volume for the date
        let count = 0;
        orders.forEach((o: any) => {
          const oDate = new Date(o.createdAt);
          if (
            oDate.getDate() === date.getDate() &&
            oDate.getMonth() === date.getMonth() &&
            oDate.getFullYear() === date.getFullYear()
          ) {
            count += o.items?.length || 0;
          }
        });

        // Calculate registered patients for the date
        const registeredPatientsCount = patients.filter((p: any) => {
          const pDate = new Date(p.registeredAt || p.createdAt);
          return pDate.getDate() === date.getDate() &&
            pDate.getMonth() === date.getMonth() &&
            pDate.getFullYear() === date.getFullYear();
        }).length;

        return { name: dayStr, revenue: amount, count, patients: registeredPatientsCount };
      });

      // Test Distribution
      const testDist: Record<string, number> = {};
      let totalTestsToday = 0;
      orders.forEach((o: any) => {
        if (isToday(o.createdAt)) {
          o.items?.forEach((item: any) => {
            const catName = item.test?.category?.name || 'Unknown';
            testDist[catName] = (testDist[catName] || 0) + 1;
            totalTestsToday++;
          });
        }
      });

      const categoryColors: Record<string, string> = {
        Hematology: 'bg-blue-500',
        Biochemistry: 'bg-green-500',
        Serology: 'bg-purple-500',
        Microbiology: 'bg-yellow-500',
        'Clinical Pathology': 'bg-pink-500',
        Immunology: 'bg-indigo-500',
      };
      
      const testDistribution = Object.entries(testDist).map(([name, count]) => ({
        name,
        count,
        pct: totalTestsToday > 0 ? Math.round((count / totalTestsToday) * 100) : 0,
        color: categoryColors[name] || 'bg-gray-500',
      }));

      setStats({
        todayPatients,
        pendingResults,
        todayRevenue,
        criticalCases,
        monthlyRevenue,
        dueCollection,
        reportsDelivered,
        testsDoneToday,
        pendingDelivery,
        pipeline,
        recentPatients,
        duePayments,
        criticalAlerts,
        tatBreachAlerts,
        lowStockAlerts,
        chartData,
        testDistribution,
      });

    } catch (e) {
      console.error("Failed to load dashboard statistics:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // SVG Chart calculation helper
  const chartPoints = useMemo(() => {
    if (stats.chartData.length === 0) return { line: '', area: '', dots: [] as any[] };
    const isTech = currentUser?.role === 'TECHNICIAN';
    const isRecep = currentUser?.role === 'RECEPTIONIST';
    const valKey = isRecep ? 'patients' : (isTech ? 'count' : 'revenue');
    const maxVal = Math.max(...stats.chartData.map(d => d[valKey] || 0), (isTech || isRecep) ? 10 : 1000);
    const width = 500;
    const height = 200;
    const points = stats.chartData.map((d, i) => {
      const x = (i / (stats.chartData.length - 1)) * width;
      const y = height - ((d[valKey] || 0) / maxVal) * (height - 40) - 20;
      return { x, y, name: d.name, val: d[valKey] || 0 };
    });

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const area = `${line} L ${width} ${height} L 0 ${height} Z`;

    return { line, area, dots: points };
  }, [stats.chartData, currentUser]);

  const isTechnician = currentUser?.role === 'TECHNICIAN';
  const isReceptionist = currentUser?.role === 'RECEPTIONIST';

  if (loading) {
    return (
      <AppLayout title="Dashboard" breadcrumbs={[{ label: 'Home' }, { label: 'Dashboard' }]}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground font-semibold text-lg animate-pulse">Loading JharLab Dashboard...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard" breadcrumbs={[{ label: 'Home' }, { label: 'Dashboard' }]}>
      <div className="space-y-6">

        {/* Welcome and Quick Entry Banner */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-blue-950/40 to-indigo-950/30 border border-blue-500/10 rounded-xl p-5 shadow-sm">
          <div>
            <h2 className="text-base font-bold text-foreground">{getGreeting()} — Welcome to JharLab</h2>
            <p className="text-xs text-muted-foreground">Offline diagnostics dashboard. Register patients, input values, and download reports instantly.</p>
          </div>
          <button 
            onClick={() => router.push('/quick-register')}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white py-3 px-5 text-sm font-bold shadow-md shadow-blue-500/20 transition-all animate-glow-pulse"
          >
            <Activity className="h-4 w-4" />
            Quick Patient Entry & Results
          </button>
        </div>

        {/* Quick Actions Center */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Quick Operations</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Register & Bill */}
            <motion.div
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/quick-register')}
              className="cursor-pointer relative overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 p-5 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="absolute top-0 right-0 h-24 w-24 -mr-6 -mt-6 rounded-full bg-blue-500/5 blur-2xl group-hover:bg-blue-500/10 transition-colors" />
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                  <UserPlus className="h-7 w-7" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-base flex items-center gap-1">
                    Quick Register & Bill
                    <ChevronRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">Register patient & bill immediately</p>
                </div>
              </div>
            </motion.div>

            {/* Card 2: Results Entry (Tech/Admin) or Home Collection (Receptionist) */}
            {isReceptionist ? (
              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/home-collection')}
                className="cursor-pointer relative overflow-hidden rounded-xl border border-amber-500/10 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-5 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="absolute top-0 right-0 h-24 w-24 -mr-6 -mt-6 rounded-full bg-amber-500/5 blur-2xl group-hover:bg-amber-500/10 transition-colors" />
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300">
                    <Truck className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-base flex items-center gap-1">
                      Home Collection
                      <ChevronRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">Book & manage home collections</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/results')}
                className="cursor-pointer relative overflow-hidden rounded-xl border border-yellow-500/10 bg-gradient-to-br from-yellow-500/5 to-amber-500/5 p-5 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="absolute top-0 right-0 h-24 w-24 -mr-6 -mt-6 rounded-full bg-yellow-500/5 blur-2xl group-hover:bg-yellow-500/10 transition-colors" />
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-500 group-hover:bg-yellow-500 group-hover:text-white transition-all duration-300">
                    <FileText className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-base flex items-center gap-1">
                      Results Entry
                      <ChevronRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">Input test parameters & values</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Card 3: Reports */}
            <motion.div
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/reports')}
              className="cursor-pointer relative overflow-hidden rounded-xl border border-green-500/10 bg-gradient-to-br from-green-500/5 to-emerald-500/5 p-5 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="absolute top-0 right-0 h-24 w-24 -mr-6 -mt-6 rounded-full bg-green-500/5 blur-2xl group-hover:bg-green-500/10 transition-colors" />
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-green-500/10 text-green-500 group-hover:bg-green-500 group-hover:text-white transition-all duration-300">
                  <Printer className="h-7 w-7" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-base flex items-center gap-1">
                    Print & Reports
                    <ChevronRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">View, approve & print PDFs</p>
                </div>
              </div>
            </motion.div>

            {/* Card 4: Billing */}
            <motion.div
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/billing')}
              className="cursor-pointer relative overflow-hidden rounded-xl border border-purple-500/10 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 p-5 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="absolute top-0 right-0 h-24 w-24 -mr-6 -mt-6 rounded-full bg-purple-500/5 blur-2xl group-hover:bg-purple-500/10 transition-colors" />
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-all duration-300">
                  <Receipt className="h-7 w-7" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-base flex items-center gap-1">
                    Billing & Dues
                    <ChevronRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">Manage bills & collect payments</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Alert Banners */}
        <div className="space-y-2">
          {!isReceptionist && (
            <AlertBanner type="critical" count={stats.criticalAlerts} message="CRITICAL: {count} results pending acknowledgment" onClick={() => router.push('/reports')} />
          )}
          <AlertBanner type="tat" count={stats.tatBreachAlerts} message="TAT BREACH: {count} orders overdue" onClick={() => router.push('/reports')} />
          {!isReceptionist && (
            <AlertBanner type="stock" count={stats.lowStockAlerts} message="LOW STOCK: {count} items below minimum" onClick={() => router.push('/inventory')} />
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="Today's Patients" value={stats.todayPatients} icon={Users} color="bg-blue-600" onClick={() => router.push('/patients')} />
          
          {!isReceptionist && (
            <KPICard title="Pending Results" value={stats.pendingResults} icon={FlaskConical} color="bg-yellow-600" onClick={() => router.push('/reports')} />
          )}
          
          {!isTechnician && (
            <KPICard title={isReceptionist ? "Counter Cash Today" : "Today's Revenue"} value={stats.todayRevenue} prefix="₹" icon={CreditCard} color="bg-green-600" onClick={() => router.push('/billing')} />
          )}
          
          {!isReceptionist && (
            <KPICard title="Critical Cases" value={stats.criticalCases} icon={AlertTriangle} color="bg-red-600" onClick={() => router.push('/reports')} />
          )}
          
          {!isTechnician && !isReceptionist && (
            <KPICard title="Monthly Revenue" value={stats.monthlyRevenue} prefix="₹" icon={TrendingUp} color="bg-indigo-600" onClick={() => router.push('/billing')} />
          )}
          
          {!isTechnician && (
            <KPICard title="Due Collection" value={stats.dueCollection} prefix="₹" icon={Clock} color="bg-orange-600" onClick={() => router.push('/billing')} />
          )}
          
          {isReceptionist && (
            <KPICard title="Pending Delivery" value={stats.pendingDelivery} icon={FileCheck} color="bg-indigo-600" onClick={() => router.push('/reports')} />
          )}
          
          {!isReceptionist && (
            <>
              <KPICard title="Reports Delivered" value={stats.reportsDelivered} icon={FileCheck} color="bg-teal-600" onClick={() => router.push('/reports')} />
              <KPICard title="Tests Done Today" value={stats.testsDoneToday} icon={Activity} color="bg-purple-600" onClick={() => router.push('/reports')} />
            </>
          )}
        </div>

        {/* Status Pipeline */}
        <StatusPipeline counts={stats.pipeline} />

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Revenue Chart / Test Volume Chart */}
          <div className="lg:col-span-3 rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              {currentUser?.role === 'TECHNICIAN'
                ? '7-Day Test Volume Trend'
                : currentUser?.role === 'RECEPTIONIST'
                ? '7-Day Patient Registration Trend'
                : '7-Day Revenue Trend'}
            </h3>
            <div className="h-64 flex flex-col justify-end text-muted-foreground w-full relative">
              {stats.chartData.length > 0 ? (
                <>
                  <svg className="w-full h-[200px]" viewBox="0 0 500 200" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {/* Grid Lines */}
                    <line x1="0" y1="40" x2="500" y2="40" stroke="rgba(156, 163, 175, 0.15)" strokeWidth="1" />
                    <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(156, 163, 175, 0.15)" strokeWidth="1" />
                    <line x1="0" y1="160" x2="500" y2="160" stroke="rgba(156, 163, 175, 0.15)" strokeWidth="1" />

                    {/* Area path */}
                    <path d={chartPoints.area} fill="url(#gradient)" />
                    {/* Line path */}
                    <path d={chartPoints.line} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="3" />
                    
                    {/* Dots */}
                    {chartPoints.dots.map((dot, idx) => (
                      <g key={idx} className="group cursor-pointer">
                        <circle cx={dot.x} cy={dot.y} r="5" fill="rgb(59, 130, 246)" stroke="white" strokeWidth="2" />
                        <circle cx={dot.x} cy={dot.y} r="10" fill="rgb(59, 130, 246)" opacity="0" className="hover:opacity-20 transition-opacity" />
                      </g>
                    ))}
                  </svg>
                  {/* Labels Row */}
                  <div className="flex justify-between mt-2 px-2 text-xs text-muted-foreground font-semibold">
                    {stats.chartData.map((d, idx) => (
                      <div key={idx} className="text-center w-[60px]">
                        <div>{d.name}</div>
                        <div className="text-foreground font-bold">
                          {currentUser?.role === 'TECHNICIAN'
                            ? `${d.count} Tests`
                            : currentUser?.role === 'RECEPTIONIST'
                            ? `${d.patients} Patients`
                            : `₹${d.revenue}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground">No data recorded in the last 7 days.</p>
                </div>
              )}
            </div>
          </div>

          {/* Test Distribution */}
          <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Test Distribution Today</h3>
            <div className="space-y-4">
              {stats.testDistribution.map((cat) => (
                <div key={cat.name} className="flex items-center gap-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${cat.color}`} />
                  <span className="text-xs text-muted-foreground w-24 truncate" title={cat.name}>{cat.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${cat.pct}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className={`h-full rounded-full ${cat.color}`}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground w-8 text-right">{cat.count}</span>
                </div>
              ))}
              {stats.testDistribution.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                  <Activity className="h-8 w-8 text-muted-foreground/30 animate-pulse" />
                  <p className="text-xs">No tests done today yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tables Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={currentUser?.role === 'TECHNICIAN' ? 'lg:col-span-3' : 'lg:col-span-2'}>
            <RecentPatientsTable 
              patients={stats.recentPatients} 
              onView={(orderId) => {
                if (orderId === 0) {
                  router.push('/reports');
                } else {
                  if (currentUser?.role === 'RECEPTIONIST') {
                    router.push(`/reports?orderId=${orderId}`);
                  } else {
                    router.push(`/results/entry?orderId=${orderId}`);
                  }
                }
              }}
              onPrint={(orderId) => {
                router.push(`/reports?orderId=${orderId}`);
              }}
            />
          </div>
          {currentUser?.role !== 'TECHNICIAN' && (
            <div>
              <DuePaymentsTable dues={stats.duePayments} onCollect={() => router.push('/billing')} />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
