"use client";
import { Sidebar } from '@/components/Sidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Moon, Sun, LogOut, ChevronRight, WifiOff, Send, ShieldAlert } from 'lucide-react';
import { useEnterAsTab } from '@/lib/useEnterAsTab';
import { useRouter, usePathname } from 'next/navigation';
import { canOpen, roleLabel } from '@/lib/roles';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
}

const SHORTCUTS: Record<string, string> = {
  F2: '/quick-register',
  F3: '/results',
  F4: '/reports',
  F6: '/patients',
  F7: '/billing',
};

const readOutbox = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem('pathology_lab_outbox_queue') || '[]');
  } catch {
    return [];
  }
};

export function AppLayout({ children, title, breadcrumbs }: AppLayoutProps) {
  const [darkMode, setDarkMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [outboxCount, setOutboxCount] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const currentUserRole = useRef<string | null>(null);
  currentUserRole.current = currentUser?.role || null;

  // Enter moves to the next field on every form.
  useEnterAsTab();

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains('dark'));
    setIsOnline(navigator.onLine);
    setOutboxCount(readOutbox().length);
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    const storage = () => setOutboxCount(readOutbox().length);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('storage', storage);
    };
  }, []);

  // Session: first-run setup goes to /setup, otherwise a signed-in user is required.
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/setup-status');
        const data = await res.json();
        if (res.ok && data.isSetupRequired) {
          router.push('/setup');
          return;
        }
      } catch (e) {
        console.error('Failed to check setup status:', e);
      }
      // The backend session is the source of truth; localStorage only remembers it for the screens.
      const saved = (() => {
        try {
          return JSON.parse(localStorage.getItem('pathology_lab_current_user') || 'null');
        } catch {
          return null;
        }
      })();
      const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => null);
      const user = me?.user && saved?.id === me.user.id ? me.user : null;
      if (!user) {
        localStorage.removeItem('pathology_lab_current_user');
        router.push('/login');
        return;
      }
      setCurrentUser(user);
      setSessionLoading(false);
    };
    checkSession();
  }, [router]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      } else if (SHORTCUTS[e.key] && !e.ctrlKey && !e.altKey && canOpen(currentUserRole.current, SHORTCUTS[e.key])) {
        e.preventDefault();
        setPaletteOpen(false);
        router.push(SHORTCUTS[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('jharlab_theme', next ? 'dark' : 'light');
    } catch {}
  };

  // WhatsApp / e-mail alerts queued while offline are sent when the user asks, not by popping windows unprompted.
  const deliverOutbox = useCallback(() => {
    const queue = readOutbox();
    for (const msg of queue) {
      if (msg.type === 'WhatsApp') {
        const digits = String(msg.contact || '').replace(/\D/g, '');
        const phone = digits.length === 10 ? `91${digits}` : digits;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg.text || '')}`, '_blank');
      } else {
        window.open(`mailto:?subject=${encodeURIComponent(msg.subject || '')}&body=${encodeURIComponent(msg.body || '')}`, '_blank');
      }
    }
    localStorage.setItem('pathology_lab_outbox_queue', '[]');
    setOutboxCount(0);
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('pathology_lab_current_user');
    router.push('/login');
  };

  if (sessionLoading || !currentUser) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  const allowed = canOpen(currentUser.role, pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-6">
          <div className="min-w-0">
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                    {crumb.href ? (
                      <button onClick={() => router.push(crumb.href!)} className="hover:text-foreground hover:underline">{crumb.label}</button>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
          </div>

          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex h-9 w-72 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Search className="h-4 w-4" />
            <span>Search patients, orders…</span>
            <kbd className="ml-auto">Ctrl K</kbd>
          </button>

          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400" title="Everything keeps working offline. Online features (licence check, updates, WhatsApp links) resume when connected.">
              <WifiOff className="h-3.5 w-3.5" /> Offline
            </span>
          )}

          {outboxCount > 0 && (
            <button
              onClick={deliverOutbox}
              disabled={!isOnline}
              title={isOnline ? 'Send the queued WhatsApp / e-mail alerts now' : 'Queued alerts can be sent once you are online'}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Send {outboxCount} queued alert{outboxCount > 1 ? 's' : ''}
            </button>
          )}

          <button
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            title={darkMode ? 'Light theme' : 'Dark theme'}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {darkMode ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-accent"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground select-none">
                {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="hidden text-left leading-tight md:block">
                <div className="max-w-[140px] truncate text-[13px] font-semibold text-foreground">{currentUser?.name || 'User'}</div>
                <div className="text-[11px] text-muted-foreground">{roleLabel(currentUser.role)}</div>
              </div>
            </button>
            <AnimatePresence>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-lg border bg-popover p-1 shadow-lg"
                  >
                    <div className="border-b px-3 py-2">
                      <p className="truncate text-sm font-semibold">{currentUser?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{currentUser?.email}</p>
                    </div>
                    <button
                      role="menuitem"
                      onClick={logout}
                      className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <motion.div key={pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
            {allowed ? (
              children
            ) : (
              <div className="flex min-h-[50vh] items-center justify-center p-8">
                <div className="flex max-w-md flex-col items-center rounded-xl border bg-card p-8 text-center shadow-sm">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <h2 className="mb-1 text-lg font-semibold">You don&apos;t have access to {title}</h2>
                  <p className="mb-6 text-sm text-muted-foreground">Ask the lab owner to grant you this permission.</p>
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Back to dashboard
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} role={currentUser.role} />
    </div>
  );
}
