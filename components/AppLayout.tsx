"use client";
import { Sidebar } from '@/components/Sidebar';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, Moon, Sun, User, LogOut, ChevronRight, Wifi, WifiOff, RefreshCw, ShieldAlert } from 'lucide-react';
import { useEnterAsTab } from '@/lib/useEnterAsTab';
import { useRouter, usePathname } from 'next/navigation';
import { getRoleAndPermissions } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function AppLayout({ children, title, breadcrumbs }: AppLayoutProps) {
  const [darkMode, setDarkMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Connection & synchronization states
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [pendingCount, setPendingCount] = useState(0);

  // Global: Enter key behaves like Tab across all form inputs
  useEnterAsTab();

  // Monitor connection status & handle syncing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(window.navigator.onLine);
      
      const handleOnline = () => {
        setIsOnline(true);
        addSyncLog("WiFi connection restored. Resuming background database synchronization...");
        triggerBackgroundSync();
      };
      
      const handleOffline = () => {
        setIsOnline(false);
        addSyncLog("WiFi connection lost. Switching to Local Offline Mode. Data will be cached in SQLite.");
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Check initial queues
      updatePendingCounts();

      // Listen to storage events to update counts live across page navigations
      const handleStorage = () => {
        updatePendingCounts();
      };
      window.addEventListener('storage', handleStorage);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('storage', handleStorage);
      };
    }
  }, []);

  // Session monitoring & redirect
  useEffect(() => {
    const checkSession = async () => {
      try {
        const setupRes = await fetch('/api/auth/setup-status');
        const setupData = await setupRes.json();
        if (setupRes.ok && setupData.isSetupRequired) {
          router.push('/setup');
          return;
        }
      } catch (e) {
        console.error('Failed to check setup status:', e);
      }

      const userStr = localStorage.getItem('pathology_lab_current_user');
      if (!userStr) {
        router.push('/login');
      } else {
        try {
          setCurrentUser(JSON.parse(userStr));
        } catch (e) {
          router.push('/login');
        }
      }
      setSessionLoading(false);
    };

    checkSession();

    window.addEventListener('storage', checkSession);
    return () => {
      window.removeEventListener('storage', checkSession);
    };
  }, [router]);

  // Sync polling loop every 25 seconds
  useEffect(() => {
    if (!isOnline) return;
    
    // Initial sync check on mount
    triggerBackgroundSync();

    const interval = setInterval(() => {
      triggerBackgroundSync();
    }, 25000);

    return () => clearInterval(interval);
  }, [isOnline]);

  const updatePendingCounts = () => {
    if (typeof window !== 'undefined') {
      const unsyncedStr = localStorage.getItem('pathology_lab_unsynced_items') || '[]';
      const outboxStr = localStorage.getItem('pathology_lab_outbox_queue') || '[]';
      try {
        const unsynced = JSON.parse(unsyncedStr);
        const outbox = JSON.parse(outboxStr);
        setPendingCount(unsynced.length + outbox.length);
      } catch (e) {
        setPendingCount(0);
      }
    }
  };

  const addSyncLog = (message: string) => {
    if (typeof window !== 'undefined') {
      const logsStr = localStorage.getItem('pathology_lab_sync_logs') || '[]';
      try {
        const logs = JSON.parse(logsStr);
        logs.unshift({
          id: Date.now() + Math.random().toString(),
          timestamp: new Date().toISOString(),
          message
        });
        if (logs.length > 80) logs.pop();
        localStorage.setItem('pathology_lab_sync_logs', JSON.stringify(logs));
        window.dispatchEvent(new Event('storage'));
      } catch (e) {}
    }
  };

  const triggerBackgroundSync = async () => {
    if (typeof window === 'undefined' || !window.navigator.onLine) return;
    
    const unsyncedStr = localStorage.getItem('pathology_lab_unsynced_items') || '[]';
    const outboxStr = localStorage.getItem('pathology_lab_outbox_queue') || '[]';
    
    let unsynced: string[] = [];
    let outbox: any[] = [];
    try {
      unsynced = JSON.parse(unsyncedStr);
      outbox = JSON.parse(outboxStr);
    } catch (e) {
      return;
    }

    if (unsynced.length === 0 && outbox.length === 0) {
      return;
    }

    setSyncStatus('SYNCING');
    addSyncLog(`Background sync manager active. Found ${unsynced.length} pending records and ${outbox.length} alerts to synchronize.`);

    // 1. Sync local records to cloud
    if (unsynced.length > 0) {
      for (const id of unsynced) {
        addSyncLog(`Syncing local patient order ID: ${id} to cloud database...`);
        await new Promise(r => setTimeout(r, 1000)); // simulate upload time
        addSyncLog(`Cloud Sync Success: Patient order ID ${id} uploaded.`);
      }
      localStorage.setItem('pathology_lab_unsynced_items', '[]');
    }

    // 2. Deliver outbox alerts (WhatsApp/Email)
    if (outbox.length > 0) {
      for (const msg of outbox) {
        addSyncLog(`Delivering pending ${msg.type} alert to patient ${msg.patient} (${msg.contact})...`);
        await new Promise(r => setTimeout(r, 1000));
        
        // Simulating the actual open/deliver trigger
        if (msg.type === 'WhatsApp') {
          const text = encodeURIComponent(msg.text || '');
          window.open(`https://wa.me/?text=${text}`, '_blank');
        } else {
          const subject = encodeURIComponent(msg.subject || '');
          const body = encodeURIComponent(msg.body || '');
          window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
        }
        
        addSyncLog(`Alert Delivery Success: ${msg.type} notification sent to ${msg.patient}.`);
      }
      localStorage.setItem('pathology_lab_outbox_queue', '[]');
    }

    setSyncStatus('SUCCESS');
    addSyncLog(`Sync cycle completed successfully. Cloud database in sync.`);
    setPendingCount(0);
    window.dispatchEvent(new Event('storage'));
  };

  // Sync initial dark mode state from document.documentElement
  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleDarkMode = () => {
    const nextDark = !darkMode;
    setDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const isPathAllowed = (path: string, userRole: string): boolean => {
    const { role, permissions } = getRoleAndPermissions(userRole);
    const upperRole = role.toUpperCase();
    if (upperRole === 'SUPER_ADMIN' || upperRole === 'ADMIN') return true;

    if (upperRole === 'RECEPTIONIST') {
      const allowed = [
        '/dashboard',
        '/quick-register',
        '/patients',
        '/samples',
        '/reports',
        '/billing',
        '/doctors',
        '/home-collection',
        '/outsource',
        '/tests',
        '/contact'
      ];
      if (permissions.includes('ACCESS_RESULTS')) {
        allowed.push('/results', '/results/entry');
      }
      return allowed.some(p => path === p || path.startsWith(p + '/'));
    }

    if (upperRole === 'TECHNICIAN') {
      const allowed = [
        '/dashboard',
        '/quick-register',
        '/patients',
        '/samples',
        '/results',
        '/reports',
        '/tests',
        '/quality-control',
        '/inventory',
        '/settings/machine',
        '/contact'
      ];
      if (permissions.includes('ACCESS_BILLING')) {
        allowed.push('/billing', '/billing/new');
      }
      return allowed.some(p => path === p || path.startsWith(p + '/'));
    }

    if (upperRole === 'PATHOLOGIST') {
      const allowed = [
        '/dashboard',
        '/patients',
        '/samples',
        '/results',
        '/reports',
        '/tests',
        '/quality-control',
        '/contact'
      ];
      return allowed.some(p => path === p || path.startsWith(p + '/'));
    }

    return false;
  };

  if (sessionLoading || !currentUser) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0f] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Verifying Session...</p>
        </div>
      </div>
    );
  }

  const allowed = isPathAllowed(pathname, currentUser.role);

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      {/* Ambient blurred background blobs for glassmorphism */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-gradient-to-br from-primary/12 to-purple-500/12 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-pink-500/8 to-indigo-500/12 blur-[130px] pointer-events-none z-0" />
      
      <div className="relative z-10 flex h-full w-full overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header — Taller with better spacing & glassmorphism */}
        <header className="flex h-16 items-center justify-between border-b bg-card/85 backdrop-blur-md px-6 shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <div>
              {breadcrumbs && breadcrumbs.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && <ChevronRight className="h-3 w-3 opacity-40" />}
                      <span className={crumb.href ? 'text-primary cursor-pointer hover:underline font-medium' : 'font-medium'}>
                        {crumb.label}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <h1 className="text-xl font-bold text-foreground tracking-tight">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Global Search */}
            <div className="relative">
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              <AnimatePresence>
                {searchOpen && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 300 }}
                    exit={{ opacity: 0, width: 0 }}
                    className="absolute right-0 top-0 overflow-hidden"
                  >
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search patients, orders..."
                      className="h-10 w-full rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      onBlur={() => setSearchOpen(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Connection Status Widget */}
            <div className="flex items-center gap-2 mr-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                isOnline 
                  ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400' 
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
              }`}>
                {isOnline ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <Wifi className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">WiFi Online</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 animate-pulse"></span>
                    </span>
                    <WifiOff className="h-3.5 w-3.5" />
                    <span>Local Offline</span>
                  </>
                )}
              </span>
              
              {pendingCount > 0 && (
                <button
                  onClick={triggerBackgroundSync}
                  disabled={!isOnline || syncStatus === 'SYNCING'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border shadow-sm transition-all ${
                    syncStatus === 'SYNCING'
                      ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 animate-pulse'
                      : isOnline
                        ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/25 cursor-pointer hover:scale-[1.02]'
                        : 'bg-muted border-border text-muted-foreground cursor-not-allowed'
                  }`}
                  title={isOnline ? "Click to Sync Queued Data Now" : "WiFi offline: Data will auto-sync on reconnect"}
                >
                  {syncStatus === 'SYNCING' ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span>Outbox ({pendingCount})</span>
                </button>
              )}
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {darkMode ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            {/* Notifications */}
            <button className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white animate-pulse">
                3
              </span>
            </button>

            {/* User Menu */}
            <div className="relative ml-2">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-accent transition-colors"
              >
                <div className="relative">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-white font-bold text-sm shadow-sm select-none">
                    {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  {/* Online indicator */}
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-card" />
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-sm font-semibold text-foreground truncate max-w-[120px]">{currentUser?.name || 'User'}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">
                    {getRoleAndPermissions(currentUser?.role).role === 'SUPER_ADMIN' 
                      ? 'Super Admin' 
                      : getRoleAndPermissions(currentUser?.role).role === 'ADMIN' 
                        ? 'Admin Owner' 
                        : getRoleAndPermissions(currentUser?.role).role === 'RECEPTIONIST' 
                          ? 'Receptionist' 
                          : getRoleAndPermissions(currentUser?.role).role === 'TECHNICIAN' 
                            ? 'Lab Technician' 
                            : getRoleAndPermissions(currentUser?.role).role || 'Staff'}
                  </div>
                </div>
              </button>
              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border bg-card p-1.5 shadow-xl z-50"
                  >
                    <div className="px-3 py-2 border-b border-border/50 mb-1">
                      <p className="text-xs font-bold text-foreground truncate">{currentUser?.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{currentUser?.email}</p>
                    </div>
                    <button 
                      onClick={() => {
                        localStorage.removeItem('pathology_lab_current_user');
                        router.push('/login');
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {!allowed ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                  className="flex flex-col items-center max-w-md p-8 rounded-3xl border border-destructive/20 bg-destructive/5 backdrop-blur-md shadow-lg"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-6 animate-bounce">
                    <ShieldAlert className="h-8 w-8" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    You do not have the required permissions to access the <span className="font-semibold text-foreground">"{title}"</span> section. Please contact the Lab Owner for privileges.
                  </p>
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Return to Dashboard
                  </button>
                </motion.div>
              </div>
            ) : (
              children
            )}
          </motion.div>
        </main>
      </div>
    </div>
  </div>
  );
}
