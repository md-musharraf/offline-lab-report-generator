"use client";
import { AppLayout } from '@/components/AppLayout';
import { useMemo, useState } from 'react';
import { Plus, Edit, Search, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, FileText, Archive } from 'lucide-react';
import { db } from '@/lib/db';
import { makeTablePdf, downloadPdf, rupees } from '@/lib/pdf-table';
import { Field, Modal, ToastView, useToast, useLive, postApi, inputCls, btnPrimary, btnGhost, card, th, td, dateText, todayInput } from '@/components/kit';

// Reagents, tubes and consumables with stock in / out history, saved on this PC.

const CATEGORIES = ['REAGENT', 'KIT', 'TUBE', 'CONSUMABLE', 'CHEMICAL', 'OTHER'];
const UNITS = ['pcs', 'packs', 'kits', 'boxes', 'ml', 'L', 'tests', 'pairs', 'vials'];

type Item = {
  id: number; name: string; category: string; unit: string; currentStock: number; minStock: number; maxStock: number | null;
  expiryDate: string | null; supplierName: string | null; batchNumber: string | null; purchasePrice: number | null;
};
type Move = { id: number; type: string; quantity: number; note: string | null; createdAt: string };

const emptyItem = { id: 0, name: '', category: 'REAGENT', unit: 'pcs', currentStock: '', minStock: '', maxStock: '', expiryDate: '', supplierName: '', batchNumber: '', purchasePrice: '' };
const DAY = 864e5;

// out / critical (<= half the minimum) / low / expired / expiring within 30 days / ok
function status(it: Item) {
  const exp = it.expiryDate ? new Date(it.expiryDate).getTime() : null;
  if (exp && exp < Date.now()) return { key: 'EXPIRED', label: 'Expired', cls: 'bg-destructive/10 text-destructive' };
  if (it.currentStock <= 0) return { key: 'OUT', label: 'Out of stock', cls: 'bg-destructive/10 text-destructive' };
  if (it.currentStock <= it.minStock * 0.5) return { key: 'CRITICAL', label: 'Critical', cls: 'bg-destructive/10 text-destructive' };
  if (it.currentStock <= it.minStock) return { key: 'LOW', label: 'Low', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' };
  if (exp && exp - Date.now() < 30 * DAY) return { key: 'EXPIRING', label: 'Expiring soon', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' };
  return { key: 'OK', label: 'In stock', cls: 'bg-green-600/10 text-green-700 dark:text-green-400' };
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'ATTENTION'>('ALL');
  const [form, setForm] = useState<typeof emptyItem | null>(null);
  const [history, setHistory] = useState<Move[]>([]);
  const [move, setMove] = useState<{ item: Item; type: 'IN' | 'OUT' | 'ADJUST'; quantity: string; note: string } | null>(null);
  const [toast, showToast] = useToast();

  const load = () => db.query('inventoryItem', 'findMany', { where: { isActive: true }, orderBy: { name: 'asc' } }).then(setItems).catch(err => showToast(err.message, 'error'));
  useLive(load, ['inventoryItem']);

  const attention = items.filter(i => status(i).key !== 'OK');
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (filter === 'ATTENTION' ? attention : items).filter(i => !q || i.name.toLowerCase().includes(q) || (i.supplierName || '').toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  }, [items, attention, search, filter]);
  const stockValue = items.reduce((s, i) => s + (i.purchasePrice || 0) * Math.max(i.currentStock, 0), 0);

  const openEdit = async (it?: Item) => {
    if (!it) {
      setHistory([]);
      setForm({ ...emptyItem });
      return;
    }
    setForm({
      id: it.id, name: it.name, category: it.category, unit: it.unit, currentStock: String(it.currentStock), minStock: String(it.minStock),
      maxStock: it.maxStock === null ? '' : String(it.maxStock), expiryDate: it.expiryDate ? new Date(it.expiryDate).toISOString().slice(0, 10) : '',
      supplierName: it.supplierName || '', batchNumber: it.batchNumber || '', purchasePrice: it.purchasePrice === null ? '' : String(it.purchasePrice),
    });
    setHistory(await db.query('inventoryTransaction', 'findMany', { where: { itemId: it.id }, orderBy: { createdAt: 'desc' }, take: 15 }).catch(() => []));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const num = (v: string) => (v === '' ? null : Number(v));
    const data: any = {
      name: form.name.trim(), category: form.category, unit: form.unit, minStock: Number(form.minStock || 0), maxStock: num(form.maxStock),
      expiryDate: form.expiryDate ? new Date(`${form.expiryDate}T12:00:00`) : null, supplierName: form.supplierName.trim() || null,
      batchNumber: form.batchNumber.trim() || null, purchasePrice: num(form.purchasePrice),
    };
    if (!data.name) return showToast('Item name is required', 'error');
    try {
      if (form.id) {
        await db.query('inventoryItem', 'update', { where: { id: form.id }, data });
      } else {
        const created = await db.query('inventoryItem', 'create', { data: { ...data, currentStock: 0 } });
        const opening = Number(form.currentStock || 0);
        if (opening > 0) await postApi('inventory/move', { itemId: created.id, type: 'IN', quantity: opening, note: 'Opening stock' });
      }
      setForm(null);
      showToast(`${data.name} saved`);
      load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const saveMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!move) return;
    try {
      const { item } = await postApi('inventory/move', { itemId: move.item.id, type: move.type, quantity: Number(move.quantity), note: move.note });
      setMove(null);
      showToast(`${item.name}: now ${item.currentStock} ${item.unit}`);
      load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const archive = async (it: Item) => {
    await db.query('inventoryItem', 'update', { where: { id: it.id }, data: { isActive: false } }).catch(err => showToast(err.message, 'error'));
    setForm(null);
    showToast(`${it.name} archived`);
    load();
  };

  const exportPdf = async () => {
    const bytes = await makeTablePdf({
      title: 'Stock register',
      subtitle: `${shown.length} items · stock value ${rupees(stockValue)} · ${attention.length} need attention`,
      landscape: true,
      columns: [{ header: 'Item', width: 26 }, { header: 'Category', width: 10 }, { header: 'In stock', width: 10, align: 'right' }, { header: 'Min', width: 7, align: 'right' }, { header: 'Status', width: 12 }, { header: 'Expiry', width: 11 }, { header: 'Batch', width: 10 }, { header: 'Supplier', width: 16 }],
      rows: shown.map(i => [i.name, i.category, `${i.currentStock} ${i.unit}`, i.minStock, status(i).label, i.expiryDate ? dateText(i.expiryDate) : '', i.batchNumber || '', i.supplierName || '']),
    });
    downloadPdf(bytes, `stock-register-${todayInput()}.pdf`);
  };

  const MoveBtn = ({ it, type, Icon, label }: { it: Item; type: 'IN' | 'OUT' | 'ADJUST'; Icon: React.ElementType; label: string }) => (
    <button className="btn-action" title={label} aria-label={`${label}: ${it.name}`} onClick={() => setMove({ item: it, type, quantity: type === 'ADJUST' ? String(it.currentStock) : '', note: '' })}><Icon className="h-4 w-4" /></button>
  );

  return (
    <AppLayout title="Inventory" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Inventory' }]}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className={`${card} p-5`}><div className="text-xs font-medium text-muted-foreground">Items</div><div className="mt-1 text-2xl font-bold">{items.length}</div></div>
          <button onClick={() => setFilter(filter === 'ATTENTION' ? 'ALL' : 'ATTENTION')} className={`${card} p-5 text-left ${filter === 'ATTENTION' ? 'ring-2 ring-primary' : ''}`}>
            <div className="text-xs font-medium text-muted-foreground">Need attention (low, out, expiring)</div>
            <div className={`mt-1 text-2xl font-bold ${attention.length ? 'text-destructive' : ''}`} data-testid="stock-attention">{attention.length}</div>
          </button>
          <div className={`${card} p-5`}><div className="text-xs font-medium text-muted-foreground">Stock value (at purchase price)</div><div className="mt-1 text-2xl font-bold tabular-nums">{rupees(stockValue)}</div></div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item, supplier, category" aria-label="Search stock" className={`${inputCls} pl-9`} />
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={exportPdf} className={btnGhost}><FileText className="h-4 w-4" /> PDF register</button>
            <button onClick={() => openEdit()} className={btnPrimary}><Plus className="h-4 w-4" /> Add item</button>
          </div>
        </div>

        <div className={`${card} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40"><tr><th className={th}>Item</th><th className={th}>Category</th><th className={`${th} text-right`}>In stock</th><th className={`${th} text-right`}>Min</th><th className={th}>Status</th><th className={th}>Expiry</th><th className={th}>Supplier</th><th className={`${th} text-right`}>Stock in / out</th></tr></thead>
            <tbody className="divide-y">
              {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">{items.length ? 'Nothing matches.' : 'No stock items yet. Add your reagents, kits and tubes to get low-stock and expiry alerts.'}</td></tr>}
              {shown.map(it => {
                const st = status(it);
                return (
                  <tr key={it.id} data-testid={`stock-row-${it.name}`}>
                    <td className={td}><button onClick={() => openEdit(it)} className="text-left font-medium hover:underline">{it.name}</button>{it.batchNumber && <div className="text-xs text-muted-foreground">Batch {it.batchNumber}</div>}</td>
                    <td className={`${td} text-muted-foreground`}>{it.category}</td>
                    <td className={`${td} text-right font-semibold tabular-nums`}>{it.currentStock} {it.unit}</td>
                    <td className={`${td} text-right tabular-nums text-muted-foreground`}>{it.minStock}</td>
                    <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                    <td className={`${td} text-muted-foreground`}>{it.expiryDate ? dateText(it.expiryDate) : '—'}</td>
                    <td className={`${td} text-muted-foreground`}>{it.supplierName || '—'}</td>
                    <td className={td}>
                      <div className="flex justify-end gap-1.5">
                        <MoveBtn it={it} type="IN" Icon={ArrowDownToLine} label="Stock in" />
                        <MoveBtn it={it} type="OUT" Icon={ArrowUpFromLine} label="Stock out" />
                        <MoveBtn it={it} type="ADJUST" Icon={SlidersHorizontal} label="Correct count" />
                        <button className="btn-action" aria-label={`Edit ${it.name}`} onClick={() => openEdit(it)}><Edit className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal title={form.id ? 'Edit stock item' : 'Add stock item'} onClose={() => setForm(null)} wide>
          <form onSubmit={save} className="grid grid-cols-2 gap-4">
            <Field label="Item name *" className="col-span-2"><input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. CBC reagent pack" /></Field>
            <Field label="Category"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Unit"><select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className={inputCls}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
            {!form.id && <Field label="Opening stock"><input type="number" min="0" step="any" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} className={inputCls} /></Field>}
            <Field label="Alert below (minimum)"><input type="number" min="0" step="any" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} className={inputCls} /></Field>
            <Field label="Maximum"><input type="number" min="0" step="any" value={form.maxStock} onChange={e => setForm({ ...form, maxStock: e.target.value })} className={inputCls} /></Field>
            <Field label="Expiry date"><input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} className={inputCls} /></Field>
            <Field label="Batch / lot no."><input type="text" value={form.batchNumber} onChange={e => setForm({ ...form, batchNumber: e.target.value })} className={inputCls} /></Field>
            <Field label="Purchase price per unit (₹)"><input type="number" min="0" step="any" value={form.purchasePrice} onChange={e => setForm({ ...form, purchasePrice: e.target.value })} className={inputCls} /></Field>
            <Field label="Supplier" className="col-span-2"><input type="text" value={form.supplierName} onChange={e => setForm({ ...form, supplierName: e.target.value })} className={inputCls} /></Field>
            {form.id > 0 && (
              <div className="col-span-2">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Recent stock movements</div>
                <div className="max-h-40 overflow-y-auto rounded-lg border text-sm">
                  {history.length === 0 && <div className="px-3 py-2 text-muted-foreground">No movements yet.</div>}
                  {history.map(h => (
                    <div key={h.id} className="flex justify-between border-b px-3 py-1.5 last:border-0">
                      <span>{h.type === 'IN' ? 'In' : h.type === 'OUT' ? 'Out' : 'Corrected to'} {h.quantity}{h.note ? ` · ${h.note}` : ''}</span>
                      <span className="text-muted-foreground">{new Date(h.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="col-span-2 mt-2 flex items-center gap-2">
              {form.id > 0 && <button type="button" onClick={() => archive(items.find(i => i.id === form.id)!)} className={`${btnGhost} text-destructive`}><Archive className="h-4 w-4" /> Archive item</button>}
              <button type="button" onClick={() => setForm(null)} className={`${btnGhost} ml-auto`}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save item</button>
            </div>
          </form>
        </Modal>
      )}

      {move && (
        <Modal title={`${move.type === 'IN' ? 'Stock in' : move.type === 'OUT' ? 'Stock out (used / wasted)' : 'Correct the count'} · ${move.item.name}`} onClose={() => setMove(null)}>
          <form onSubmit={saveMove} className="space-y-4">
            <p className="text-sm text-muted-foreground">Now in stock: <span className="font-semibold text-foreground">{move.item.currentStock} {move.item.unit}</span></p>
            <Field label={move.type === 'ADJUST' ? `Actual count (${move.item.unit})` : `Quantity (${move.item.unit})`}>
              <input type="number" min="0" step="any" required autoFocus value={move.quantity} onChange={e => setMove({ ...move, quantity: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Note"><input type="text" value={move.note} onChange={e => setMove({ ...move, note: e.target.value })} className={inputCls} placeholder={move.type === 'IN' ? 'Invoice / supplier' : 'Reason'} /></Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMove(null)} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save</button>
            </div>
          </form>
        </Modal>
      )}
      <ToastView toast={toast} />
    </AppLayout>
  );
}
