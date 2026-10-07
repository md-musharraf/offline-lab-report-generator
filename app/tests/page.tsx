"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit, Trash2, Beaker, ChevronUp, ChevronDown, PlusCircle, XIcon, Save, ArrowUpDown } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { formatCurrency, CATEGORY_COLORS, SAMPLE_TYPES, SAMPLE_CONTAINERS } from '@/shared/constants';
import { db } from '@/lib/db';

interface RefRangeForm {
  id?: number;
  gender: 'MALE' | 'FEMALE' | null;
  normalMin: string;
  normalMax: string;
  criticalMin: string;
  criticalMax: string;
  textNormal: string;
}

interface ParameterForm {
  id?: number;
  name: string;
  unit: string;
  sortOrder: number;
  type: 'NUMERIC' | 'TEXT' | 'DROPDOWN' | 'CALCULATED';
  options: string;
  isHeader: boolean;
  refRanges: RefRangeForm[];
}

interface Test {
  id: number;
  code: string;
  name: string;
  shortName?: string;
  category: string;
  price: number;
  duration: number;
  sampleType: string;
  container: string;
  params: number;
  isActive: boolean;
}

interface DbCategory {
  id: number;
  name: string;
  sortOrder: number;
}

const emptyForm = {
  code: '',
  name: '',
  shortName: '',
  category: 'Hematology',
  price: 0,
  duration: 1,
  sampleType: 'Whole Blood',
  container: 'EDTA Tube (Purple)',
  parameters: [] as ParameterForm[]
};

export default function TestsPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  
  const [sortField, setSortField] = useState<keyof Test | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const requestSort = (field: keyof Test) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortField === field && sortDirection === 'asc') {
      direction = 'desc';
    }
    setSortField(field);
    setSortDirection(direction);
  };

  const SortHeader = ({ field, label }: { field: keyof Test; label: string }) => {
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState<'basic' | 'parameters'>('basic');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchTests = async () => {
    try {
      const cats = await db.query('testCategory', 'findMany', {
        orderBy: { sortOrder: 'asc' }
      });
      
      const allTests = await db.query('test', 'findMany', {
        where: { isActive: true },
        include: { category: true, parameters: true },
        orderBy: { name: 'asc' }
      });
      
      if (cats) {
        setDbCategories(cats);
        if (cats.length > 0) {
          setForm(prev => ({ ...prev, category: cats[0].name }));
        }
      }
      
      if (allTests) {
        setTests(allTests.map((t: any) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          shortName: t.shortName || '',
          category: t.category?.name || 'Unknown',
          price: t.price,
          duration: t.duration || 1,
          sampleType: t.sampleType || 'Whole Blood',
          container: t.container || 'Purple Cap',
          params: t.parameters ? t.parameters.length : 0,
          isActive: t.isActive
        })));
      }
    } catch (err) {
      console.error('Error loading tests:', err);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const filtered = useMemo(() => {
    return tests.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || 
                          t.code.toLowerCase().includes(search.toLowerCase()) || 
                          (t.shortName && t.shortName.toLowerCase().includes(search.toLowerCase()));
      const matchCat = !selectedCat || t.category === selectedCat;
      return matchSearch && matchCat;
    });
  }, [tests, search, selectedCat]);

  const sortedAndFiltered = useMemo(() => {
    let result = [...filtered];
    if (sortField) {
      result.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        return 0;
      });
    }
    return result;
  }, [filtered, sortField, sortDirection]);

  const getCategoryCount = (catName: string) => tests.filter(t => t.category === catName).length;

  const getCategoryColor = (catName: string): string => {
    return CATEGORY_COLORS[catName as keyof typeof CATEGORY_COLORS] || '#6B7280';
  };

  const openAddModal = () => {
    setForm({
      ...emptyForm,
      category: dbCategories.length > 0 ? dbCategories[0].name : 'Hematology',
      parameters: []
    });
    setEditingTest(null);
    setActiveTab('basic');
    setShowAddModal(true);
  };

  const openEditModal = async (test: Test) => {
    try {
      const fullTest = await db.query('test', 'findUnique', {
        where: { id: test.id },
        include: { parameters: { include: { refRanges: true } } }
      });
      if (fullTest) {
        setForm({
          code: fullTest.code,
          name: fullTest.name,
          shortName: fullTest.shortName || '',
          category: test.category,
          price: fullTest.price,
          duration: fullTest.duration || 1,
          sampleType: fullTest.sampleType || 'Whole Blood',
          container: fullTest.container || 'Purple Cap',
          parameters: (fullTest.parameters || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            unit: p.unit || '',
            sortOrder: p.sortOrder || 1,
            type: p.type || 'NUMERIC',
            options: p.options || '',
            isHeader: p.isHeader || false,
            refRanges: (p.refRanges || []).map((r: any) => ({
              id: r.id,
              gender: r.gender || null,
              normalMin: r.normalMin !== null ? String(r.normalMin) : '',
              normalMax: r.normalMax !== null ? String(r.normalMax) : '',
              criticalMin: r.criticalMin !== null ? String(r.criticalMin) : '',
              criticalMax: r.criticalMax !== null ? String(r.criticalMax) : '',
              textNormal: r.textNormal || ''
            }))
          })).sort((a: any, b: any) => a.sortOrder - b.sortOrder)
        });
        setEditingTest(test);
        setActiveTab('basic');
        setShowAddModal(true);
      }
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to load test details", type: "error" });
    }
  };

  const handleDeleteTest = async (testId: number) => {
    const test = tests.find(t => t.id === testId);
    if (!test) return;
    try {
      await db.query('test', 'update', {
        where: { id: testId },
        data: { isActive: false }
      });
      setToast({ message: `Test "${test.name}" deleted successfully`, type: 'success' });
      setShowDeleteConfirm(null);
      await fetchTests();
    } catch (err: any) {
      setToast({ message: `Failed to delete test: ${err.message || err}`, type: 'error' });
    }
  };

  // Parameter and Reference Range Handlers
  const addParameter = () => {
    const newParam: ParameterForm = {
      name: '',
      unit: '',
      sortOrder: form.parameters.length + 1,
      type: 'NUMERIC',
      options: '',
      isHeader: false,
      refRanges: []
    };
    setForm({
      ...form,
      parameters: [...form.parameters, newParam]
    });
  };

  const removeParameter = (index: number) => {
    const updated = [...form.parameters];
    updated.splice(index, 1);
    // Re-adjust sort order
    updated.forEach((p, idx) => { p.sortOrder = idx + 1; });
    setForm({ ...form, parameters: updated });
  };

  const moveParameter = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === form.parameters.length - 1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...form.parameters];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    // Re-assign sort orders
    updated.forEach((p, idx) => { p.sortOrder = idx + 1; });
    setForm({ ...form, parameters: updated });
  };

  const updateParameterField = (index: number, field: keyof ParameterForm, value: any) => {
    const updated = [...form.parameters];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, parameters: updated });
  };

  const addReferenceRange = (paramIdx: number) => {
    const updated = [...form.parameters];
    const newRange: RefRangeForm = {
      gender: null,
      normalMin: '',
      normalMax: '',
      criticalMin: '',
      criticalMax: '',
      textNormal: ''
    };
    updated[paramIdx].refRanges = [...updated[paramIdx].refRanges, newRange];
    setForm({ ...form, parameters: updated });
  };

  const removeReferenceRange = (paramIdx: number, rangeIdx: number) => {
    const updated = [...form.parameters];
    updated[paramIdx].refRanges.splice(rangeIdx, 1);
    setForm({ ...form, parameters: updated });
  };

  const updateReferenceRangeField = (paramIdx: number, rangeIdx: number, field: keyof RefRangeForm, value: any) => {
    const updated = [...form.parameters];
    updated[paramIdx].refRanges[rangeIdx] = { ...updated[paramIdx].refRanges[rangeIdx], [field]: value };
    setForm({ ...form, parameters: updated });
  };

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setToast({ message: 'Code and Name are required', type: 'error' });
      return;
    }
    
    const cat = dbCategories.find(c => c.name === form.category);
    const catId = cat ? cat.id : (dbCategories.length > 0 ? dbCategories[0].id : 1);

    // Prepare payload
    const testData: any = {
      code: form.code,
      name: form.name,
      shortName: form.shortName || null,
      categoryId: catId,
      price: Number(form.price),
      duration: Number(form.duration),
      sampleType: form.sampleType,
      container: form.container,
      isActive: true,
      parameters: form.parameters.map((p, pIdx) => ({
        id: p.id, // keeps the parameter id so results already saved against it stay attached
        name: p.name,
        unit: p.unit || null,
        sortOrder: pIdx + 1,
        type: p.type,
        options: p.options || null,
        isHeader: p.isHeader,
        refRanges: p.refRanges.map(r => ({
          gender: r.gender,
          normalMin: r.normalMin !== '' ? Number(r.normalMin) : null,
          normalMax: r.normalMax !== '' ? Number(r.normalMax) : null,
          criticalMin: r.criticalMin !== '' ? Number(r.criticalMin) : null,
          criticalMax: r.criticalMax !== '' ? Number(r.criticalMax) : null,
          textNormal: r.textNormal || null
        }))
      }))
    };

    try {
      if (editingTest) {
        await db.query('test', 'update', {
          where: { id: editingTest.id },
          data: testData
        });
        setToast({ message: `Test "${form.name}" updated successfully`, type: 'success' });
      } else {
        await db.query('test', 'create', {
          data: testData
        });
        setToast({ message: `Test "${form.name}" added successfully`, type: 'success' });
      }
      await fetchTests();
      setShowAddModal(false);
      setEditingTest(null);
    } catch (err: any) {
      console.error(err);
      setToast({ message: `Failed to save test: ${err.message || err}`, type: 'error' });
    }
  };

  const inputClass = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border";
  const selectClass = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border";
  const labelClass = "block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1";

  const refInputClass = "w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold border-border focus:outline-none focus:ring-2 focus:ring-primary";
  const refSelectClass = "w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold border-border focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <AppLayout title="Tests Catalog" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Tests' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search tests by name, code or short name..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border" />
          </div>
          <motion.button whileHover={{ scale: 1.02 }} onClick={openAddModal} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/95 transition-all btn-primary-glow"><Plus className="h-4 w-4" />Add Test</motion.button>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button onClick={() => setSelectedCat(null)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${!selectedCat ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent border-border'}`}>
            All ({tests.length})
          </button>
          {dbCategories.map((c) => (
            <button key={c.id} onClick={() => setSelectedCat(c.name)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${selectedCat === c.name ? 'text-white font-bold' : 'border hover:bg-accent border-border'}`}
              style={selectedCat === c.name ? { backgroundColor: getCategoryColor(c.name) } : {}}>
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: getCategoryColor(c.name) }} />
              {c.name} ({getCategoryCount(c.name)})
            </button>
          ))}
        </div>

        {/* Tests Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3.5"><SortHeader field="code" label="Code" /></th>
                  <th className="px-5 py-3.5"><SortHeader field="name" label="Test Name" /></th>
                  <th className="px-5 py-3.5"><SortHeader field="category" label="Category" /></th>
                  <th className="px-5 py-3.5"><SortHeader field="price" label="Price" /></th>
                  <th className="px-5 py-3.5"><SortHeader field="duration" label="TAT" /></th>
                  <th className="px-5 py-3.5">Sample</th>
                  <th className="px-5 py-3.5"><SortHeader field="params" label="Params" /></th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sortedAndFiltered.map((t, i) => (
                  <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.005 }}
                    className="hover:bg-accent/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-primary">{t.code}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-foreground">{t.name}</div>
                      {t.shortName && <div className="text-[11px] text-muted-foreground font-semibold">{t.shortName}</div>}
                    </td>
                    <td className="px-5 py-3.5"><span className="text-[11px] font-bold rounded-full px-2 py-0.5 border" style={{ backgroundColor: `${getCategoryColor(t.category)}15`, color: getCategoryColor(t.category), borderColor: `${getCategoryColor(t.category)}30` }}>{t.category}</span></td>
                    <td className="px-5 py-3.5 font-bold text-foreground">{formatCurrency(t.price)}</td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-muted-foreground">{t.duration}h</td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-muted-foreground">{t.sampleType}</td>
                    <td className="px-5 py-3.5"><span className="text-xs font-bold bg-muted/80 text-muted-foreground rounded-md px-2 py-0.5">{t.params}</span></td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => openEditModal(t)} className="btn-action bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"><Edit className="h-4 w-4" /></button>
                        <button onClick={() => setShowDeleteConfirm(t.id)} className="btn-action border-red-500/20 bg-background hover:bg-red-500/10 text-red-400 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {sortedAndFiltered.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-muted-foreground">No tests found in catalog</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Test Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]" 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-muted/10">
              <div>
                <h2 className="text-base font-bold text-foreground">{editingTest ? 'Edit Pathology Test' : 'Add New Pathology Test'}</h2>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                  {editingTest
                    ? 'New price, names and ranges apply to new orders and reports approved from now on; approved reports and old bills keep theirs.'
                    : 'Configure test settings, parameters, and reference ranges.'}
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-xl border hover:bg-accent border-border text-muted-foreground hover:text-foreground"><XIcon className="h-4 w-4" /></button>
            </div>

            {/* Tabs Selector */}
            <div className="flex border-b border-border px-6 shrink-0 bg-muted/5">
              <button onClick={() => setActiveTab('basic')}
                className={`py-3 px-5 text-sm font-bold border-b-2 -mb-[2px] transition-all ${activeTab === 'basic' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                1. Basic Info
              </button>
              <button onClick={() => setActiveTab('parameters')}
                className={`py-3 px-5 text-sm font-bold border-b-2 -mb-[2px] transition-all flex items-center gap-1.5 ${activeTab === 'parameters' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                2. Parameters ({form.parameters.length})
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'basic' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={labelClass}>Test Code *</label>
                      <input className={inputClass} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. HEM001" />
                    </div>
                    <div>
                      <label className={labelClass}>Short Name / Abbr.</label>
                      <input className={inputClass} value={form.shortName} onChange={e => setForm({ ...form, shortName: e.target.value })} placeholder="e.g. CBC" />
                    </div>
                    <div>
                      <label className={labelClass}>Category *</label>
                      <select className={selectClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                        {dbCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Full Test Name *</label>
                    <input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Complete Blood Count" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Price (₹) *</label>
                      <input type="number" className={inputClass} value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} min={0} />
                    </div>
                    <div>
                      <label className={labelClass}>TAT Duration (hours)</label>
                      <input type="number" className={inputClass} value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} min={1} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Sample Type</label>
                      <select className={selectClass} value={form.sampleType} onChange={e => setForm({ ...form, sampleType: e.target.value })}>
                        {SAMPLE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Container</label>
                      <select className={selectClass} value={form.container} onChange={e => setForm({ ...form, container: e.target.value })}>
                        {SAMPLE_CONTAINERS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'parameters' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Configure Test Parameters</h3>
                      <p className="text-[11px] text-muted-foreground">Add variables/sections, their measurement units and normal ref ranges.</p>
                    </div>
                    <button type="button" onClick={addParameter} className="flex items-center gap-1 text-xs font-semibold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 px-3.5 py-2 rounded-xl transition-colors"><PlusCircle className="h-4 w-4" />Add Parameter</button>
                  </div>

                  {form.parameters.length === 0 ? (
                    <div className="text-center py-12 border border-dashed rounded-xl border-border/80">
                      <p className="text-xs font-semibold text-muted-foreground">No parameters added to this test yet.</p>
                      <button type="button" onClick={addParameter} className="text-xs font-bold text-primary mt-2 inline-flex items-center gap-1 hover:underline">Click here to add the first parameter</button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {form.parameters.map((param, pIdx) => (
                        <div key={pIdx} className="border border-border rounded-xl p-4 bg-muted/5 relative space-y-3">
                          
                          {/* Param Header controls */}
                          <div className="flex items-center justify-between border-b border-border/40 pb-2">
                            <span className="text-[11px] font-bold text-primary uppercase font-mono">Parameter #{pIdx + 1}</span>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => moveParameter(pIdx, 'up')} disabled={pIdx === 0} className="btn-action hover:bg-accent border border-border disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                              <button type="button" onClick={() => moveParameter(pIdx, 'down')} disabled={pIdx === form.parameters.length - 1} className="btn-action hover:bg-accent border border-border disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                              <button type="button" onClick={() => removeParameter(pIdx)} className="btn-action hover:bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-500 transition-colors ml-2"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </div>

                          {/* Parameter details row */}
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="md:col-span-2">
                              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Parameter Name *</label>
                              <input className={inputClass} value={param.name} onChange={e => updateParameterField(pIdx, 'name', e.target.value)} placeholder="e.g. Hemoglobin" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Unit</label>
                              <input className={inputClass} value={param.unit} onChange={e => updateParameterField(pIdx, 'unit', e.target.value)} placeholder="e.g. g/dL" disabled={param.isHeader} />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Type</label>
                              <select className={selectClass} value={param.type} onChange={e => updateParameterField(pIdx, 'type', e.target.value)} disabled={param.isHeader}>
                                <option value="NUMERIC">Numeric</option>
                                <option value="TEXT">Free Text</option>
                                <option value="DROPDOWN">Dropdown Options</option>
                                <option value="CALCULATED">Calculated (Formula)</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 pt-1">
                            <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer select-none">
                              <input type="checkbox" checked={param.isHeader} onChange={e => updateParameterField(pIdx, 'isHeader', e.target.checked)} className="rounded border-border text-primary focus:ring-primary h-4 w-4" />
                              Is Section Header (e.g. "DIFFERENTIAL COUNT")
                            </label>
                          </div>

                          {param.type === 'DROPDOWN' && !param.isHeader && (
                            <div className="border border-border bg-card p-3 rounded-xl">
                              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Dropdown Choices *</label>
                              <input className={inputClass} value={param.options} onChange={e => updateParameterField(pIdx, 'options', e.target.value)} placeholder="Comma-separated options, e.g. Positive, Negative, Borderline" />
                            </div>
                          )}

                          {/* Reference Ranges nested section */}
                          {!param.isHeader && (
                            <div className="border border-border/80 bg-muted/20 p-4 rounded-xl space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Reference Ranges</span>
                                <button type="button" onClick={() => addReferenceRange(pIdx)} className="flex items-center gap-1 text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 px-3 py-1.5 rounded-xl transition-colors"><PlusCircle className="h-4 w-4" />Add Range</button>
                              </div>

                              {param.refRanges.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic">No gender/age specific ranges defined. Normal parameters won't trigger warnings.</p>
                              ) : (
                                <div className="space-y-2">
                                  {param.refRanges.map((range, rIdx) => (
                                    <div key={rIdx} className="grid grid-cols-1 md:grid-cols-6 gap-2 bg-card border border-border p-2.5 rounded-xl items-end">
                                      <div>
                                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Gender</label>
                                        <select className={refSelectClass} value={range.gender || ''} onChange={e => updateReferenceRangeField(pIdx, rIdx, 'gender', e.target.value === '' ? null : e.target.value)}>
                                          <option value="">Both / All</option>
                                          <option value="MALE">Male</option>
                                          <option value="FEMALE">Female</option>
                                        </select>
                                      </div>
                                      {param.type === 'NUMERIC' || param.type === 'CALCULATED' ? (
                                        <>
                                          <div>
                                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Norm Min</label>
                                            <input type="number" step="any" className={refInputClass} value={range.normalMin} onChange={e => updateReferenceRangeField(pIdx, rIdx, 'normalMin', e.target.value)} />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Norm Max</label>
                                            <input type="number" step="any" className={refInputClass} value={range.normalMax} onChange={e => updateReferenceRangeField(pIdx, rIdx, 'normalMax', e.target.value)} />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Crit Min</label>
                                            <input type="number" step="any" className={`${refInputClass} text-red-500 font-semibold`} value={range.criticalMin} onChange={e => updateReferenceRangeField(pIdx, rIdx, 'criticalMin', e.target.value)} />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Crit Max</label>
                                            <input type="number" step="any" className={`${refInputClass} text-red-500 font-semibold`} value={range.criticalMax} onChange={e => updateReferenceRangeField(pIdx, rIdx, 'criticalMax', e.target.value)} />
                                          </div>
                                        </>
                                      ) : (
                                        <div className="md:col-span-4">
                                          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Text Expected</label>
                                          <input type="text" className={refInputClass} value={range.textNormal} onChange={e => updateReferenceRangeField(pIdx, rIdx, 'textNormal', e.target.value)} placeholder="e.g. Negative or Not Detected" />
                                        </div>
                                      )}
                                      <div className="flex justify-end">
                                        <button type="button" onClick={() => removeReferenceRange(pIdx, rIdx)} className="btn-action flex items-center justify-center border-red-500/20 bg-background text-red-400 hover:text-red-500 hover:bg-red-500/5 transition-colors"><Trash2 className="h-4 w-4" /></button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center px-6 py-4 border-t border-border shrink-0 bg-muted/10">
              <div>
                {activeTab === 'basic' && form.parameters.length > 0 && (
                  <button type="button" onClick={() => setActiveTab('parameters')} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">Next: Edit Parameters &rarr;</button>
                )}
                {activeTab === 'parameters' && (
                  <button type="button" onClick={() => setActiveTab('basic')} className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">&larr; Back to Basic Details</button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-sm font-bold rounded-xl border border-border hover:bg-accent bg-background">Cancel</button>
                <button type="button" onClick={handleSubmit} className="px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground flex items-center gap-1.5 shadow-md hover:bg-primary/95 transition-all"><Save className="h-4 w-4" />{editingTest ? 'Save Changes' : 'Create Test'}</button>
              </div>
            </div>

          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteConfirm(null)}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Delete Test</h2>
              <button onClick={() => setShowDeleteConfirm(null)} className="p-1.5 rounded-xl border hover:bg-accent border-border text-muted-foreground hover:text-foreground">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete test <span className="font-semibold text-foreground">"{tests.find(t => t.id === showDeleteConfirm)?.name}"</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-5 py-2.5 text-sm font-bold rounded-xl border border-border hover:bg-accent bg-background">Cancel</button>
              <button onClick={() => handleDeleteTest(showDeleteConfirm)} className="px-5 py-2.5 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast-global fixed bottom-6 right-6 z-[200] ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
