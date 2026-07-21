"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Plus, Search, AlertTriangle, Package, ArrowDown, ArrowUp, Edit, XIcon, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  stock: number;
  min: number;
  max: number;
  unit: string;
  expiry: string;
  supplier: string;
  status: string;
}

function calcStatus(stock: number, min: number): string {
  if (stock <= Math.floor(min * 0.5)) return 'critical';
  if (stock < min) return 'low';
  return 'ok';
}

const MOCK_INVENTORY: InventoryItem[] = [
  { id: 1, name: 'EDTA Vacutainer Tubes (4ml)', category: 'TUBE', stock: 150, min: 100, max: 500, unit: 'pcs', expiry: '12/2026', supplier: 'Medisource India', status: 'ok' },
  { id: 2, name: 'Glucose Test Kit', category: 'KIT', stock: 8, min: 20, max: 100, unit: 'kits', expiry: '09/2026', supplier: 'BioRad Labs', status: 'low' },
  { id: 3, name: 'CBC Reagent Pack', category: 'REAGENT', stock: 1, min: 3, max: 10, unit: 'packs', expiry: '06/2026', supplier: 'Sysmex', status: 'critical' },
  { id: 4, name: 'Surgical Gloves (Size 7.0)', category: 'CONSUMABLE', stock: 350, min: 100, max: 1000, unit: 'pairs', expiry: '08/2027', supplier: 'Hospicare', status: 'ok' },
  { id: 5, name: 'Urine Container (50ml)', category: 'TUBE', stock: 120, min: 50, max: 500, unit: 'pcs', expiry: '—', supplier: 'Medisource India', status: 'ok' }
];

const inventoryCategories = ['REAGENT', 'TUBE', 'CONSUMABLE', 'KIT', 'CHEMICAL'];
const emptyForm = { name: '', category: 'REAGENT', stock: 0, min: 0, max: 0, unit: 'pcs', expiry: '', supplier: '' };

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  const [sortField, setSortField] = useState<keyof InventoryItem | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const requestSort = (field: keyof InventoryItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortField === field && sortDirection === 'asc') {
      direction = 'desc';
    }
    setSortField(field);
    setSortDirection(direction);
  };

  const SortHeader = ({ field, label }: { field: keyof InventoryItem; label: string }) => {
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pathology_lab_inventory');
      if (stored) {
        try {
          setItems(JSON.parse(stored));
        } catch (e) {
          setItems(MOCK_INVENTORY);
          localStorage.setItem('pathology_lab_inventory', JSON.stringify(MOCK_INVENTORY));
        }
      } else {
        setItems(MOCK_INVENTORY);
        localStorage.setItem('pathology_lab_inventory', JSON.stringify(MOCK_INVENTORY));
      }
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('pathology_lab_inventory', JSON.stringify(items));
    }
  }, [items, isLoaded]);
  const [filter, setFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [stockModal, setStockModal] = useState<{ item: InventoryItem; type: 'in' | 'out' } | null>(null);
  const [batchStockModal, setBatchStockModal] = useState(false);
  const [stockQty, setStockQty] = useState(0);
  const [batchItemId, setBatchItemId] = useState<number>(0);
  const [batchQty, setBatchQty] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'ALL' || (filter === 'LOW' && (i.status === 'low' || i.status === 'critical'));
      return matchSearch && matchFilter;
    });
  }, [items, search, filter]);

  const sortedItems = useMemo(() => {
    let result = [...filtered];
    if (sortField) {
      result.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // Expiry sorting
        if (sortField === 'expiry') {
          const parseExpiry = (expStr: string) => {
            if (!expStr || expStr === '—') return 0;
            const parts = expStr.split('/');
            if (parts.length === 2) {
              return new Date(parseInt(parts[1], 10), parseInt(parts[0], 10) - 1).getTime();
            }
            return 0;
          };
          return sortDirection === 'asc'
            ? parseExpiry(String(valA)) - parseExpiry(String(valB))
            : parseExpiry(String(valB)) - parseExpiry(String(valA));
        }

        // Status sorting
        if (sortField === 'status') {
          const statusWeights: Record<string, number> = { critical: 3, low: 2, ok: 1 };
          const weightA = statusWeights[a.status] || 0;
          const weightB = statusWeights[b.status] || 0;
          return sortDirection === 'asc' ? weightA - weightB : weightB - weightA;
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
  }, [filtered, sortField, sortDirection]);

  const lowStockCount = items.filter(i => i.status === 'low' || i.status === 'critical').length;

  const openAddModal = () => {
    setForm(emptyForm);
    setEditingItem(null);
    setShowAddModal(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setForm({ name: item.name, category: item.category, stock: item.stock, min: item.min, max: item.max, unit: item.unit, expiry: item.expiry, supplier: item.supplier });
    setEditingItem(item);
    setShowAddModal(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setToast({ message: 'Item name is required', type: 'error' });
      return;
    }
    if (editingItem) {
      setItems(prev => prev.map(it => it.id === editingItem.id ? {
        ...it,
        name: form.name,
        category: form.category,
        stock: Number(form.stock),
        min: Number(form.min),
        max: Number(form.max),
        unit: form.unit,
        expiry: form.expiry,
        supplier: form.supplier,
        status: calcStatus(Number(form.stock), Number(form.min)),
      } : it));
      setToast({ message: `"${form.name}" updated successfully`, type: 'success' });
    } else {
      const newItem: InventoryItem = {
        id: Date.now(),
        name: form.name,
        category: form.category,
        stock: Number(form.stock),
        min: Number(form.min),
        max: Number(form.max),
        unit: form.unit,
        expiry: form.expiry || '—',
        supplier: form.supplier,
        status: calcStatus(Number(form.stock), Number(form.min)),
      };
      setItems(prev => [...prev, newItem]);
      setToast({ message: `"${form.name}" added to inventory`, type: 'success' });
    }
    setShowAddModal(false);
    setEditingItem(null);
  };

  const handleStockUpdate = () => {
    if (!stockModal || stockQty <= 0) {
      setToast({ message: 'Enter a valid quantity', type: 'error' });
      return;
    }
    const { item, type } = stockModal;
    setItems(prev => prev.map(it => {
      if (it.id !== item.id) return it;
      const newStock = type === 'in' ? it.stock + stockQty : Math.max(0, it.stock - stockQty);
      return { ...it, stock: newStock, status: calcStatus(newStock, it.min) };
    }));
    setToast({ message: `${stockModal.type === 'in' ? 'Added' : 'Removed'} ${stockQty} ${item.unit} ${stockModal.type === 'in' ? 'to' : 'from'} "${item.name}"`, type: 'success' });
    setStockModal(null);
    setStockQty(0);
  };

  const handleBatchStockIn = () => {
    if (!batchItemId || batchQty <= 0) {
      setToast({ message: 'Select an item and enter a valid quantity', type: 'error' });
      return;
    }
    setItems(prev => prev.map(it => {
      if (it.id !== batchItemId) return it;
      const newStock = it.stock + batchQty;
      return { ...it, stock: newStock, status: calcStatus(newStock, it.min) };
    }));
    const item = items.find(it => it.id === batchItemId);
    setToast({ message: `Added ${batchQty} to "${item?.name}"`, type: 'success' });
    setBatchStockModal(false);
    setBatchItemId(0);
    setBatchQty(0);
  };

  const inputClass = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const selectClass = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const labelClass = "block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2";

  return (
    <AppLayout title="Inventory" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Inventory' }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search inventory..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setFilter(filter === 'LOW' ? 'ALL' : 'LOW')}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${filter === 'LOW' ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-950 dark:text-red-400' : 'hover:bg-accent'}`}>
              <AlertTriangle className="h-4 w-4" />Low Stock ({lowStockCount})
            </button>
            <button onClick={() => { setBatchStockModal(true); setBatchItemId(items[0]?.id || 0); setBatchQty(0); }} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-accent transition-colors"><ArrowDown className="h-4 w-4" />Stock In</button>
            <motion.button whileHover={{ scale: 1.02 }} onClick={openAddModal} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/95 transition-all shadow-sm hover:shadow-md"><Plus className="h-4 w-4" />Add Item</motion.button>
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <th className="px-5 py-3.5"><SortHeader field="name" label="Item" /></th>
                <th className="px-5 py-3.5"><SortHeader field="category" label="Category" /></th>
                <th className="px-5 py-3.5"><SortHeader field="stock" label="Stock" /></th>
                <th className="px-5 py-3.5"><SortHeader field="min" label="Min/Max" /></th>
                <th className="px-5 py-3.5"><SortHeader field="expiry" label="Expiry" /></th>
                <th className="px-5 py-3.5"><SortHeader field="supplier" label="Supplier" /></th>
                <th className="px-5 py-3.5"><SortHeader field="status" label="Status" /></th>
                <th className="px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, i) => (
                <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className={`border-b hover:bg-accent/50 transition-colors ${
                    item.status === 'critical'
                      ? 'bg-red-50 dark:bg-red-950/20'
                      : i % 2 === 0
                      ? 'bg-background'
                      : 'bg-muted/30 dark:bg-muted/10'
                  }`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Package className={`h-4 w-4 ${item.status === 'critical' ? 'text-red-500' : item.status === 'low' ? 'text-orange-500' : 'text-muted-foreground'}`} />
                      <span className="font-medium text-foreground">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><span className="text-[11px] font-semibold rounded-full bg-secondary text-secondary-foreground dark:bg-muted dark:text-muted-foreground px-2.5 py-1">{item.category}</span></td>
                  <td className="px-5 py-3.5 font-bold">{item.stock} {item.unit}</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{item.min} / {item.max}</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{item.expiry}</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{item.supplier}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold
                      ${item.status === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 animate-pulse' :
                        item.status === 'low' ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400' :
                        'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'}`}>
                      {item.status === 'critical' ? '⚠ Critical' : item.status === 'low' ? '↓ Low' : '✓ OK'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1.5">
                      <button onClick={() => { setStockModal({ item, type: 'in' }); setStockQty(0); }} className="btn-action text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 animate-fade-in-up" title="Stock In"><ArrowDown className="h-4 w-4" /></button>
                      <button onClick={() => { setStockModal({ item, type: 'out' }); setStockQty(0); }} className="btn-action text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 animate-fade-in-up" title="Stock Out"><ArrowUp className="h-4 w-4" /></button>
                      <button onClick={() => openEditModal(item)} className="btn-action text-muted-foreground hover:bg-accent animate-fade-in-up" title="Edit"><Edit className="h-4 w-4" /></button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {sortedItems.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-muted-foreground">No items found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><XIcon className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className={labelClass}>Item Name *</label>
                <input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. EDTA Tube" />
              </div>
              <div>
                <label className={labelClass}>Category</label>
                <select className={selectClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {inventoryCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Stock</label>
                  <input type="number" className={inputClass} value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} min={0} />
                </div>
                <div>
                  <label className={labelClass}>Min</label>
                  <input type="number" className={inputClass} value={form.min} onChange={e => setForm({ ...form, min: Number(e.target.value) })} min={0} />
                </div>
                <div>
                  <label className={labelClass}>Max</label>
                  <input type="number" className={inputClass} value={form.max} onChange={e => setForm({ ...form, max: Number(e.target.value) })} min={0} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Unit</label>
                  <input className={inputClass} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="e.g. pcs, kits" />
                </div>
                <div>
                  <label className={labelClass}>Expiry</label>
                  <input className={inputClass} value={form.expiry} onChange={e => setForm({ ...form, expiry: e.target.value })} placeholder="MM/YYYY" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Supplier</label>
                <input className={inputClass} value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier name" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5 pt-4 border-t">
              <button onClick={() => setShowAddModal(false)} className="py-2.5 px-5 text-sm font-bold rounded-xl border hover:bg-accent transition-colors">Cancel</button>
              <button onClick={handleSubmit} className="py-2.5 px-5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">{editingItem ? 'Update' : 'Add Item'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock In / Stock Out Modal */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setStockModal(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{stockModal.type === 'in' ? 'Stock In' : 'Stock Out'}</h2>
              <button onClick={() => setStockModal(null)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><XIcon className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-1 font-semibold">{stockModal.item.name}</p>
            <p className="text-xs text-muted-foreground mb-4">Current stock: <span className="font-bold text-foreground">{stockModal.item.stock} {stockModal.item.unit}</span></p>
            <div>
              <label className={labelClass}>Quantity to {stockModal.type === 'in' ? 'add' : 'remove'}</label>
              <input type="number" className={inputClass} value={stockQty || ''} onChange={e => setStockQty(Number(e.target.value))} min={1} max={stockModal.type === 'out' ? stockModal.item.stock : undefined} autoFocus />
            </div>
            <div className="flex justify-end gap-3 mt-5 pt-4 border-t">
              <button onClick={() => setStockModal(null)} className="py-2.5 px-5 text-sm font-bold rounded-xl border hover:bg-accent transition-colors">Cancel</button>
              <button onClick={handleStockUpdate} className={`py-2.5 px-5 text-sm font-bold rounded-xl text-white transition-colors ${stockModal.type === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {stockModal.type === 'in' ? 'Add Stock' : 'Remove Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Stock In Modal */}
      {batchStockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setBatchStockModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Batch Stock In</h2>
              <button onClick={() => setBatchStockModal(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><XIcon className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Select Item</label>
                <select className={selectClass} value={batchItemId} onChange={e => setBatchItemId(Number(e.target.value))}>
                  {items.map(it => <option key={it.id} value={it.id}>{it.name} (current: {it.stock} {it.unit})</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Quantity to Add</label>
                <input type="number" className={inputClass} value={batchQty || ''} onChange={e => setBatchQty(Number(e.target.value))} min={1} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5 pt-4 border-t">
              <button onClick={() => setBatchStockModal(false)} className="py-2.5 px-5 text-sm font-bold rounded-xl border hover:bg-accent transition-colors">Cancel</button>
              <button onClick={handleBatchStockIn} className="py-2.5 px-5 text-sm font-bold rounded-xl bg-green-600 hover:bg-green-700 text-white transition-colors">Add Stock</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'} fixed bottom-6 right-6 z-[200]`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
