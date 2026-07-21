"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, Users, FlaskConical, DollarSign,
  Calendar, ArrowUpRight, ArrowDownRight, Percent,
  ClipboardCheck, Activity, Award, ShieldAlert,
  Inbox, FileText, ChevronRight, Stethoscope, AlertTriangle, AlertCircle, RefreshCw
} from 'lucide-react';
import { formatCurrency } from '@/shared/constants';
import { db } from '@/lib/db';
import { useRouter } from 'next/navigation';

// ─── Animated Counter ───────────────────────────────────
function AnimatedCounter({ value, prefix = '', suffix = '', decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 600;
    const steps = 15;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(current);
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  const formattedCount = decimals > 0 
    ? count.toFixed(decimals)
    : (value >= 1000 ? Math.floor(count).toLocaleString('en-IN') : Math.floor(count));

  return (
    <span className="tabular-nums">
      {prefix}{formattedCount}{suffix}
    </span>
  );
}

// ─── Helper: Get Past 6 Months List ─────────────────────
const getPastMonths = (count = 6) => {
  const result = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({
      name: d.toLocaleString('en-US', { month: 'short' }),
      month: d.getMonth(),
      year: d.getFullYear()
    });
  }
  return result;
};

// ─── Safe Date Parser ──────────────────────────────────
const parseDate = (d: any) => {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'revenue' | 'patients' | 'tests' | 'quality' | 'doctors'>('revenue');
  const [stats, setStats] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const [patients, bills, payments, orders, doctors] = await Promise.all([
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
                },
                results: true
              }
            }
          }
        }),
        db.query('doctor', 'findMany')
      ]);

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const monthsList = getPastMonths(6);

      // ──────────────────────────────────────────
      // 1. REVENUE CALCULATIONS
      // ──────────────────────────────────────────
      const totalRevenue = payments.reduce((sum: number, p: any) => sum + p.amount, 0);
      const totalBillAmount = bills.reduce((sum: number, b: any) => sum + b.totalAmount, 0);
      const averageOrderValue = bills.length > 0 ? Math.round(totalBillAmount / bills.length) : 0;
      const totalDues = bills.reduce((sum: number, b: any) => sum + b.dueAmount, 0);
      
      const todayPayments = payments.filter((p: any) => {
        const pDate = parseDate(p.paidAt);
        return pDate && pDate.getDate() === now.getDate() && pDate.getMonth() === now.getMonth() && pDate.getFullYear() === now.getFullYear();
      });
      const todayRevenue = todayPayments.reduce((sum: number, p: any) => sum + p.amount, 0);

      // Revenue Trend
      const revenueTrend = monthsList.map(m => {
        const amount = payments
          .filter((p: any) => {
            const pDate = parseDate(p.paidAt);
            return pDate && pDate.getMonth() === m.month && pDate.getFullYear() === m.year;
          })
          .reduce((sum: number, p: any) => sum + p.amount, 0);
        return { name: m.name, revenue: amount };
      });

      // Payment method distribution
      const methodCounts: Record<string, number> = {};
      payments.forEach((p: any) => {
        const m = (p.method || 'CASH').toUpperCase();
        methodCounts[m] = (methodCounts[m] || 0) + p.amount;
      });
      const paymentMethods = Object.entries(methodCounts).map(([method, amount]) => ({
        method,
        amount,
        pct: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0
      })).sort((a, b) => b.amount - a.amount);

      // Outstanding bills
      const outstandingDues = bills
        .filter((b: any) => b.dueAmount > 0)
        .map((b: any) => {
          const bDate = parseDate(b.createdAt);
          const dateStr = bDate ? `${String(bDate.getDate()).padStart(2, '0')}/${String(bDate.getMonth() + 1).padStart(2, '0')}/${bDate.getFullYear()}` : '—';
          return {
            id: b.id,
            billNo: b.billNo,
            patientName: b.patient?.name || 'Unknown',
            patientId: b.patientId,
            totalAmount: b.totalAmount,
            paidAmount: b.paidAmount,
            dueAmount: b.dueAmount,
            date: dateStr
          };
        })
        .slice(0, 5);

      // ──────────────────────────────────────────
      // 2. PATIENTS CALCULATIONS
      // ──────────────────────────────────────────
      const totalPatients = patients.length;
      const thisMonthPatients = patients.filter((p: any) => {
        const pDate = parseDate(p.registeredAt || p.createdAt);
        return pDate && pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear;
      }).length;

      // Patients Growth
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const newPatientsLast30 = patients.filter((p: any) => {
        const pDate = parseDate(p.registeredAt || p.createdAt);
        return pDate && pDate >= thirtyDaysAgo;
      }).length;
      const newPatientsPrev30 = patients.filter((p: any) => {
        const pDate = parseDate(p.registeredAt || p.createdAt);
        return pDate && pDate >= sixtyDaysAgo && pDate < thirtyDaysAgo;
      }).length;
      const patientGrowthPct = newPatientsPrev30 > 0 
        ? Math.round(((newPatientsLast30 - newPatientsPrev30) / newPatientsPrev30) * 100) 
        : newPatientsLast30 > 0 ? 100 : 0;

      // Age distribution
      let pediatricCount = 0;
      let adultCount = 0;
      let seniorCount = 0;
      let totalAge = 0;

      patients.forEach((p: any) => {
        const age = p.age || 0;
        totalAge += age;
        if (age <= 18) pediatricCount++;
        else if (age <= 55) adultCount++;
        else seniorCount++;
      });
      const avgAge = totalPatients > 0 ? Math.round(totalAge / totalPatients) : 0;

      const ageGroups = [
        { group: 'Pediatric (0-18)', count: pediatricCount, pct: totalPatients > 0 ? Math.round((pediatricCount / totalPatients) * 100) : 0 },
        { group: 'Adult (19-55)', count: adultCount, pct: totalPatients > 0 ? Math.round((adultCount / totalPatients) * 100) : 0 },
        { group: 'Senior (56+)', count: seniorCount, pct: totalPatients > 0 ? Math.round((seniorCount / totalPatients) * 100) : 0 }
      ];

      // Gender distribution
      let maleCount = 0;
      let femaleCount = 0;
      let otherCount = 0;
      patients.forEach((p: any) => {
        const g = (p.gender || '').toUpperCase();
        if (g === 'MALE') maleCount++;
        else if (g === 'FEMALE') femaleCount++;
        else otherCount++;
      });
      const genders = [
        { gender: 'Male', count: maleCount, pct: totalPatients > 0 ? Math.round((maleCount / totalPatients) * 100) : 0 },
        { gender: 'Female', count: femaleCount, pct: totalPatients > 0 ? Math.round((femaleCount / totalPatients) * 100) : 0 },
        { gender: 'Other', count: otherCount, pct: totalPatients > 0 ? Math.round((otherCount / totalPatients) * 100) : 0 }
      ];

      // Patients trend
      const patientTrend = monthsList.map(m => {
        const count = patients
          .filter((p: any) => {
            const pDate = parseDate(p.registeredAt || p.createdAt);
            return pDate && pDate.getMonth() === m.month && pDate.getFullYear() === m.year;
          })
          .length;
        return { name: m.name, count };
      });

      const emergencyCount = patients.filter((p: any) => p.isEmergency).length;
      const emergencyRate = totalPatients > 0 ? Math.round((emergencyCount / totalPatients) * 100) : 0;

      // ──────────────────────────────────────────
      // 3. TESTS CALCULATIONS
      // ──────────────────────────────────────────
      let totalTestsCount = 0;
      let completedTestsCount = 0;
      let totalTestRevenue = 0;
      const testStatsMap: Record<number, { name: string; code: string; count: number; revenue: number }> = {};
      const catStatsMap: Record<string, { name: string; count: number; revenue: number }> = {};

      orders.forEach((o: any) => {
        const isCompleted = ['APPROVED', 'DELIVERED'].includes(o.status);
        o.items?.forEach((item: any) => {
          totalTestsCount++;
          if (isCompleted) completedTestsCount++;

          if (item.test) {
            const testId = item.test.id;
            const price = item.test.price || 0;
            totalTestRevenue += price;

            // Popular tests
            if (!testStatsMap[testId]) {
              testStatsMap[testId] = {
                name: item.test.name,
                code: item.test.code,
                count: 0,
                revenue: 0
              };
            }
            testStatsMap[testId].count += 1;
            testStatsMap[testId].revenue += price;

            // Category split
            const catName = item.test.category?.name || 'Uncategorized';
            if (!catStatsMap[catName]) {
              catStatsMap[catName] = {
                name: catName,
                count: 0,
                revenue: 0
              };
            }
            catStatsMap[catName].count += 1;
            catStatsMap[catName].revenue += price;
          }
        });
      });

      const avgTestsPerOrder = orders.length > 0 ? Number((totalTestsCount / orders.length).toFixed(1)) : 0;
      const topTests = Object.values(testStatsMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const categoryColors: Record<string, string> = {
        Hematology: 'bg-blue-500',
        Biochemistry: 'bg-green-500',
        Serology: 'bg-purple-500',
        Microbiology: 'bg-yellow-500',
        'Clinical Pathology': 'bg-pink-500',
        Immunology: 'bg-indigo-500',
      };

      const testCategories = Object.values(catStatsMap).map(c => ({
        name: c.name,
        count: c.count,
        pct: totalTestsCount > 0 ? Math.round((c.count / totalTestsCount) * 100) : 0,
        revenue: c.revenue,
        color: categoryColors[c.name] || 'bg-gray-500'
      })).sort((a, b) => b.count - a.count);

      // ──────────────────────────────────────────
      // 4. QUALITY CALCULATIONS
      // ──────────────────────────────────────────
      let tatCompliantCount = 0;
      let tatTotalCount = 0;
      const overdueOrders: any[] = [];
      const criticalResults: any[] = [];

      orders.forEach((o: any) => {
        // Collect critical alerts
        o.items?.forEach((item: any) => {
          item.results?.forEach((res: any) => {
            if (res.isCritical) {
              const resDate = parseDate(res.enteredAt || o.createdAt);
              const formattedResDate = resDate ? `${String(resDate.getDate()).padStart(2, '0')}/${String(resDate.getMonth() + 1).padStart(2, '0')} ${resDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—';
              
              criticalResults.push({
                id: res.id,
                patientName: o.patient?.name || 'Unknown',
                patientId: o.patientId,
                testName: item.test?.shortName || item.test?.name || 'Test',
                enteredAt: formattedResDate,
                flag: res.flag || '!!',
                value: res.numericValue !== null ? res.numericValue : res.textValue
              });
            }
          });
        });

        // Collect TAT Compliance
        if (!o.expectedAt) return;
        tatTotalCount++;
        const expectedDate = parseDate(o.expectedAt);
        if (!expectedDate) return;

        const isCompleted = ['APPROVED', 'DELIVERED'].includes(o.status);
        if (isCompleted) {
          const completedDate = parseDate(o.deliveredAt || o.updatedAt);
          if (completedDate && completedDate <= expectedDate) {
            tatCompliantCount++;
          }
        } else {
          const currentDate = new Date();
          if (currentDate <= expectedDate) {
            tatCompliantCount++;
          } else {
            const diffHrs = Math.max(0, Math.round((currentDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60)));
            overdueOrders.push({
              id: o.id,
              orderNo: o.orderNo,
              patientName: o.patient?.name || 'Unknown',
              tests: o.items?.map((item: any) => item.test?.shortName || item.test?.name || '').filter(Boolean).join(', ') || 'No tests',
              expectedAt: o.expectedAt,
              status: o.status,
              delayHours: diffHrs
            });
          }
        }
      });

      const tatCompliance = tatTotalCount > 0 ? Math.round((tatCompliantCount / tatTotalCount) * 100) : 100;
      const averageDelay = overdueOrders.length > 0 
        ? Number((overdueOrders.reduce((sum, item) => sum + item.delayHours, 0) / overdueOrders.length).toFixed(1))
        : 0;

      // Inventory warning
      let lowStockCount = 0;
      let lowStockItems: any[] = [];
      if (typeof window !== 'undefined') {
        const storedInventory = localStorage.getItem('pathology_lab_inventory');
        if (storedInventory) {
          try {
            const inv = JSON.parse(storedInventory);
            lowStockItems = inv.filter((item: any) => item.status === 'low' || item.status === 'critical');
            lowStockCount = lowStockItems.length;
          } catch (e) {}
        }
      }

      // ──────────────────────────────────────────
      // 5. DOCTORS CALCULATIONS
      // ──────────────────────────────────────────
      const doctorStatsMap: Record<string, { id: number | string; name: string; hospital: string; count: number; revenue: number; commission: number }> = {};

      doctors.forEach((doc: any) => {
        doctorStatsMap[doc.id] = {
          id: doc.id,
          name: doc.name,
          hospital: doc.hospital || 'Private Clinic',
          count: 0,
          revenue: 0,
          commission: doc.commission || 0
        };
      });

      // Self Referrals
      doctorStatsMap['self'] = {
        id: 'self',
        name: 'Self / Walk-in',
        hospital: 'N/A',
        count: 0,
        revenue: 0,
        commission: 0
      };

      bills.forEach((b: any) => {
        const docId = b.patient?.referredDoctorId;
        const targetId = docId && doctorStatsMap[docId] ? docId : 'self';
        doctorStatsMap[targetId].count += 1;
        doctorStatsMap[targetId].revenue += b.totalAmount || 0;
      });

      const doctorsList = Object.values(doctorStatsMap)
        .map(doc => {
          const commissionOwed = doc.id === 'self' ? 0 : Math.round(doc.revenue * (doc.commission / 100));
          return {
            ...doc,
            commissionOwed
          };
        })
        .sort((a, b) => b.revenue - a.revenue);

      const totalReferralCases = doctorsList.filter(d => d.id !== 'self').reduce((sum, d) => sum + d.count, 0);
      const referredRevenue = doctorsList.filter(d => d.id !== 'self').reduce((sum, d) => sum + d.revenue, 0);
      const totalCommissionOwed = doctorsList.filter(d => d.id !== 'self').reduce((sum, d) => sum + d.commissionOwed, 0);
      const referringDoctorsCount = doctors.filter((d: any) => d.isActive).length;

      // ──────────────────────────────────────────
      // SET ALL STATE
      // ──────────────────────────────────────────
      setStats({
        revenue: {
          total: totalRevenue,
          aov: averageOrderValue,
          dues: totalDues,
          today: todayRevenue,
          methods: paymentMethods,
          trend: revenueTrend,
          outstandingDues
        },
        patients: {
          total: totalPatients,
          newThisMonth: thisMonthPatients,
          growth: patientGrowthPct,
          avgAge,
          emergencyRate,
          genders,
          ageGroups,
          trend: patientTrend
        },
        tests: {
          total: totalTestsCount,
          completed: completedTestsCount,
          ratio: avgTestsPerOrder,
          revenue: totalTestRevenue,
          topTests,
          categories: testCategories
        },
        quality: {
          tatCompliance,
          avgDelay: averageDelay,
          lowStockCount,
          criticalCount: criticalResults.length,
          overdueOrders,
          criticalResults: criticalResults.slice(0, 5),
          lowStockItems: lowStockItems.slice(0, 5)
        },
        doctors: {
          referrals: totalReferralCases,
          referredRevenue,
          commissionOwed: totalCommissionOwed,
          doctorsCount: referringDoctorsCount,
          list: doctorsList
        }
      });

    } catch (err: any) {
      console.error('Failed to calculate analytics:', err);
      setToast({ message: `Failed to calculate analytics: ${err?.message || err}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  // SVG Line Chart calculations for Revenue Tab
  const revenuePoints = useMemo(() => {
    if (!stats || !stats.revenue.trend || stats.revenue.trend.length === 0) return { line: '', area: '', dots: [] };
    const trend = stats.revenue.trend;
    const maxVal = Math.max(...trend.map((d: any) => d.revenue), 1000);
    const width = 600;
    const height = 180;
    const padding = 20;
    
    const points = trend.map((d: any, i: number) => {
      const x = padding + (i / (trend.length - 1)) * (width - 2 * padding);
      const y = height - padding - (d.revenue / maxVal) * (height - 2 * padding);
      return { x, y, name: d.name, value: d.revenue };
    });

    const line = points.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const area = `${line} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
    return { line, area, dots: points };
  }, [stats]);

  if (loading) {
    return (
      <AppLayout title="Analytics" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Analytics' }]}>
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          <p className="text-muted-foreground font-semibold text-lg animate-pulse">Generating Analytical Reports...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Analytics" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Analytics' }]}>
      <div className="space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-border overflow-x-auto pb-px">
          {[
            { id: 'revenue', label: 'Revenue & Finance', icon: DollarSign },
            { id: 'patients', label: 'Patient Demographics', icon: Users },
            { id: 'tests', label: 'Test Profiles', icon: FlaskConical },
            { id: 'quality', label: 'Quality & TAT', icon: Activity },
            { id: 'doctors', label: 'Doctor Referrals', icon: Stethoscope }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-200 whitespace-nowrap
                  ${isActive 
                    ? 'border-primary text-primary bg-primary/5' 
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'}`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            
            {/* ─── REVENUE TAB ────────────────────────────────────── */}
            {activeTab === 'revenue' && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Total Revenue</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.revenue.total} prefix="₹" />
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-0.5">
                      <ArrowUpRight className="h-4 w-4" /> Cumulative payment collection
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Average Order Value</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.revenue.aov} prefix="₹" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Avg billing amount per patient</p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Outstanding Dues</p>
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">
                      <AnimatedCounter value={stats.revenue.dues} prefix="₹" />
                    </p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">Uncollected pending bills</p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Today&apos;s Collection</p>
                    <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                      <AnimatedCounter value={stats.revenue.today} prefix="₹" />
                    </p>
                    <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 mt-1">Received on today&apos;s date</p>
                  </div>
                </div>

                {/* Graph + Payment Methods */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  {/* Revenue Trend Chart */}
                  <div className="lg:col-span-3 rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Monthly Revenue Trend</h3>
                      <p className="text-xs text-muted-foreground mb-4">Total payments collected in past 6 months</p>
                    </div>
                    <div className="h-48 w-full relative mt-4">
                      {stats.revenue.trend.length > 1 ? (
                        <svg className="w-full h-full" viewBox="0 0 600 180" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {/* Grid Lines */}
                          <line x1="0" y1="20" x2="600" y2="20" stroke="rgba(156, 163, 175, 0.1)" strokeWidth="1" />
                          <line x1="0" y1="90" x2="600" y2="90" stroke="rgba(156, 163, 175, 0.1)" strokeWidth="1" />
                          <line x1="0" y1="160" x2="600" y2="160" stroke="rgba(156, 163, 175, 0.1)" strokeWidth="1" />

                          {/* Graph Paths */}
                          <path d={revenuePoints.area} fill="url(#revGrad)" />
                          <path d={revenuePoints.line} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="3" />

                          {/* Interactive dots */}
                          {revenuePoints.dots.map((dot: any, idx: number) => (
                            <g key={idx} className="group cursor-pointer">
                              <circle cx={dot.x} cy={dot.y} r="5" fill="rgb(59, 130, 246)" stroke="white" strokeWidth="2" />
                              <circle cx={dot.x} cy={dot.y} r="10" fill="rgb(59, 130, 246)" opacity="0" className="hover:opacity-20 transition-opacity" />
                            </g>
                          ))}
                        </svg>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-xs">Insufficient records for chart.</div>
                      )}
                    </div>
                    {/* Month labels */}
                    <div className="flex justify-between px-2 text-xs font-semibold text-muted-foreground mt-2">
                      {stats.revenue.trend.map((t: any) => (
                        <div key={t.name} className="text-center w-12">
                          <div>{t.name}</div>
                          <div className="text-foreground font-bold">₹{t.revenue.toLocaleString('en-IN')}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Method Split */}
                  <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Payment Method Breakdown</h3>
                      <p className="text-xs text-muted-foreground mb-6">Distribution by collection channel</p>
                    </div>
                    <div className="space-y-4 flex-1 flex flex-col justify-center">
                      {stats.revenue.methods.map((method: any) => (
                        <div key={method.method} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-foreground">{method.method}</span>
                            <span className="text-muted-foreground">{formatCurrency(method.amount)} ({method.pct}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${method.pct}%` }}
                              transition={{ duration: 0.8 }}
                              className="h-full rounded-full bg-primary"
                            />
                          </div>
                        </div>
                      ))}
                      {stats.revenue.methods.length === 0 && (
                        <div className="text-center py-8 text-xs text-muted-foreground">No payments recorded.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Outstanding Dues List */}
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Top Outstanding Dues</h3>
                    <button onClick={() => router.push('/billing')} className="text-xs text-primary hover:underline">Collect Outstanding →</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Bill No</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Patient</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Date</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-right">Total Amount</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-right">Paid Amount</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-right text-red-600 dark:text-red-400">Due Outstanding</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.revenue.outstandingDues.map((b: any) => (
                          <tr key={b.id} className="border-b hover:bg-accent/40 transition-colors">
                            <td className="px-5 py-3.5 font-mono text-xs font-semibold text-primary">{b.billNo}</td>
                            <td className="px-5 py-3.5 font-medium text-foreground">{b.patientName}</td>
                            <td className="px-5 py-3.5 text-muted-foreground text-xs">{b.date}</td>
                            <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(b.totalAmount)}</td>
                            <td className="px-5 py-3.5 text-right text-green-600 font-medium">{formatCurrency(b.paidAmount)}</td>
                            <td className="px-5 py-3.5 text-right text-red-600 dark:text-red-400 font-bold">{formatCurrency(b.dueAmount)}</td>
                            <td className="px-5 py-3.5 text-center">
                              <button
                                onClick={() => router.push('/billing')}
                                className="px-4 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold min-h-[36px] inline-flex items-center justify-center"
                              >
                                Collect
                              </button>
                            </td>
                          </tr>
                        ))}
                        {stats.revenue.outstandingDues.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-5 py-8 text-center text-xs text-muted-foreground">No outstanding bills found! Everything is fully paid.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ─── PATIENTS TAB ────────────────────────────────────── */}
            {activeTab === 'patients' && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Total Patient Base</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.patients.total} />
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-0.5">
                      <ArrowUpRight className="h-4 w-4" /> Registered in database
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Registered This Month</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.patients.newThisMonth} />
                    </p>
                    <p className="text-xs text-primary font-medium mt-1">
                      {stats.patients.growth >= 0 ? `+${stats.patients.growth}%` : `${stats.patients.growth}%`} vs prev month
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Average Patient Age</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.patients.avgAge} suffix=" Yrs" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">Standard age coefficient</p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Emergency Patients Rate</p>
                    <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                      <AnimatedCounter value={stats.patients.emergencyRate} suffix="%" />
                    </p>
                    <p className="text-xs text-orange-500 mt-1 font-semibold">Priority registration cases</p>
                  </div>
                </div>

                {/* Graph + Age Groups */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  {/* Patients Growth Trend */}
                  <div className="lg:col-span-3 rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Monthly Registration Volume</h3>
                      <p className="text-xs text-muted-foreground">New registered patients per month</p>
                    </div>
                    
                    <div className="flex items-end gap-4 h-48 mt-6">
                      {stats.patients.trend.map((m: any, i: number) => {
                        const maxVal = Math.max(...stats.patients.trend.map((d: any) => d.count), 1);
                        const heightPct = (m.count / maxVal) * 100;
                        return (
                          <div key={m.name} className="flex-1 flex flex-col items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{m.count}</span>
                            <div className="w-full bg-muted/30 rounded-t-lg h-32 flex items-end overflow-hidden">
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${heightPct}%` }}
                                transition={{ delay: i * 0.05, duration: 0.5 }}
                                className="w-full rounded-t-lg bg-indigo-500/80 hover:bg-indigo-500 transition-colors cursor-pointer min-h-[4px]"
                              />
                            </div>
                            <span className="text-xs text-muted-foreground font-semibold">{m.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Demographics Age & Gender */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Age Groups */}
                    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Age Cohort Distribution</h3>
                      <div className="space-y-3">
                        {stats.patients.ageGroups.map((group: any) => (
                          <div key={group.group} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground">{group.group}</span>
                              <span className="text-muted-foreground">{group.count} pts ({group.pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${group.pct}%` }}
                                transition={{ duration: 0.8 }}
                                className="h-full rounded-full bg-primary"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Gender Breakdown */}
                    <div className="rounded-xl border bg-card p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-foreground mb-4">Gender Classification</h3>
                      <div className="grid grid-cols-3 gap-2">
                        {stats.patients.genders.map((g: any) => (
                          <div key={g.gender} className="bg-muted/40 p-3 rounded-lg text-center">
                            <span className="text-xs text-muted-foreground font-semibold block">{g.gender}</span>
                            <span className="text-lg font-bold text-foreground block mt-1">{g.count}</span>
                            <span className="text-[11px] text-primary font-bold mt-0.5 inline-block px-1.5 py-0.5 bg-primary/10 rounded">{g.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── TESTS TAB ────────────────────────────────────── */}
            {activeTab === 'tests' && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Tests Ordered</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.tests.total} />
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-0.5">
                      <ArrowUpRight className="h-4 w-4" /> Total test panels prescribed
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Tests / Order Ratio</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.tests.ratio} decimals={1} />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Average tests prescribed per patient</p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Generated Test Revenue</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.tests.revenue} prefix="₹" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Gross worth of booked tests</p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Completed & Verified</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                      <AnimatedCounter value={stats.tests.completed} />
                    </p>
                    <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-1">Reports fully verified</p>
                  </div>
                </div>

                {/* Top Tests Table + Category Distribution */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  {/* Top Tests List */}
                  <div className="lg:col-span-3 rounded-xl border bg-card p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-4">Top Ordered Tests</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="px-5 py-3.5 font-semibold uppercase tracking-wider w-16">Rank</th>
                            <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Test Name</th>
                            <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Code</th>
                            <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-center">Orders</th>
                            <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-right">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.tests.topTests.map((t: any, i: number) => (
                            <tr key={t.code} className="border-b hover:bg-accent/40 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-primary text-center">{i + 1}</td>
                              <td className="px-5 py-3.5 font-medium text-foreground">{t.name}</td>
                              <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{t.code}</td>
                              <td className="px-5 py-3.5 text-center font-bold">{t.count}</td>
                              <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(t.revenue)}</td>
                            </tr>
                          ))}
                          {stats.tests.topTests.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-5 py-8 text-center text-xs text-muted-foreground">No test ordering data exists.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Category Splits */}
                  <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-foreground mb-4">Departmental Share</h3>
                    <div className="space-y-4">
                      {stats.tests.categories.map((cat: any) => (
                        <div key={cat.name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className={`h-2.5 w-2.5 rounded-full ${cat.color}`} />
                              <span className="font-medium text-foreground">{cat.name}</span>
                            </div>
                            <span className="text-muted-foreground font-semibold">{cat.count} tests ({cat.pct}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${cat.pct}%` }}
                              transition={{ duration: 0.8 }}
                              className={`h-full rounded-full ${cat.color}`}
                            />
                          </div>
                        </div>
                      ))}
                      {stats.tests.categories.length === 0 && (
                        <div className="text-center py-12 text-xs text-muted-foreground">No test category logs available.</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── QUALITY & TAT TAB ────────────────────────────────────── */}
            {activeTab === 'quality' && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">TAT Compliance Rate</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.quality.tatCompliance} suffix="%" />
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-0.5">
                      <ArrowUpRight className="h-4 w-4" /> Met expectation deadlines
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Avg Overdue Delay</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.quality.avgDelay} decimals={1} suffix=" Hrs" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Delay coefficient on breach orders</p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all font-sans">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Low Stock Indicators</p>
                    <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                      <AnimatedCounter value={stats.quality.lowStockCount} />
                    </p>
                    <p className="text-xs text-orange-500 mt-1 font-semibold">Items below safety trigger levels</p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Critical Alerts Triggered</p>
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">
                      <AnimatedCounter value={stats.quality.criticalCount} />
                    </p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">Requires immediate attention</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  {/* Overdue/Breached orders */}
                  <div className="lg:col-span-3 rounded-xl border bg-card p-5 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Current Overdue TAT Breaches</h3>
                        <p className="text-xs text-muted-foreground">Active orders requiring rapid processing</p>
                      </div>
                      <button onClick={() => router.push('/reports')} className="text-xs text-primary hover:underline">View Pipeline →</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Order No</th>
                            <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Patient</th>
                            <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Prescribed Tests</th>
                            <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-center text-red-500">Delay Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.quality.overdueOrders.map((o: any) => (
                            <tr key={o.id} className="border-b hover:bg-accent/40 transition-colors">
                              <td className="px-5 py-3.5 font-mono text-xs font-semibold text-primary">{o.orderNo}</td>
                              <td className="px-5 py-3.5 font-medium text-foreground">{o.patientName}</td>
                              <td className="px-5 py-3.5 text-muted-foreground text-xs truncate max-w-[150px]" title={o.tests}>{o.tests}</td>
                              <td className="px-5 py-3.5 text-center text-red-500 font-bold font-mono text-xs">+{o.delayHours} Hrs</td>
                            </tr>
                          ))}
                          {stats.quality.overdueOrders.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-5 py-8 text-center text-xs text-muted-foreground">Zero delay alerts. Turnaround compliance is at 100%!</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Stock Warnings & Critical Logs */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Critical Results Log */}
                    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Recent Critical Value Alerts</h3>
                      <div className="space-y-2">
                        {stats.quality.criticalResults.map((r: any) => (
                          <div key={r.id} className="flex items-center justify-between p-2 rounded bg-red-500/10 border border-red-500/20 text-xs">
                            <div>
                              <p className="font-semibold text-foreground">{r.patientName}</p>
                              <p className="text-muted-foreground text-xs font-semibold">{r.testName} • {r.enteredAt}</p>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-red-600 dark:text-red-400 text-sm font-mono">{r.value}</span>
                              <span className="block text-[11px] font-bold text-red-500 uppercase tracking-wider">{r.flag} Critical</span>
                            </div>
                          </div>
                        ))}
                        {stats.quality.criticalResults.length === 0 && (
                          <p className="text-xs text-muted-foreground py-6 text-center">No critical results reported.</p>
                        )}
                      </div>
                    </div>

                    {/* Stock Warnings */}
                    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-foreground">Stock Alert Levels</h3>
                        <button onClick={() => router.push('/inventory')} className="text-xs text-primary hover:underline">Reorder</button>
                      </div>
                      <div className="space-y-2">
                        {stats.quality.lowStockItems.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs">
                            <div>
                              <p className="font-semibold text-foreground">{item.name}</p>
                              <p className="text-muted-foreground text-xs font-semibold">{item.category} • Supplier: {item.supplier}</p>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-yellow-600 dark:text-yellow-400 font-mono text-sm">{item.stock} {item.unit}</span>
                              <span className="block text-[11px] font-bold text-muted-foreground">Min required: {item.min}</span>
                            </div>
                          </div>
                        ))}
                        {stats.quality.lowStockItems.length === 0 && (
                          <p className="text-xs text-muted-foreground py-6 text-center">All reagent levels are safe and normal.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── DOCTORS TAB ────────────────────────────────────── */}
            {activeTab === 'doctors' && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Referred Cases</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.doctors.referrals} />
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-0.5">
                      <ArrowUpRight className="h-4 w-4" /> Patients referred by doctors
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Referred Bill Value</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.doctors.referredRevenue} prefix="₹" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Total billings generated by referrals</p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Est Commission Owed</p>
                    <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                      <AnimatedCounter value={stats.doctors.commissionOwed} prefix="₹" />
                    </p>
                    <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 mt-1">Accumulated referral commissions</p>
                  </div>
                  <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Active Referring Network</p>
                    <p className="text-3xl font-bold text-foreground mt-1">
                      <AnimatedCounter value={stats.doctors.doctorsCount} />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Doctors referred at least 1 case</p>
                  </div>
                </div>

                {/* Referral Summary Table */}
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-foreground">Doctor Referral & Commissions Board</h3>
                    <button onClick={() => router.push('/doctors')} className="text-xs text-primary hover:underline">Manage Doctors →</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Doctor Name</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider">Hospital & Qualifications</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-center">Patients Referred</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-right">Referral Billing</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-center">Commission %</th>
                          <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-right text-indigo-600 dark:text-indigo-400">Total Owed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.doctors.list.map((d: any) => (
                          <tr key={d.id} className="border-b hover:bg-accent/40 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${d.id === 'self' ? 'bg-muted' : 'bg-primary'}`} />
                                <span className="font-semibold text-foreground">{d.name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-muted-foreground text-xs">{d.hospital}</td>
                            <td className="px-5 py-3.5 text-center font-bold">{d.count}</td>
                            <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(d.revenue)}</td>
                            <td className="px-5 py-3.5 text-center font-semibold font-mono text-xs">{d.commission}%</td>
                            <td className="px-5 py-3.5 text-right text-indigo-600 dark:text-indigo-400 font-bold">{formatCurrency(d.commissionOwed)}</td>
                          </tr>
                        ))}
                        {stats.doctors.list.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-5 py-8 text-center text-xs text-muted-foreground">No referring doctors found in database logs.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {toast && (
        <div className={`toast-global toast-${toast.type} fixed bottom-6 right-6 z-[200]`}>
          <span>{toast.message}</span>
        </div>
      )}
    </AppLayout>
  );
}
