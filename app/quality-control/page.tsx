"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Plus, AlertTriangle, CheckCircle, XCircle, Trash2, X, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine, 
  ResponsiveContainer 
} from 'recharts';

interface QCRecord {
  id: number;
  test: string;
  param: string;
  batch: string;
  level: string;
  expected: number;
  measured: number;
  deviation: number;
  cv: number;
  status: string;
  date: string;
  timestamp: number;
}

const statusConfig: Record<string, { icon: React.ElementType; style: string }> = {
  PASS: { icon: CheckCircle, style: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400' },
  FAIL: { icon: XCircle, style: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' },
  WARNING: { icon: AlertTriangle, style: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400' },
};

const emptyForm = { test: '', param: '', batch: '', level: 'Level 1', expected: '', measured: '' };

export default function QualityControlPage() {
  const [qcRecords, setQcRecords] = useState<QCRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Selection states for LJ Chart
  const [selectedTest, setSelectedTest] = useState<string>('');
  const [selectedParam, setSelectedParam] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('Level 1');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function loadQC() {
    setLoading(true);
    try {
      let data = await db.query('qcResult', 'findMany', {
        orderBy: { date: 'desc' }
      });
      
      // Only real QC runs are shown: entered here or received from an analyzer (QC-/CONTROL- sample IDs).

      if (data) {
        const formatted: QCRecord[] = data.map((d: any) => ({
          id: d.id,
          test: d.testName,
          param: d.parameterName,
          batch: d.batchNumber,
          level: d.level,
          expected: d.expectedValue,
          measured: d.measuredValue,
          deviation: d.deviation,
          cv: d.cv,
          status: d.status,
          date: new Date(d.date).toLocaleDateString(),
          timestamp: new Date(d.date).getTime()
        }));
        setQcRecords(formatted);
      }
    } catch (error) {
      console.error('Failed to load QC records:', error);
      setToast({ message: 'Failed to load QC records from database', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQC();
  }, []);

  // Listen to IPC event when machine saves a QC result automatically
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const api = (window as any).electronAPI;
      if (api.onQcSaved) {
        const unsubscribe = api.onQcSaved((eventData: any) => {
          setToast({ message: `Machine QC results received: ${eventData.batch}`, type: 'success' });
          loadQC();
        });
        return () => {
          if (unsubscribe) unsubscribe();
        };
      }
    }
  }, []);

  // Auto-selection of dropdowns
  useEffect(() => {
    if (qcRecords.length > 0) {
      const tests = Array.from(new Set(qcRecords.map(q => q.test)));
      if (tests.length > 0 && !selectedTest) {
        setSelectedTest(tests[0]);
      }
    }
  }, [qcRecords, selectedTest]);

  useEffect(() => {
    if (qcRecords.length > 0 && selectedTest) {
      const params = Array.from(new Set(qcRecords.filter(q => q.test === selectedTest).map(q => q.param)));
      if (params.length > 0 && (!selectedParam || !params.includes(selectedParam))) {
        setSelectedParam(params[0]);
      }
    }
  }, [qcRecords, selectedTest, selectedParam]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const passCount = qcRecords.filter(q => q.status === 'PASS').length;
  const warnCount = qcRecords.filter(q => q.status === 'WARNING').length;
  const failCount = qcRecords.filter(q => q.status === 'FAIL').length;
  const passRate = qcRecords.length > 0 ? ((passCount / qcRecords.length) * 100).toFixed(1) : '0.0';

  const handleAdd = async () => {
    if (!form.test.trim() || !form.param.trim() || !form.expected || !form.measured) {
      setToast({ message: 'Test, parameter, expected and measured values are required', type: 'error' });
      return;
    }
    const expected = Number(form.expected);
    const measured = Number(form.measured);
    const deviation = Number((measured - expected).toFixed(4));
    const cv = expected !== 0 ? Number(((Math.abs(deviation) / expected) * 100).toFixed(2)) : 0;
    
    let status = 'PASS';
    if (cv > 15) status = 'FAIL';
    else if (cv >= 5) status = 'WARNING';

    const today = new Date();
    const batch = form.batch || `QC-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;

    try {
      await db.query('qcResult', 'create', {
        data: {
          testName: form.test,
          parameterName: form.param,
          batchNumber: batch,
          level: form.level,
          expectedValue: expected,
          measuredValue: measured,
          deviation,
          cv,
          status,
          date: today
        }
      });
      
      setForm(emptyForm);
      setShowModal(false);
      setToast({ message: `QC record added — ${status}`, type: status === 'FAIL' ? 'error' : 'success' });
      loadQC();
    } catch (e) {
      console.error(e);
      setToast({ message: 'Failed to add QC record to database', type: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await db.query('qcResult', 'delete', {
        where: { id }
      });
      setToast({ message: 'QC record deleted successfully', type: 'success' });
      loadQC();
    } catch (e) {
      console.error(e);
      setToast({ message: 'Failed to delete QC record', type: 'error' });
    }
  };

  // Get unique tests/params/levels for dropdown select in chart panel
  const uniqueTests = Array.from(new Set(qcRecords.map(q => q.test)));
  const uniqueParams = Array.from(new Set(qcRecords.filter(q => q.test === selectedTest).map(q => q.param)));
  const uniqueLevels = ['Level 1', 'Level 2', 'Level 3'];

  // Filter and sort records chronologically for chart
  const chartRecords = qcRecords
    .filter(q => q.test === selectedTest && q.param === selectedParam && q.level === selectedLevel)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Mean & SD Calculations
  let mean = 0;
  let sd = 0.1;
  let targetVal = 10;
  
  if (chartRecords.length > 0) {
    targetVal = chartRecords[0].expected;
    const sum = chartRecords.reduce((acc, r) => acc + r.measured, 0);
    mean = sum / chartRecords.length;
    
    // Variance and SD
    const variance = chartRecords.reduce((acc, r) => acc + Math.pow(r.measured - mean, 2), 0) / chartRecords.length;
    sd = Math.sqrt(variance) || (mean * 0.05); // fallback to 5% CV
  }

  // Evaluate Westgard Rules
  const westgardViolations: { batch: string; rule: string; type: 'warning' | 'error'; date: string; value: number }[] = [];
  chartRecords.forEach((r, idx) => {
    const devSD = (r.measured - mean) / sd;
    
    // 1_3s Rule: Single run outside 3 SD (Error)
    if (Math.abs(devSD) > 3) {
      westgardViolations.push({
        batch: r.batch,
        rule: '1_3s Rule (Measured value exceeds Mean ± 3 SD) — Critical Failure',
        type: 'error',
        date: r.date,
        value: r.measured
      });
      return;
    }
    
    // 1_2s Rule: Single run outside 2 SD (Warning)
    if (Math.abs(devSD) > 2) {
      westgardViolations.push({
        batch: r.batch,
        rule: '1_2s Rule (Measured value exceeds Mean ± 2 SD) — Warning Check',
        type: 'warning',
        date: r.date,
        value: r.measured
      });
    }

    // 2_2s Rule: Two consecutive runs exceed 2 SD on same side (Error)
    if (idx > 0) {
      const prevRun = chartRecords[idx - 1];
      const prevDevSD = (prevRun.measured - mean) / sd;
      if (devSD > 2 && prevDevSD > 2) {
        westgardViolations.push({
          batch: r.batch,
          rule: '2_2s Rule (Two consecutive runs exceed +2 SD) — Calibration Failure',
          type: 'error',
          date: r.date,
          value: r.measured
        });
      } else if (devSD < -2 && prevDevSD < -2) {
        westgardViolations.push({
          batch: r.batch,
          rule: '2_2s Rule (Two consecutive runs exceed -2 SD) — Calibration Failure',
          type: 'error',
          date: r.date,
          value: r.measured
        });
      }
    }
  });

  return (
    <AppLayout title="Quality Control (QC)" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Quality Control' }]}>
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 flex-1">
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">QC Pass Rate</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{passRate}%</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Runs</p>
              <p className="text-3xl font-bold text-primary mt-1">{qcRecords.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Warnings</p>
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{warnCount}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Failures</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{failCount}</p>
            </div>
          </div>
          <div className="flex items-center lg:self-center">
            <motion.button 
              whileHover={{ scale: 1.02 }} 
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow shadow-sm" 
              onClick={() => { setForm(emptyForm); setShowModal(true); }}
            >
              <Plus className="h-4 w-4" />
              Add QC Record
            </motion.button>
          </div>
        </div>

        {/* Levey-Jennings Chart Control & Visualization Card */}
        <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h3 className="text-md font-bold text-foreground flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Levey-Jennings QC Chart
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Displays control runs relative to Mean & Standard Deviation levels.
              </p>
            </div>

            {/* Dropdown Selectors */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Test</label>
                <select
                  value={selectedTest}
                  onChange={e => { setSelectedTest(e.target.value); setSelectedParam(''); }}
                  className="rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold"
                >
                  {uniqueTests.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  {uniqueTests.length === 0 && <option value="">No QC Data</option>}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Parameter</label>
                <select
                  value={selectedParam}
                  onChange={e => setSelectedParam(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold"
                >
                  {uniqueParams.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  {uniqueParams.length === 0 && <option value="">No Parameters</option>}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Control Level</label>
                <select
                  value={selectedLevel}
                  onChange={e => setSelectedLevel(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold"
                >
                  {uniqueLevels.map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Chart Rendering */}
          <div className="h-72 w-full mt-4 bg-muted/10 rounded-xl border border-border/50 p-3 relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-card/60">
                <p className="text-sm font-semibold text-muted-foreground animate-pulse">Loading QC records...</p>
              </div>
            ) : chartRecords.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm font-semibold text-muted-foreground">
                  No data points found for {selectedTest} &rarr; {selectedParam} ({selectedLevel})
                </p>
              </div>
            ) : !mounted ? (
              <div className="h-full bg-muted/20 animate-pulse rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartRecords}
                  margin={{ top: 10, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }} 
                    stroke="currentColor" 
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    domain={[
                      Number((mean - 4 * sd).toFixed(2)), 
                      Number((mean + 4 * sd).toFixed(2))
                    ]} 
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
                    labelFormatter={(label) => `Run Date: ${label}`}
                    formatter={(value: any, name: any, props: any) => [
                      `${value} (Target: ${props.payload.expected})`, 
                      `Batch: ${props.payload.batch}`
                    ]}
                  />

                  {/* Reference SD Gridlines */}
                  <ReferenceLine y={mean} stroke="#22c55e" strokeWidth={1.5} label={{ value: 'Mean', fill: '#22c55e', fontSize: 10, position: 'insideRight' }} />
                  
                  <ReferenceLine y={mean + sd} stroke="#eab308" strokeDasharray="3 3" label={{ value: '+1 SD', fill: '#eab308', fontSize: 9, position: 'insideRight' }} />
                  <ReferenceLine y={mean - sd} stroke="#eab308" strokeDasharray="3 3" label={{ value: '-1 SD', fill: '#eab308', fontSize: 9, position: 'insideRight' }} />
                  
                  <ReferenceLine y={mean + 2 * sd} stroke="#f97316" strokeDasharray="3 3" label={{ value: '+2 SD', fill: '#f97316', fontSize: 9, position: 'insideRight' }} />
                  <ReferenceLine y={mean - 2 * sd} stroke="#f97316" strokeDasharray="3 3" label={{ value: '-2 SD', fill: '#f97316', fontSize: 9, position: 'insideRight' }} />
                  
                  <ReferenceLine y={mean + 3 * sd} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '+3 SD', fill: '#ef4444', fontSize: 9, position: 'insideRight' }} />
                  <ReferenceLine y={mean - 3 * sd} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '-3 SD', fill: '#ef4444', fontSize: 9, position: 'insideRight' }} />

                  {/* Measured values line */}
                  <Line 
                    type="monotone" 
                    dataKey="measured" 
                    stroke="var(--color-primary, #6366f1)" 
                    strokeWidth={2.5}
                    activeDot={{ r: 6 }}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      const devSD = (payload.measured - mean) / sd;
                      let fill = 'var(--color-primary, #6366f1)';
                      let r = 4;
                      if (Math.abs(devSD) > 3) {
                        fill = '#ef4444'; // Red for out-of-control
                        r = 6;
                      } else if (Math.abs(devSD) > 2) {
                        fill = '#f97316'; // Orange for warning
                        r = 5.5;
                      }
                      return (
                        <circle key={payload.id} cx={cx} cy={cy} r={r} fill={fill} stroke="#fff" strokeWidth={1} />
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          
          {/* Mean, SD and Target Metrics */}
          {chartRecords.length > 0 && (
            <div className="grid grid-cols-3 gap-4 border-t border-border/60 mt-4 pt-4 text-xs font-semibold">
              <div className="text-center border-r">
                <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Manufacturer Target</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{targetVal.toFixed(2)}</p>
              </div>
              <div className="text-center border-r">
                <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Calculated Mean (N={chartRecords.length})</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{mean.toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Calculated Standard Deviation (SD)</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{sd.toFixed(4)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Westgard Rules Checker Panel */}
        {chartRecords.length > 0 && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Westgard Rules Quality Evaluation
            </h4>
            
            {westgardViolations.length === 0 ? (
              <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                <p className="text-xs text-green-700 dark:text-green-400 font-semibold">
                  All runs satisfy Westgard Quality Control rules. Analytical run is within acceptable calibration limits.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {westgardViolations.map((v, i) => (
                  <div 
                    key={i} 
                    className={`rounded-xl border p-3.5 flex items-start gap-3 text-xs font-semibold ${
                      v.type === 'error' 
                        ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400' 
                        : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                    }`}
                  >
                    {v.type === 'error' ? (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="font-bold uppercase tracking-wider text-[10px] opacity-80">{v.type === 'error' ? 'Rule Violation (REJECT RUN)' : 'Warning Flag (QC CHECK)'}</p>
                      <p className="mt-1 font-semibold">{v.rule}</p>
                      <div className="flex gap-4 mt-2 text-[10px] opacity-80">
                        <span>Batch: <strong className="font-mono">{v.batch}</strong></span>
                        <span>Value: <strong>{v.value}</strong></span>
                        <span>Date: <strong>{v.date}</strong></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* QC Records Table */}
        <div className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3.5">Test</th>
                  <th className="px-5 py-3.5">Parameter</th>
                  <th className="px-5 py-3.5">Batch</th>
                  <th className="px-5 py-3.5">Level</th>
                  <th className="px-5 py-3.5 text-right">Expected</th>
                  <th className="px-5 py-3.5 text-right">Measured</th>
                  <th className="px-5 py-3.5 text-right">%CV</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-10 text-center text-muted-foreground animate-pulse font-semibold">
                      Fetching quality control records...
                    </td>
                  </tr>
                ) : qcRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-10 text-center text-muted-foreground">
                      No quality control records found. Click "Add QC Record" to begin.
                    </td>
                  </tr>
                ) : (
                  qcRecords.map((q, i) => {
                    const sc = statusConfig[q.status] || statusConfig.PASS;
                    const Icon = sc.icon;
                    return (
                      <motion.tr 
                        key={q.id} 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        transition={{ delay: Math.min(i * 0.02, 0.4) }}
                        className={`border-b hover:bg-accent/50 transition-colors ${q.status === 'FAIL' ? 'bg-red-50/30 dark:bg-red-950/5' : ''}`}
                      >
                        <td className="px-5 py-3.5 font-medium">{q.test}</td>
                        <td className="px-5 py-3.5">{q.param}</td>
                        <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{q.batch}</td>
                        <td className="px-5 py-3.5 text-xs font-medium">{q.level}</td>
                        <td className="px-5 py-3.5 text-right">{q.expected}</td>
                        <td className="px-5 py-3.5 text-right font-bold">{q.measured}</td>
                        <td className="px-5 py-3.5 text-right font-medium">{q.cv}%</td>
                        <td className="px-5 py-3.5">
                          <span className={`badge ${sc.style}`}>
                            <Icon className="h-3.5 w-3.5 mr-1" />
                            {q.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-muted-foreground">{q.date}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => handleDelete(q.id)}
                            className="btn-action hover:text-destructive hover:border-destructive/30 transition-colors"
                            title="Delete QC Record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl relative animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setShowModal(false)} 
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
            
            <h3 className="text-lg font-bold text-foreground mb-5">Add QC Record</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Test *</label>
                  <input 
                    type="text"
                    className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" 
                    placeholder="e.g. CBC" 
                    value={form.test} 
                    onChange={e => setForm(f => ({ ...f, test: e.target.value }))} 
                  />
                </div>
                <div>
                  <label className="form-label">Parameter *</label>
                  <input 
                    type="text"
                    className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" 
                    placeholder="e.g. Hemoglobin" 
                    value={form.param} 
                    onChange={e => setForm(f => ({ ...f, param: e.target.value }))} 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Batch</label>
                  <input 
                    type="text"
                    className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" 
                    placeholder="Auto-generated" 
                    value={form.batch} 
                    onChange={e => setForm(f => ({ ...f, batch: e.target.value }))} 
                  />
                </div>
                <div>
                  <label className="form-label">Level</label>
                  <select 
                    className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" 
                    value={form.level} 
                    onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                  >
                    <option value="Level 1">Level 1</option>
                    <option value="Level 2">Level 2</option>
                    <option value="Level 3">Level 3</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Expected Value *</label>
                  <input 
                    type="number" 
                    step="any" 
                    className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" 
                    value={form.expected} 
                    onChange={e => setForm(f => ({ ...f, expected: e.target.value }))} 
                  />
                </div>
                <div>
                  <label className="form-label">Measured Value *</label>
                  <input 
                    type="number" 
                    step="any" 
                    className="w-full mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" 
                    value={form.measured} 
                    onChange={e => setForm(f => ({ ...f, measured: e.target.value }))} 
                  />
                </div>
              </div>
              
              {form.expected && form.measured && (
                <div className="rounded-xl border p-3 bg-muted/30">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
                  {(() => {
                    const exp = Number(form.expected);
                    const meas = Number(form.measured);
                    const dev = meas - exp;
                    const cvVal = exp !== 0 ? (Math.abs(dev) / exp) * 100 : 0;
                    const st = cvVal > 15 ? 'FAIL' : cvVal >= 5 ? 'WARNING' : 'PASS';
                    const sc = statusConfig[st] || statusConfig.PASS;
                    const Icon = sc.icon;
                    return (
                      <div className="flex flex-wrap gap-4 items-center text-xs font-semibold">
                        <span>Deviation: <strong className="font-semibold">{dev.toFixed(4)}</strong></span>
                        <span>%CV: <strong className="font-semibold">{cvVal.toFixed(2)}%</strong></span>
                        <span className="flex items-center gap-1.5">
                          Status: 
                          <span className={`badge ${sc.style}`}>
                            <Icon className="h-4 w-4 mr-1" />
                            {st}
                          </span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button 
                type="button"
                className="py-2.5 px-5 text-sm font-bold rounded-xl border border-border hover:bg-accent text-muted-foreground transition-colors" 
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button 
                type="button"
                className="py-2.5 px-5 text-sm font-bold rounded-xl bg-primary text-primary-foreground btn-primary-glow shadow-sm" 
                onClick={handleAdd}
              >
                Add Record
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
