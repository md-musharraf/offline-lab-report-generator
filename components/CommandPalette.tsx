"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, FileText, CornerDownLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { navSections, isItemAllowed } from '@/components/Sidebar';

type Item = { key: string; group: string; label: string; hint?: string; href: string; icon: React.ElementType; shortcut?: string };

// Ctrl+K palette: jump to any screen, patient (name / ID / mobile) or order number from the keyboard.
export function CommandPalette({ open, onClose, role }: { open: boolean; onClose: () => void; role: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setRecords([]);
      setActive(0);
    }
  }, [open]);

  const pages = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    return navSections
      .flatMap(s => s.items)
      .filter(i => isItemAllowed(i.href, role) && (!q || i.name.toLowerCase().includes(q)))
      .slice(0, q ? 5 : 8)
      .map(i => ({ key: i.href, group: 'Go to', label: i.name, href: i.href, icon: i.icon, shortcut: i.shortcut }));
  }, [query, role]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [patients, orders] = await Promise.all([
          db.query('patient', 'findMany', {
            where: { deletedAt: null, OR: [{ name: { contains: q } }, { id: { contains: q } }, { mobile: { contains: q } }] },
            orderBy: { registeredAt: 'desc' },
            take: 6,
          }),
          db.query('testOrder', 'findMany', {
            where: { orderNo: { contains: q } },
            include: { patient: true },
            orderBy: { createdAt: 'desc' },
            take: 4,
          }),
        ]);
        if (cancelled) return;
        setRecords([
          ...(patients || []).map((p: any) => ({
            key: `p-${p.id}`, group: 'Patients', label: p.name, hint: `${p.id} · ${p.age} ${String(p.ageUnit || 'Y')[0]} · ${p.gender?.[0] || ''} · ${p.mobile || ''}`,
            href: `/patients/detail?id=${encodeURIComponent(p.id)}`, icon: User,
          })),
          ...(orders || []).map((o: any) => ({
            key: `o-${o.id}`, group: 'Orders', label: o.orderNo, hint: `${o.patient?.name || ''} · ${o.status}`,
            href: `/results/entry?orderId=${o.id}`, icon: FileText,
          })),
        ]);
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const items = [...records, ...pages];
  useEffect(() => setActive(0), [query, records.length]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (item?: Item) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-slate-900/40 pt-[12vh] px-4 animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        data-enter-native
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search patients, order numbers or screens…"
            aria-label="Search patients, order numbers or screens"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={items[active] ? `cmd-${items[active].key}` : undefined}
            className="h-12 flex-1 border-0 bg-transparent text-[15px] shadow-none outline-none focus:shadow-none focus:ring-0 focus:bg-transparent"
            style={{ minHeight: 48, boxShadow: 'none' }}
          />
          <kbd>Esc</kbd>
        </div>
        <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {query.trim().length < 2 ? 'Type at least 2 characters to search records.' : 'No matching patients, orders or screens.'}
            </div>
          )}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {header && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{header}</div>}
                <div
                  id={`cmd-${item.key}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-accent text-accent-foreground' : ''}`}
                >
                  <item.icon className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="font-medium truncate">{item.label}</span>
                  {item.hint && <span className="truncate text-xs text-muted-foreground">{item.hint}</span>}
                  <span className="ml-auto flex items-center gap-2">
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 opacity-60" />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span><kbd>↑</kbd> <kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span className="ml-auto"><kbd>F2</kbd> Entry <kbd>F3</kbd> Results <kbd>F4</kbd> Reports <kbd>F6</kbd> Patients <kbd>F7</kbd> Billing</span>
        </div>
      </div>
    </div>
  );
}
