"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Building2, 
  Edit, 
  Phone, 
  Mail, 
  Trash2, 
  Search, 
  CheckCircle, 
  Clock, 
  FlaskConical, 
  DollarSign, 
  X 
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface Lab {
  id: number;
  name: string;
  mobile: string;
  email: string;
  address: string;
  pendingTests: number;
  isActive: boolean;
}

interface OutsourcedTest {
  id: number;
  patientName: string;
  testName: string;
  partnerLab: string;
  outsourceDate: string;
  status: 'Pending' | 'Completed' | 'Cancelled';
  cost: number;
}

const initialLabs: Lab[] = [
  {
    id: 1,
    name: "Apex Diagnostics",
    mobile: "+1 555-0199",
    email: "partner@apexdiag.com",
    address: "102 Health Ave, Sector 4",
    pendingTests: 2,
    isActive: true,
  },
  {
    id: 2,
    name: "Metro Genomics Lab",
    mobile: "+1 555-0143",
    email: "info@metrogenomics.net",
    address: "405 Biotech Park, Phase II",
    pendingTests: 0,
    isActive: true,
  },
  {
    id: 3,
    name: "CarePath Labs",
    mobile: "+1 555-0188",
    email: "support@carepath.org",
    address: "78 Wellness St, Block B",
    pendingTests: 1,
    isActive: true,
  }
];

const initialTests: OutsourcedTest[] = [
  {
    id: 1,
    patientName: "John Doe",
    testName: "HLA-B27 Genotyping",
    partnerLab: "Metro Genomics Lab",
    outsourceDate: "2026-06-02",
    status: "Completed",
    cost: 120,
  },
  {
    id: 2,
    patientName: "Sarah Jenkins",
    testName: "Karyotyping Analysis",
    partnerLab: "Apex Diagnostics",
    outsourceDate: "2026-06-03",
    status: "Pending",
    cost: 180,
  },
  {
    id: 3,
    patientName: "Michael Chang",
    testName: "Amniotic Fluid PCR",
    partnerLab: "Apex Diagnostics",
    outsourceDate: "2026-06-04",
    status: "Pending",
    cost: 250,
  },
  {
    id: 4,
    patientName: "Emily Watson",
    testName: "BRCA1 Gene Sequencing",
    partnerLab: "CarePath Labs",
    outsourceDate: "2026-06-04",
    status: "Pending",
    cost: 320,
  }
];

const emptyForm = { name: '', mobile: '', email: '', address: '' };

export default function OutsourcePage() {
  const [labs, setLabs] = useState<Lab[]>(initialLabs);
  const [outsourcedTests, setOutsourcedTests] = useState<OutsourcedTest[]>(initialTests);
  const [activeTab, setActiveTab] = useState<'labs' | 'tests'>('labs');

  // Search queries
  const [labSearchQuery, setLabSearchQuery] = useState('');
  const [testSearchQuery, setTestSearchQuery] = useState('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Lab | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [showAddTestModal, setShowAddTestModal] = useState(false);
  const [showEditTestModal, setShowEditTestModal] = useState(false);
  const [editTestTarget, setEditTestTarget] = useState<OutsourcedTest | null>(null);
  const [testForm, setTestForm] = useState({
    patientName: '',
    testName: '',
    partnerLab: '',
    outsourceDate: new Date().toISOString().split('T')[0],
    status: 'Pending' as 'Pending' | 'Completed' | 'Cancelled',
    cost: 0
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { 
    if (toast) { 
      const t = setTimeout(() => setToast(null), 3000); 
      return () => clearTimeout(t); 
    } 
  }, [toast]);

  // Labs handlers
  const handleAdd = () => {
    if (!form.name.trim()) { setToast({ message: 'Lab name is required', type: 'error' }); return; }
    const newLab: Lab = {
      id: Date.now(),
      name: form.name,
      mobile: form.mobile,
      email: form.email,
      address: form.address,
      pendingTests: 0,
      isActive: true,
    };
    setLabs(prev => [...prev, newLab]);
    setForm(emptyForm);
    setShowAddModal(false);
    setToast({ message: `${newLab.name} added successfully`, type: 'success' });
  };

  const handleEdit = () => {
    if (!editTarget) return;
    if (!form.name.trim()) { setToast({ message: 'Lab name is required', type: 'error' }); return; }
    setLabs(prev => prev.map(l => l.id === editTarget.id ? { ...l, name: form.name, mobile: form.mobile, email: form.email, address: form.address } : l));
    setShowEditModal(false);
    setEditTarget(null);
    setForm(emptyForm);
    setToast({ message: 'Lab updated successfully', type: 'success' });
  };

  const openEdit = (lab: Lab) => {
    setEditTarget(lab);
    setForm({ name: lab.name, mobile: lab.mobile, email: lab.email, address: lab.address });
    setShowEditModal(true);
  };

  const handleDeleteLab = (id: number) => {
    const labToDelete = labs.find(l => l.id === id);
    if (!labToDelete) return;
    setLabs(prev => prev.filter(l => l.id !== id));
    setToast({ message: `${labToDelete.name} removed successfully`, type: 'success' });
  };

  // Test handlers
  const handleAddTest = () => {
    if (!testForm.patientName.trim()) { setToast({ message: 'Patient name is required', type: 'error' }); return; }
    if (!testForm.testName.trim()) { setToast({ message: 'Test name is required', type: 'error' }); return; }
    if (!testForm.partnerLab) { setToast({ message: 'Please select a reference lab', type: 'error' }); return; }
    if (testForm.cost <= 0) { setToast({ message: 'Please enter a valid cost', type: 'error' }); return; }

    const newTest: OutsourcedTest = {
      id: Date.now(),
      patientName: testForm.patientName,
      testName: testForm.testName,
      partnerLab: testForm.partnerLab,
      outsourceDate: testForm.outsourceDate,
      status: testForm.status,
      cost: Number(testForm.cost)
    };

    setOutsourcedTests(prev => [...prev, newTest]);
    
    // Update lab pending count if status is pending
    if (newTest.status === 'Pending') {
      setLabs(prev => prev.map(l => l.name === newTest.partnerLab ? { ...l, pendingTests: l.pendingTests + 1 } : l));
    }

    setTestForm({
      patientName: '',
      testName: '',
      partnerLab: '',
      outsourceDate: new Date().toISOString().split('T')[0],
      status: 'Pending',
      cost: 0
    });
    setShowAddTestModal(false);
    setToast({ message: `Outsourced test for ${newTest.patientName} created`, type: 'success' });
  };

  const handleEditTest = () => {
    if (!editTestTarget) return;
    if (!testForm.patientName.trim()) { setToast({ message: 'Patient name is required', type: 'error' }); return; }
    if (!testForm.testName.trim()) { setToast({ message: 'Test name is required', type: 'error' }); return; }
    if (!testForm.partnerLab) { setToast({ message: 'Please select a reference lab', type: 'error' }); return; }
    if (testForm.cost <= 0) { setToast({ message: 'Please enter a valid cost', type: 'error' }); return; }

    const oldStatus = editTestTarget.status;
    const newStatus = testForm.status;
    const oldLabName = editTestTarget.partnerLab;
    const newLabName = testForm.partnerLab;

    // Adjust lab pending tests count
    setLabs(prev => prev.map(l => {
      let pendingTests = l.pendingTests;
      if (l.name === oldLabName && oldStatus === 'Pending') {
        pendingTests = Math.max(0, pendingTests - 1);
      }
      if (l.name === newLabName && newStatus === 'Pending') {
        pendingTests += 1;
      }
      return { ...l, pendingTests };
    }));

    setOutsourcedTests(prev => prev.map(t => t.id === editTestTarget.id ? {
      ...t,
      patientName: testForm.patientName,
      testName: testForm.testName,
      partnerLab: testForm.partnerLab,
      outsourceDate: testForm.outsourceDate,
      status: testForm.status,
      cost: Number(testForm.cost)
    } : t));

    setShowEditTestModal(false);
    setEditTestTarget(null);
    setTestForm({
      patientName: '',
      testName: '',
      partnerLab: '',
      outsourceDate: new Date().toISOString().split('T')[0],
      status: 'Pending',
      cost: 0
    });
    setToast({ message: 'Outsourced test updated successfully', type: 'success' });
  };

  const openEditTest = (test: OutsourcedTest) => {
    setEditTestTarget(test);
    setTestForm({
      patientName: test.patientName,
      testName: test.testName,
      partnerLab: test.partnerLab,
      outsourceDate: test.outsourceDate,
      status: test.status,
      cost: test.cost
    });
    setShowEditTestModal(true);
  };

  const handleDeleteTest = (id: number) => {
    const testToDelete = outsourcedTests.find(t => t.id === id);
    if (!testToDelete) return;

    if (testToDelete.status === 'Pending') {
      setLabs(prev => prev.map(l => l.name === testToDelete.partnerLab ? { ...l, pendingTests: Math.max(0, l.pendingTests - 1) } : l));
    }

    setOutsourcedTests(prev => prev.filter(t => t.id !== id));
    setToast({ message: 'Outsourced test removed', type: 'success' });
  };

  // Filter calculations
  const filteredLabs = labs.filter(l =>
    l.name.toLowerCase().includes(labSearchQuery.toLowerCase()) ||
    l.address.toLowerCase().includes(labSearchQuery.toLowerCase()) ||
    l.email.toLowerCase().includes(labSearchQuery.toLowerCase())
  );

  const filteredTests = outsourcedTests.filter(t =>
    t.patientName.toLowerCase().includes(testSearchQuery.toLowerCase()) ||
    t.testName.toLowerCase().includes(testSearchQuery.toLowerCase()) ||
    t.partnerLab.toLowerCase().includes(testSearchQuery.toLowerCase())
  );

  // Stats calculation
  const totalLabs = labs.length;
  const pendingOutsourced = outsourcedTests.filter(t => t.status === 'Pending').length;
  const completedOutsourced = outsourcedTests.filter(t => t.status === 'Completed').length;
  const totalCost = outsourcedTests.reduce((acc, t) => acc + (t.status !== 'Cancelled' ? t.cost : 0), 0);

  // Modals renderers
  const renderLabModal = (onSubmit: () => void, title: string, onClose: () => void) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl relative" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <button 
            type="button" 
            className="btn-action border-none hover:bg-accent text-muted-foreground rounded-lg"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Lab Name *</label>
            <input 
              type="text" 
              placeholder="e.g. Apex Diagnostics"
              className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm" 
              value={form.name} 
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Mobile</label>
              <input 
                type="tel" 
                placeholder="e.g. +1 555-0199"
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm" 
                value={form.mobile} 
                onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Email</label>
              <input 
                type="email" 
                placeholder="e.g. info@apex.com"
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm" 
                value={form.email} 
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} 
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Address</label>
            <input 
              type="text" 
              placeholder="e.g. 102 Health Ave"
              className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm" 
              value={form.address} 
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))} 
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button 
            type="button" 
            className="rounded-xl border px-5 py-2.5 text-sm font-bold hover:bg-accent transition-colors" 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow" 
            onClick={onSubmit}
          >
            {title.includes('Add') ? 'Add Partner' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );

  const renderTestModal = (onSubmit: () => void, title: string, onClose: () => void) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[150] p-4" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl relative" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <button 
            type="button" 
            className="btn-action border-none hover:bg-accent text-muted-foreground rounded-lg"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Patient Name *</label>
            <input 
              type="text" 
              placeholder="e.g. John Doe"
              className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm" 
              value={testForm.patientName} 
              onChange={e => setTestForm(f => ({ ...f, patientName: e.target.value }))} 
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Test Name *</label>
            <input 
              type="text" 
              placeholder="e.g. HLA-B27 Genotyping"
              className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm" 
              value={testForm.testName} 
              onChange={e => setTestForm(f => ({ ...f, testName: e.target.value }))} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Reference Lab *</label>
              <select 
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm"
                value={testForm.partnerLab} 
                onChange={e => setTestForm(f => ({ ...f, partnerLab: e.target.value }))}
              >
                <option value="">Select Lab...</option>
                {labs.map(l => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Cost ($) *</label>
              <input 
                type="number" 
                placeholder="e.g. 150"
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm" 
                value={testForm.cost || ''} 
                onChange={e => setTestForm(f => ({ ...f, cost: Number(e.target.value) }))} 
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Outsource Date</label>
              <input 
                type="date" 
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm" 
                value={testForm.outsourceDate} 
                onChange={e => setTestForm(f => ({ ...f, outsourceDate: e.target.value }))} 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Status</label>
              <select 
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm"
                value={testForm.status} 
                onChange={e => setTestForm(f => ({ ...f, status: e.target.value as any }))}
              >
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button 
            type="button" 
            className="rounded-xl border px-5 py-2.5 text-sm font-bold hover:bg-accent transition-colors" 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow" 
            onClick={onSubmit}
          >
            {title.includes('Add') ? 'Outsource Test' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <AppLayout title="Outsource Labs" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Outsource Labs' }]}>
      
      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Partners</p>
            <p className="text-3xl font-bold text-foreground mt-2">{totalLabs}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Building2 className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pending Tests</p>
            <p className="text-3xl font-bold text-foreground mt-2">{pendingOutsourced}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
            <Clock className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Completed Tests</p>
            <p className="text-3xl font-bold text-foreground mt-2">{completedOutsourced}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center text-green-600 dark:text-green-400">
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Cost</p>
            <p className="text-3xl font-bold text-foreground mt-2">${totalCost}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Tabs system */}
      <div className="flex border-b border-border mb-6">
        <button
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${activeTab === 'labs' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('labs')}
        >
          Reference Labs (Partners)
        </button>
        <button
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${activeTab === 'tests' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('tests')}
        >
          Outsourced Tests Tracker
        </button>
      </div>

      <div className="space-y-4">
        {/* Lab Tab Section */}
        {activeTab === 'labs' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search partner labs..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border bg-background text-sm animate-fade-in-up"
                  value={labSearchQuery}
                  onChange={e => setLabSearchQuery(e.target.value)}
                />
              </div>
              <motion.button 
                whileHover={{ scale: 1.02 }} 
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow self-start sm:self-auto" 
                onClick={() => { setForm(emptyForm); setShowAddModal(true); }}
              >
                <Plus className="h-4 w-4" />
                Add Partner
              </motion.button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              {filteredLabs.map((lab, i) => (
                <motion.div key={lab.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950/50"><Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" /></div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{lab.name}</p>
                        <p className="text-xs text-muted-foreground">{lab.address}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-action" onClick={() => openEdit(lab)} title="Edit Lab">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button className="btn-action text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => handleDeleteLab(lab.id)} title="Delete Lab">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground/75" />{lab.mobile || 'N/A'}</div>
                    <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground/75" />{lab.email || 'N/A'}</div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t pt-3 border-border/50">
                    <span className={`badge ${lab.pendingTests > 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400' : 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'}`}>
                      {lab.pendingTests > 0 ? `${lab.pendingTests} pending` : 'All clear'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {filteredLabs.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed rounded-xl border-border bg-card">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-semibold text-foreground">No partner labs found</h3>
                <p className="text-xs text-muted-foreground mt-1">Configure reference labs to outsource diagnostic tests.</p>
              </div>
            )}
          </>
        )}

        {/* Tests Tab Section */}
        {activeTab === 'tests' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search outsourced tests..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border bg-background text-sm"
                  value={testSearchQuery}
                  onChange={e => setTestSearchQuery(e.target.value)}
                />
              </div>
              <motion.button 
                whileHover={{ scale: 1.02 }} 
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow self-start sm:self-auto" 
                onClick={() => {
                  if (labs.length === 0) {
                    setToast({ message: 'Please add a reference lab first', type: 'error' });
                    return;
                  }
                  setTestForm({
                    patientName: '',
                    testName: '',
                    partnerLab: labs[0].name,
                    outsourceDate: new Date().toISOString().split('T')[0],
                    status: 'Pending',
                    cost: 0
                  });
                  setShowAddTestModal(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Outsource Test
              </motion.button>
            </div>

            {filteredTests.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border bg-card shadow-sm mt-2">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-5 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Patient Name</th>
                      <th className="px-5 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Test Name</th>
                      <th className="px-5 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Reference Lab</th>
                      <th className="px-5 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Outsource Date</th>
                      <th className="px-5 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Cost</th>
                      <th className="px-5 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTests.map((test) => (
                      <tr key={test.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-5 py-3.5 text-sm font-semibold text-foreground">{test.patientName}</td>
                        <td className="px-5 py-3.5 text-sm text-foreground">{test.testName}</td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-4 w-4 text-purple-500" />
                            {test.partnerLab}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">{test.outsourceDate}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-foreground">${test.cost}</td>
                        <td className="px-5 py-3.5 text-sm">
                          <span className={`badge ${
                            test.status === 'Completed'
                              ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                              : test.status === 'Pending'
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                          }`}>
                            {test.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button className="btn-action" onClick={() => openEditTest(test)} title="Edit Test">
                              <Edit className="h-4 w-4" />
                            </button>
                            <button className="btn-action text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => handleDeleteTest(test.id)} title="Delete Test">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-xl border-border bg-card mt-2">
                <FlaskConical className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-semibold text-foreground">No outsourced tests found</h3>
                <p className="text-xs text-muted-foreground mt-1">Configure reference labs and outsource tests to track them here.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals AnimatePresence */}
      <AnimatePresence>
        {showAddModal && renderLabModal(handleAdd, 'Add Partner Lab', () => { setShowAddModal(false); setForm(emptyForm); })}
        {showEditModal && editTarget && renderLabModal(handleEdit, 'Edit Partner Lab', () => { setShowEditModal(false); setEditTarget(null); setForm(emptyForm); })}
        
        {showAddTestModal && renderTestModal(handleAddTest, 'Outsource New Test', () => setShowAddTestModal(false))}
        {showEditTestModal && editTestTarget && renderTestModal(handleEditTest, 'Edit Outsourced Test', () => { setShowEditTestModal(false); setEditTestTarget(null); })}
      </AnimatePresence>

      {/* Notification Toast */}
      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'} z-[200]`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
