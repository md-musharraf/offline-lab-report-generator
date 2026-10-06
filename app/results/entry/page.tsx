"use client";
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { interpretResult } from '@/lib/result-interpreter';
import { evaluateTestFormulas, isCalculated } from '@/lib/formula-evaluator';
import { AppLayout } from '@/components/AppLayout';
import { can } from '@/lib/roles';
import { ArrowLeft, Save, AlertCircle, CheckCircle, XCircle, X, Lock } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn, getRoleAndPermissions } from '@/lib/utils';
import { AdminOverrideModal } from '@/components/AdminOverrideModal';

function ResultEntryContent() {
  const searchParams = useSearchParams();
  const orderId = Number(searchParams.get('orderId'));
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

  const [order, setOrder] = useState<any>(null);
  const { role, permissions } = getRoleAndPermissions(currentUser?.role);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const hasEditResultsAfterApproval = permissions.includes('EDIT_RESULTS_AFTER_APPROVAL');

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideUnlocked, setOverrideUnlocked] = useState(false);

  // Approved results can be corrected by whoever may approve; delivered reports need the owner (or an override).
  const canEditApproved = can(currentUser?.role, 'report:edit-approved');
  const isReadOnly = !isAdmin && !hasEditResultsAfterApproval && !overrideUnlocked &&
    (order?.status === 'DELIVERED' || (order?.status === 'APPROVED' && !canEditApproved));


  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state maps parameterId to { value, statusObj }
  const [results, setResults] = useState<Record<number, any>>({});
  // Track parameters manually overridden by user
  const [overriddenParams, setOverriddenParams] = useState<Record<number, boolean>>({});

  // Patient historical readings for Delta Checks
  const [patientHistory, setPatientHistory] = useState<any[]>([]);
  const [selectedParamHistory, setSelectedParamHistory] = useState<{ paramName: string; history: any[] } | null>(null);

  useEffect(() => {
    async function loadOrder() {
      try {
        const orderData = await db.query('testOrder', 'findUnique', {
          where: { id: orderId },
          include: {
            patient: true,
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
            }
          }
        });
        
        if (orderData) {
          setOrder(orderData);
          setItems(orderData.items);
          
          // Initialize state with existing results
          const initialResults: Record<number, any> = {};
          const ageInDays = orderData.patient.ageUnit === 'YEARS' ? orderData.patient.age * 365 : 
                            orderData.patient.ageUnit === 'MONTHS' ? orderData.patient.age * 30 : orderData.patient.age;

          orderData.items.forEach((item: any) => {
            item.results?.forEach((r: any) => {
              const parameter = item.test.parameters.find((p: any) => p.id === r.parameterId);
              
              let statusObj = {
                status: r.status,
                flag: r.flag,
                isCritical: r.isCritical,
                isAbnormal: r.isAbnormal,
                colorClass: 'text-gray-500',
                bgColorClass: 'bg-gray-100',
                label: r.status
              };

              // Re-interpret or set color mappings based on loaded status
              if (r.status === 'NORMAL') {
                statusObj.colorClass = 'text-green-700 dark:text-green-400';
                statusObj.bgColorClass = 'bg-green-500/10 border-green-500/20';
                statusObj.label = 'NORMAL ✓';
              } else if (r.status === 'CRITICAL') {
                statusObj.colorClass = 'text-red-700 dark:text-red-400';
                statusObj.bgColorClass = 'bg-red-500/10 border-red-500/20';
                statusObj.label = 'CRITICAL ⚠';
              } else if (r.status === 'LOW') {
                statusObj.colorClass = 'text-blue-700 dark:text-blue-400';
                statusObj.bgColorClass = 'bg-blue-500/10 border-blue-500/20';
                statusObj.label = 'LOW ↓';
              } else if (r.status === 'HIGH') {
                statusObj.colorClass = 'text-orange-700 dark:text-orange-400';
                statusObj.bgColorClass = 'bg-orange-500/10 border-orange-500/20';
                statusObj.label = 'HIGH ↑';
              }

              initialResults[r.parameterId] = {
                value: r.textValue || (r.numericValue !== null ? String(r.numericValue) : ''),
                statusObj
              };
            });
          });
          setResults(initialResults);

          // Fetch historical results for the patient
          try {
            const historyData = await db.query('testResult', 'findMany', {
              where: {
                orderItem: {
                  order: {
                    patientId: orderData.patient.id,
                    id: { not: orderId },
                    status: { in: ['ENTERED', 'VERIFIED', 'RESULT_ENTERED', 'COMPLETED'] }
                  }
                }
              },
              orderBy: {
                enteredAt: 'desc'
              },
              include: {
                orderItem: {
                  include: {
                    order: true
                  }
                }
              }
            });
            if (historyData) {
              setPatientHistory(historyData);
            }
          } catch (e) {
            console.error("Failed to load patient history:", e);
          }
        }
      } catch (error) {
        console.error("Failed to load order", error);
        setToast({ message: "Failed to load order details", type: "error" });
      } finally {
        setLoading(false);
      }
    }
    if (orderId) loadOrder();
  }, [orderId]);

  // Dismiss toast after timeout
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleInputChange = (parameter: any, value: string) => {
    const ageInDays = order.patient.ageUnit === 'YEARS' ? order.patient.age * 365 : 
                      order.patient.ageUnit === 'MONTHS' ? order.patient.age * 30 : order.patient.age;
    
    // Find matching ref range
    const range = parameter.refRanges?.find((r: any) => 
      (r.gender == null || r.gender === order.patient.gender) &&
      (r.ageMin == null || ageInDays >= r.ageMin) &&
      (r.ageMax == null || ageInDays <= r.ageMax)
    );

    const interpretation = interpretResult(value, range || null, ageInDays, order.patient.gender);
    
    // Check if calculated parameter is being edited manually
    const item = items.find(i => i.test.parameters.some((p: any) => p.id === parameter.id));
    const isParamCalc = item ? isCalculated(item.test.code, parameter.name, parameter.formula) : false;
    
    let nextOverridden = { ...overriddenParams };
    if (isParamCalc && !overriddenParams[parameter.id]) {
      nextOverridden[parameter.id] = true;
      setOverriddenParams(nextOverridden);
    }

    const updatedResults = {
      ...results,
      [parameter.id]: {
        value,
        statusObj: interpretation
      }
    };

    // Auto-calculate formula fields
    if (item) {
      const testCode = item.test.code;
      const parameters = item.test.parameters;
      
      const currentValues: Record<number, string> = {};
      parameters.forEach((p: any) => {
        if (p.id === parameter.id) {
          currentValues[p.id] = value;
        } else {
          currentValues[p.id] = updatedResults[p.id]?.value || '';
        }
      });
      
      const calculated = evaluateTestFormulas(
        testCode,
        parameters,
        currentValues,
        order.patient.age,
        order.patient.ageUnit,
        order.patient.gender
      );
      
      Object.keys(calculated).forEach((idStr) => {
        const calcId = Number(idStr);
        if (!nextOverridden[calcId]) {
          const calcData = calculated[calcId];
          const calcParam = parameters.find((p: any) => p.id === calcId);
          if (calcParam) {
            const calcRange = calcParam.refRanges?.find((r: any) => 
              (r.gender == null || r.gender === order.patient.gender) &&
              (r.ageMin == null || ageInDays >= r.ageMin) &&
              (r.ageMax == null || ageInDays <= r.ageMax)
            );
            const calcInterpretation = interpretResult(calcData.value, calcRange || null, ageInDays, order.patient.gender);
            
            updatedResults[calcId] = {
              value: calcData.value,
              statusObj: calcInterpretation
            };
          }
        }
      });
    }

    setResults(updatedResults);
  };

  const handleResetOverride = (parameter: any) => {
    const item = items.find(i => i.test.parameters.some((p: any) => p.id === parameter.id));
    if (!item) return;
    
    const nextOverridden = { ...overriddenParams };
    delete nextOverridden[parameter.id];
    setOverriddenParams(nextOverridden);

    const ageInDays = order.patient.ageUnit === 'YEARS' ? order.patient.age * 365 : 
                      order.patient.ageUnit === 'MONTHS' ? order.patient.age * 30 : order.patient.age;
    
    const testCode = item.test.code;
    const parameters = item.test.parameters;
    
    const currentValues: Record<number, string> = {};
    parameters.forEach((p: any) => {
      if (p.id === parameter.id) {
        currentValues[p.id] = ''; // Clear to force recalculation
      } else {
        currentValues[p.id] = results[p.id]?.value || '';
      }
    });
    
    const calculated = evaluateTestFormulas(
      testCode,
      parameters,
      currentValues,
      order.patient.age,
      order.patient.ageUnit,
      order.patient.gender
    );
    
    const updatedResults = { ...results };
    delete updatedResults[parameter.id];

    Object.keys(calculated).forEach((idStr) => {
      const calcId = Number(idStr);
      if (!nextOverridden[calcId]) {
        const calcData = calculated[calcId];
        const calcParam = parameters.find((p: any) => p.id === calcId);
        if (calcParam) {
          const calcRange = calcParam.refRanges?.find((r: any) => 
            (r.gender == null || r.gender === order.patient.gender) &&
            (r.ageMin == null || ageInDays >= r.ageMin) &&
            (r.ageMax == null || ageInDays <= r.ageMax)
          );
          const calcInterpretation = interpretResult(calcData.value, calcRange || null, ageInDays, order.patient.gender);
          
          updatedResults[calcId] = {
            value: calcData.value,
            statusObj: calcInterpretation
          };
        }
      }
    });
    
    setResults(updatedResults);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Loop through items and parameters, save results
      for (const item of items) {
        for (const param of item.test.parameters) {
          if (param.isHeader) continue;
          
          const resultEntry = results[param.id];
          if (!resultEntry || resultEntry.value === '') continue; // Skip empty
          
          const isNumeric = param.type === 'NUMERIC' || param.type === 'CALCULATED';
          const numericValue = isNumeric && !isNaN(Number(resultEntry.value)) ? Number(resultEntry.value) : null;
          const textValue = !isNumeric ? resultEntry.value : null;

          // Compute Delta Check on manual entry
          let deltaCheckNote = null;
          let deltaFlag = resultEntry.statusObj.flag;
          let deltaAbnormal = resultEntry.statusObj.isAbnormal;

          if (numericValue !== null) {
            const paramHistory = patientHistory.filter(h => h.parameterId === param.id);
            if (paramHistory.length > 0) {
              const prevResult = paramHistory[0];
              const prevVal = prevResult.numericValue !== null ? prevResult.numericValue : parseFloat(prevResult.textValue || '');
              if (!isNaN(prevVal) && prevVal !== 0) {
                const shift = ((numericValue - prevVal) / prevVal) * 100;
                if (Math.abs(shift) >= 20) {
                  deltaCheckNote = `[Delta Alert] Prev: ${prevVal} on ${new Date(prevResult.enteredAt).toLocaleDateString()} (Shift: ${shift > 0 ? '+' : ''}${shift.toFixed(1)}%)`;
                  if (!deltaFlag) {
                    deltaFlag = 'Δ';
                  }
                  deltaAbnormal = true;
                }
              }
            }
          }

          // Check if result already exists
          const existingResult = item.results?.find((r: any) => r.parameterId === param.id);

          if (existingResult) {
            await db.query('testResult', 'update', {
              where: { id: existingResult.id },
              data: {
                numericValue,
                textValue,
                status: resultEntry.statusObj.status,
                flag: deltaFlag,
                isCritical: resultEntry.statusObj.isCritical,
                isAbnormal: deltaAbnormal,
                note: deltaCheckNote
              }
            });
          } else {
            await db.query('testResult', 'create', {
              data: {
                orderItemId: item.id,
                parameterId: param.id,
                numericValue,
                textValue,
                status: resultEntry.statusObj.status,
                flag: deltaFlag,
                isCritical: resultEntry.statusObj.isCritical,
                isAbnormal: deltaAbnormal,
                note: deltaCheckNote,
                enteredBy: currentUser?.id || 1
              }
            });
          }
        }
        
        // Update item status
        await db.query('testOrderItem', 'update', {
          where: { id: item.id },
          data: { status: 'RESULT_ENTERED' }
        });
      }
      
      // Update order status
      await db.query('testOrder', 'update', {
        where: { id: order.id },
        data: { status: 'RESULT_ENTERED' }
      });

      setToast({ message: "Results saved successfully!", type: "success" });
      
      // Delay redirect to show success toast
      setTimeout(() => {
        router.push('/results');
      }, 1500);
    } catch (error) {
      console.error(error);
      setToast({ message: "Failed to save results. Please try again.", type: "error" });
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Loading Results Entry..." breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Results', href: '/results' }]}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground font-medium animate-pulse">Loading order details...</div>
        </div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout title="Order Not Found" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Results', href: '/results' }]}>
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center text-red-500 max-w-md mx-auto mt-12">
          Order not found or has been deleted.
        </div>
      </AppLayout>
    );
  }

  const hasCritical = Object.values(results).some(r => r.statusObj?.isCritical);

  return (
    <AppLayout 
      title={`Result Entry: ${order.orderNo}`} 
      breadcrumbs={[
        { label: 'Home', href: '/dashboard' },
        { label: 'Results', href: '/results' },
        { label: 'Enter Results' }
      ]}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header toolbar */}
        <div className="flex items-center justify-between gap-4">
          <Link href="/results" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-semibold border rounded-lg px-3.5 py-2 bg-card transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Results
          </Link>
          {!isReadOnly && (
            <button 
              onClick={handleSave}
              disabled={saving}
              className="btn-primary-glow inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Results'}
            </button>
          )}
        </div>

        {/* Approved Results Lock Banner */}
        {isReadOnly && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              <p className="text-amber-700 dark:text-amber-400 font-semibold text-sm">
                This report has been approved. Results are locked and cannot be edited by staff.
              </p>
            </div>
            <button
              onClick={() => setOverrideOpen(true)}
              className="py-1.5 px-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" />
              Unlock Editing
            </button>
          </div>
        )}


        {/* Patient Details Info Card */}
        <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Patient Name</p>
              <p className="text-sm font-bold text-foreground mt-1">{order.patient?.name}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Patient ID</p>
              <p className="text-sm font-mono font-semibold text-primary mt-1">{order.patient?.id}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Age / Gender</p>
              <p className="text-sm font-semibold text-foreground mt-1">
                {order.patient?.age} {order.patient?.ageUnit?.toLowerCase()} / {order.patient?.gender?.toLowerCase()}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Priority / Status</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-flex items-center rounded-full bg-blue-500/10 text-blue-500 px-2.5 py-1 text-[11px] font-bold">
                  {order.priority}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400 px-2.5 py-1 text-[11px] font-bold">
                  {order.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Critical Banner */}
        {hasCritical && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 flex items-center gap-3 animate-pulse">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-700 dark:text-red-400 font-semibold text-sm">
              Critical values detected! Please verify carefully before saving.
            </p>
          </div>
        )}

        {/* Tests Parameters Forms */}
        <div className="space-y-8">
          {items.map((item) => (
            <div key={item.id} className="bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden border-border">
              <div className="bg-muted/30 px-5 py-4 border-b border-border">
                <h3 className="text-lg font-bold text-foreground">{item.test?.name}</h3>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20 text-left text-xs font-semibold text-muted-foreground uppercase">
                      <th className="px-6 py-3.5 w-1/3">Parameter</th>
                      <th className="px-6 py-3.5 w-1/4">Result</th>
                      <th className="px-6 py-3.5 w-1/6">Unit</th>
                      <th className="px-6 py-3.5 w-1/4">Reference Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rawParamIds = item.selectedParameters && item.selectedParameters.trim() !== ''
                        ? item.selectedParameters.split(',').map(Number).filter((n: number) => !isNaN(n) && n > 0)
                        : null;
                      const allowedParamIds = rawParamIds && rawParamIds.length > 0 ? rawParamIds : null;
                        
                      const filteredParams = (item.test?.parameters || []).filter((param: any) => {
                        if (param.isHeader) return true;
                        if (allowedParamIds && !allowedParamIds.includes(param.id)) return false;
                        return true;
                      }).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
                      
                      if (filteredParams.every((p: any) => p.isHeader)) {
                        return (
                          <tr>
                            <td colSpan={4} className="px-6 py-8 text-center text-xs font-semibold text-muted-foreground italic bg-muted/5">
                              No parameters selected for this test.
                            </td>
                          </tr>
                        );
                      }

                      return filteredParams.map((param: any) => {
                        if (param.isHeader) {
                          return (
                            <tr key={param.id} className="bg-muted/10 border-b border-border">
                              <td colSpan={4} className="px-6 py-2 text-xs font-bold text-muted-foreground">
                                {param.name}
                              </td>
                            </tr>
                          );
                        }

                        const resultEntry = results[param.id] || { value: '' };
                        const statusObj = resultEntry.statusObj || {};
                        const isAbnormal = statusObj.isAbnormal;
                        const isCritical = statusObj.isCritical;
                        
                        const ageInDays = order.patient.ageUnit === 'YEARS' ? order.patient.age * 365 : 
                                          order.patient.ageUnit === 'MONTHS' ? order.patient.age * 30 : order.patient.age;
                        
                        const range = param.refRanges?.find((r: any) => 
                          (r.gender == null || r.gender === order.patient.gender) &&
                          (r.ageMin == null || ageInDays >= r.ageMin) &&
                          (r.ageMax == null || ageInDays <= r.ageMax)
                        );
                        
                        const displayRange = param.type === 'NUMERIC' 
                          ? (range ? `${range.normalMin} - ${range.normalMax}` : 'Not Specified')
                          : (range ? range.textNormal : 'Not Specified');

                        // Highlighting wrapper row class
                        const rowClass = isCritical 
                          ? 'bg-red-500/5 hover:bg-red-500/10 border-b border-border/40' 
                          : isAbnormal 
                            ? 'bg-orange-500/5 hover:bg-orange-500/10 border-b border-border/40' 
                            : 'hover:bg-accent/20 border-b border-border/40';

                        const isParamCalc = isCalculated(item.test.code, param.name, param.formula);
                        const isOverridden = !!overriddenParams[param.id];

                        let calculatedBgClass = '';
                        if (isParamCalc && !isOverridden) {
                          calculatedBgClass = 'bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-semibold cursor-not-allowed border-dashed';
                        }

                        // Custom styling for the input element based on status
                        const inputBorderClass = isCritical 
                          ? `border-red-500 text-red-500 bg-red-500/5 font-bold focus:ring-red-500 focus:border-red-500 ${calculatedBgClass}` 
                          : isAbnormal 
                            ? `border-orange-500 text-orange-500 bg-orange-500/5 font-bold focus:ring-orange-500 focus:border-orange-500 ${calculatedBgClass}` 
                            : `border-border focus:ring-primary focus:border-primary text-foreground ${calculatedBgClass}`;

                        return (
                          <tr key={param.id} className={rowClass}>
                            <td className="px-6 py-4 text-sm font-bold text-foreground">
                              {param.name}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {param.type === 'DROPDOWN' ? (
                                  <select 
                                    disabled={isReadOnly}
                                    className={`block w-56 rounded-lg shadow-sm text-sm font-semibold border p-2 focus:outline-none focus:ring-2 bg-background ${inputBorderClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                                    value={resultEntry.value}
                                    onChange={(e) => handleInputChange(param, e.target.value)}
                                  >
                                    <option value="" className="bg-card text-foreground">Select...</option>
                                    {param.options?.split(',').map((opt: string) => (
                                      <option key={opt} value={opt.trim()} className="bg-card text-foreground">
                                        {opt.trim()}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="relative flex items-center w-56">
                                    <input
                                      type="text"
                                      placeholder="Enter result..."
                                      readOnly={(isParamCalc && !isOverridden) || isReadOnly}
                                      disabled={isReadOnly}
                                      className={`block w-full rounded-lg shadow-sm text-sm font-semibold border px-3 py-1.5 focus:outline-none focus:ring-2 ${isParamCalc ? 'pr-14' : ''} ${inputBorderClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                                      value={resultEntry.value}
                                      onChange={(e) => handleInputChange(param, e.target.value)}
                                    />
                                    {isParamCalc && !isReadOnly && (
                                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 select-none">
                                        {!isOverridden ? (
                                          <button
                                            type="button"
                                            title="Click to override auto-calculation"
                                            onClick={() => setOverriddenParams(prev => ({ ...prev, [param.id]: true }))}
                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20 shadow-sm cursor-pointer transition-colors"
                                          >
                                            Auto
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            title="Click to reset to auto-calculation"
                                            onClick={() => handleResetOverride(param)}
                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 shadow-sm cursor-pointer transition-colors animate-pulse"
                                          >
                                            Manual
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                
                                {statusObj.label && statusObj.label !== 'PENDING' && (
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded text-[11px] font-bold border ${statusObj.bgColorClass} ${statusObj.colorClass} ${isCritical ? 'animate-pulse' : ''}`}>
                                    {statusObj.label}
                                  </span>
                                )}

                                {(() => {
                                  const paramHistory = patientHistory.filter(h => h.parameterId === param.id);
                                  if (paramHistory.length === 0) return null;
                                  
                                  const prevResult = paramHistory[0];
                                  const prevVal = prevResult.numericValue !== null ? prevResult.numericValue : parseFloat(prevResult.textValue || '');
                                  if (isNaN(prevVal)) return null;

                                  const currentVal = Number(resultEntry.value);
                                  let shift = 0;
                                  let isAlert = false;
                                  if (!isNaN(currentVal) && resultEntry.value !== '' && prevVal !== 0) {
                                    shift = ((currentVal - prevVal) / prevVal) * 100;
                                    isAlert = Math.abs(shift) >= 20;
                                  }

                                  return (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedParamHistory({ paramName: param.name, history: paramHistory })}
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                        isAlert 
                                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 shadow-sm animate-pulse'
                                          : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60'
                                      }`}
                                      title="Click to view history"
                                    >
                                      <span className="opacity-80">Prev:</span> 
                                      <strong className="font-bold">{prevVal}</strong>
                                      {!isNaN(currentVal) && resultEntry.value !== '' && (
                                        <span className="font-mono text-[10px] font-bold">({shift > 0 ? '+' : ''}{shift.toFixed(1)}%)</span>
                                      )}
                                      {isAlert && <span className="inline-flex rounded bg-amber-500 px-1 py-0.2 text-[8px] font-bold text-white uppercase ml-1 animate-pulse">Δ</span>}
                                    </button>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-muted-foreground font-mono">
                              {param.unit || '—'}
                            </td>
                            <td className="px-6 py-4 text-xs text-muted-foreground font-mono">
                              {displayRange}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Parameter History Modal */}
      {selectedParamHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedParamHistory(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-lg shadow-2xl relative animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedParamHistory(null)} 
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
            
            <h3 className="text-lg font-bold text-foreground mb-4">
              Historical Results: {selectedParamHistory.paramName}
            </h3>
            
            <div className="space-y-4">
              <div className="rounded-xl border p-4 bg-muted/20">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Recent Patient Readings</p>
                <div className="space-y-2.5 max-h-60 overflow-y-auto">
                  {selectedParamHistory.history.map((h: any) => (
                    <div key={h.id} className="flex justify-between items-center text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="font-semibold text-foreground">
                          {h.numericValue !== null ? h.numericValue : h.textValue} <span className="text-xs text-muted-foreground font-mono">{h.unit || ''}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Order: <span className="font-mono font-medium">{h.orderItem?.order?.orderNo || '—'}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-foreground">
                          {new Date(h.enteredAt).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <button 
                type="button"
                className="py-2.5 px-5 text-sm font-bold rounded-xl bg-primary text-primary-foreground btn-primary-glow shadow-sm" 
                onClick={() => setSelectedParamHistory(null)}
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Override Modal */}
      <AdminOverrideModal
        isOpen={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        onSuccess={() => setOverrideUnlocked(true)}
        actionDescription="editing approved laboratory results"
      />

      {/* Toast Notification popup */}
      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}

export default function ResultEntryPage() {
  return (
    <Suspense fallback={
      <AppLayout title="Loading Results Entry..." breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Results', href: '/results' }]}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground font-medium animate-pulse">Loading order details...</div>
        </div>
      </AppLayout>
    }>
      <ResultEntryContent />
    </Suspense>
  );
}
