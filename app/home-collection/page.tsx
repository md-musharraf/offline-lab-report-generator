"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Plus, MapPin, Clock, Phone, User, X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Collection {
  id: number;
  patient: string;
  address: string;
  phone: string;
  phlebotomist: string;
  date: string;
  time: string;
  status: string;
  tests: string;
}

const phlebotomists = ['Ramesh Singh', 'Pooja Sharma'];

const initialCollections: Collection[] = [];

const statusMap: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400', label: '⏳ Pending' },
  ASSIGNED: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400', label: '👤 Assigned' },
  IN_TRANSIT: { color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400', label: '🚗 In Transit' },
  COLLECTED: { color: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400', label: '✅ Collected' },
  DELIVERED_TO_LAB: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400', label: '🏥 At Lab' },
};

const emptyForm = { patient: '', address: '', phone: '', tests: '', date: '', time: '' };

export default function HomeCollectionPage() {
  const [collections, setCollections] = useState<Collection[]>(initialCollections);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Collection | null>(null);
  const [selectedPhlebotomist, setSelectedPhlebotomist] = useState(phlebotomists[0]);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { 
    if (toast) { 
      const t = setTimeout(() => setToast(null), 3000); 
      return () => clearTimeout(t); 
    } 
  }, [toast]);

  const pendingCount = collections.filter(c => c.status === 'PENDING').length;
  const inTransitCount = collections.filter(c => c.status === 'IN_TRANSIT').length;
  const collectedCount = collections.filter(c => c.status === 'COLLECTED' || c.status === 'DELIVERED_TO_LAB').length;

  const handleSchedule = () => {
    if (!form.patient.trim() || !form.address.trim()) { 
      setToast({ message: 'Patient name and address are required', type: 'error' }); 
      return; 
    }
    const dateStr = form.date ? (() => { const [y, m, d] = form.date.split('-'); return `${d}/${m}/${y}`; })() : '20/05/2026';
    const newCollection: Collection = {
      id: Date.now(),
      patient: form.patient,
      address: form.address,
      phone: form.phone,
      tests: form.tests,
      date: dateStr,
      time: form.time || '09:00 AM',
      status: 'PENDING',
      phlebotomist: 'Unassigned',
    };
    setCollections(prev => [...prev, newCollection]);
    setForm(emptyForm);
    setShowScheduleModal(false);
    setToast({ message: 'Collection scheduled successfully', type: 'success' });
  };

  const handleAssign = () => {
    if (!assignTarget) return;
    setCollections(prev => prev.map(c => c.id === assignTarget.id ? { ...c, phlebotomist: selectedPhlebotomist, status: 'ASSIGNED' } : c));
    setShowAssignModal(false);
    setAssignTarget(null);
    setToast({ message: `Assigned to ${selectedPhlebotomist}`, type: 'success' });
  };

  const openAssign = (c: Collection) => {
    setAssignTarget(c);
    setSelectedPhlebotomist(phlebotomists[0]);
    setShowAssignModal(true);
  };

  return (
    <AppLayout title="Home Collection" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Home Collection' }]}>
      <div className="space-y-6">
        {/* Top bar with stats & action button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="section-label">Pending</p>
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-500 mt-1">{pendingCount}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="section-label">In Transit</p>
              <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{inTransitCount}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="section-label">Completed Today</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-500 mt-1">{collectedCount}</p>
            </div>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }} 
            className="flex items-center justify-center gap-2 bg-primary py-2.5 px-5 text-sm font-bold rounded-xl text-primary-foreground shadow-sm hover:shadow-md transition-all shrink-0 self-stretch sm:self-auto animate-glow-pulse" 
            onClick={() => { setForm(emptyForm); setShowScheduleModal(true); }}
          >
            <Plus className="h-4 w-4" />
            <span>Schedule Collection</span>
          </motion.button>
        </div>

        {/* Desktop View (Table format) */}
        <div className="hidden md:block rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3.5">Patient</th>
                  <th className="px-5 py-3.5">Address</th>
                  <th className="px-5 py-3.5">Contact</th>
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5">Phlebotomist</th>
                  <th className="px-5 py-3.5">Tests</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {collections.map((c, i) => (
                  <motion.tr 
                    key={c.id} 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    transition={{ delay: i * 0.03 }}
                    className="hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-semibold text-foreground">{c.patient}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{c.address}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{c.phone}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{c.date} {c.time}</td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-muted-foreground">{c.phlebotomist}</td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-muted-foreground">{c.tests}</td>
                    <td className="px-5 py-3.5">
                      <span className={`badge font-semibold ${statusMap[c.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                        {statusMap[c.status]?.label || c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {c.status === 'PENDING' && (
                        <div className="flex items-center justify-end">
                          <button 
                            className="btn-action hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-xs font-semibold gap-1.5 px-3" 
                            onClick={() => openAssign(c)}
                          >
                            <User className="h-4 w-4" />
                            <span>Assign</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
                {collections.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-muted-foreground">
                      No collections scheduled today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile View (Card list format) */}
        <div className="block md:hidden space-y-3">
          {collections.map((c, i) => (
            <motion.div 
              key={c.id} 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border bg-card py-3.5 px-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{c.patient}</span>
                      <span className={`badge font-semibold ${statusMap[c.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                        {statusMap[c.status]?.label || c.status}
                      </span>
                    </div>
                  </div>
                  {c.status === 'PENDING' && (
                    <button 
                      className="btn-action hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-xs font-semibold gap-1.5 px-3 self-start" 
                      onClick={() => openAssign(c)}
                    >
                      <User className="h-4 w-4" />
                      <span>Assign</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground border-t pt-2.5">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-muted-foreground/70" />
                    <span>{c.address}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-muted-foreground/70" />
                    <span>{c.phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-muted-foreground/70" />
                    <span>{c.date} {c.time}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-muted-foreground/70" />
                    <span>Phlebotomist: <span className="font-semibold text-foreground">{c.phlebotomist}</span></span>
                  </div>
                  {c.tests && (
                    <div className="mt-1 font-semibold text-foreground/80">
                      Tests: {c.tests}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          {collections.length === 0 && (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm font-semibold text-muted-foreground bg-card">
              No collections scheduled today
            </div>
          )}
        </div>
      </div>

      {/* Schedule Collection Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowScheduleModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Schedule Collection</h3>
              <button 
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" 
                onClick={() => setShowScheduleModal(false)}
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="form-label">Patient Name *</label>
                <input 
                  type="text"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                  value={form.patient} 
                  onChange={e => setForm(f => ({ ...f, patient: e.target.value }))} 
                />
              </div>
              <div>
                <label className="form-label">Address *</label>
                <input 
                  type="text"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                  value={form.address} 
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))} 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Phone</label>
                  <input 
                    type="text"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                    value={form.phone} 
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} 
                  />
                </div>
                <div>
                  <label className="form-label">Tests</label>
                  <input 
                    type="text"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                    placeholder="CBC, LFT..." 
                    value={form.tests} 
                    onChange={e => setForm(f => ({ ...f, tests: e.target.value }))} 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Date</label>
                  <input 
                    type="date" 
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                    value={form.date} 
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} 
                  />
                </div>
                <div>
                  <label className="form-label">Time</label>
                  <input 
                    type="time" 
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                    value={form.time} 
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))} 
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button 
                className="border px-5 py-2.5 text-sm font-bold rounded-xl hover:bg-accent transition-colors" 
                onClick={() => setShowScheduleModal(false)}
              >
                Cancel
              </button>
              <button 
                className="bg-primary py-2.5 px-5 text-sm font-bold rounded-xl text-primary-foreground hover:bg-primary/95 transition-all shadow-sm" 
                onClick={handleSchedule}
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Phlebotomist Modal */}
      {showAssignModal && assignTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowAssignModal(false); setAssignTarget(null); }}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Assign Phlebotomist</h3>
              <button 
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" 
                onClick={() => { setShowAssignModal(false); setAssignTarget(null); }}
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-3">
                <label className="form-label">Patient</label>
                <p className="text-sm font-semibold text-foreground">{assignTarget.patient}</p>
              </div>
              
              <div>
                <label className="form-label">Select Phlebotomist</label>
                <select 
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                  value={selectedPhlebotomist} 
                  onChange={e => setSelectedPhlebotomist(e.target.value)}
                >
                  {phlebotomists.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button 
                className="border px-5 py-2.5 text-sm font-bold rounded-xl hover:bg-accent transition-colors" 
                onClick={() => { setShowAssignModal(false); setAssignTarget(null); }}
              >
                Cancel
              </button>
              <button 
                className="bg-primary py-2.5 px-5 text-sm font-bold rounded-xl text-primary-foreground hover:bg-primary/95 transition-all shadow-sm" 
                onClick={handleAssign}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'} fixed bottom-6 right-6 z-[200]`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
