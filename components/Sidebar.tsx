"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn, getRoleAndPermissions } from '@/lib/utils';
import {
  LayoutDashboard, Users, FlaskConical, FileText, CreditCard,
  Settings, Package, Stethoscope, TestTubes,
  Home, Building2, BarChart3, Shield, Database, ClipboardList,
  ChevronLeft, ChevronRight, Activity, Truck, DollarSign,
  BadgeCheck, Beaker, HelpCircle, Cpu
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  shortcut?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: 'MAIN',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Quick Entry', href: '/quick-register', icon: Activity, shortcut: 'F2' },
      { name: 'Patients', href: '/patients', icon: Users, shortcut: 'F6' },
      { name: 'Samples', href: '/samples', icon: TestTubes },
      { name: 'Results Entry', href: '/results', icon: FlaskConical, shortcut: 'F3' },
      { name: 'Reports', href: '/reports', icon: FileText, shortcut: 'F4' },
    ],
  },
  {
    title: 'BILLING',
    items: [
      { name: 'Billing', href: '/billing', icon: CreditCard, shortcut: 'F7' },
      { name: 'Doctors', href: '/doctors', icon: Stethoscope },
    ],
  },
  {
    title: 'LABORATORY',
    items: [
      { name: 'Tests Catalog', href: '/tests', icon: Beaker },
      { name: 'Quality Control', href: '/quality-control', icon: BadgeCheck },
      { name: 'Home Collection', href: '/home-collection', icon: Truck },
      { name: 'Outsource Labs', href: '/outsource', icon: Building2 },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { name: 'Corporate', href: '/corporate', icon: Building2 },
      { name: 'Inventory', href: '/inventory', icon: Package },
      { name: 'Staff', href: '/staff', icon: Users },
      { name: 'Analytics', href: '/analytics', icon: BarChart3 },
      { name: 'Expenditure', href: '/expenditure', icon: DollarSign },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { name: 'Audit Log', href: '/audit-log', icon: ClipboardList },
      { name: 'Backup', href: '/backup', icon: Database },
      { name: 'Settings', href: '/settings', icon: Settings },
      { name: 'Machine Interfacing', href: '/settings/machine', icon: Cpu },
      { name: 'Contact Developer', href: '/contact', icon: HelpCircle },
    ],
  },
];

export function isItemAllowed(itemName: string, userRole: string | null): boolean {
  if (!userRole) return false;
  const { role, permissions } = getRoleAndPermissions(userRole);
  const r = role.toUpperCase();
  if (r === 'SUPER_ADMIN' || r === 'ADMIN') return true;

  if (r === 'RECEPTIONIST') {
    const allowed = [
      'Dashboard',
      'Quick Entry',
      'Patients',
      'Samples',
      'Reports',
      'Billing',
      'Doctors',
      'Home Collection',
      'Outsource Labs',
      'Tests Catalog',
      'Contact Developer'
    ];
    if (permissions.includes('ACCESS_RESULTS')) {
      allowed.push('Results Entry');
    }
    return allowed.includes(itemName);
  }

  if (r === 'TECHNICIAN') {
    const allowed = [
      'Dashboard',
      'Quick Entry',
      'Patients',
      'Samples',
      'Results Entry',
      'Reports',
      'Tests Catalog',
      'Quality Control',
      'Inventory',
      'Machine Interfacing',
      'Contact Developer'
    ];
    if (permissions.includes('ACCESS_BILLING')) {
      allowed.push('Billing', 'Doctors');
    }
    return allowed.includes(itemName);
  }

  if (r === 'PATHOLOGIST') {
    const allowed = [
      'Dashboard',
      'Patients',
      'Samples',
      'Results Entry',
      'Reports',
      'Tests Catalog',
      'Quality Control',
      'Contact Developer'
    ];
    return allowed.includes(itemName);
  }

  return false;
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem('jharlab_sidebar_collapsed') === '1'); } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(c => {
      try { localStorage.setItem('jharlab_sidebar_collapsed', c ? '0' : '1'); } catch {}
      return !c;
    });
  };
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const checkUserRole = () => {
      const userStr = localStorage.getItem('pathology_lab_current_user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          setRole(user.role);
        } catch (e) {
          setRole(null);
        }
      } else {
        setRole(null);
      }
    };

    checkUserRole();
    window.addEventListener('storage', checkUserRole);
    return () => {
      window.removeEventListener('storage', checkUserRole);
    };
  }, []);


  return (
    <aside
      className={cn(
        "flex h-screen flex-col shrink-0 transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px]" : "w-[240px]",
        "bg-[hsl(var(--sidebar-bg))] border-r border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-text))]"
      )}
      aria-label="Main navigation"
    >
      <div className={cn("flex h-14 items-center gap-2.5 border-b border-[hsl(var(--sidebar-border))] shrink-0", collapsed ? "justify-center" : "px-4")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15">
          <img src="/logo.png" alt="" className="h-5 w-5 object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="text-[14px] font-bold tracking-tight text-foreground">JharLab</div>
            <div className="text-[11px] text-[hsl(var(--sidebar-text-muted))]">Laboratory System</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {navSections.map(section => ({
          ...section,
          items: section.items.filter(item => isItemAllowed(item.name, role))
        })).filter(section => section.items.length > 0).map((section, sectionIdx) => (
          <div key={section.title}>
            {collapsed ? (
              sectionIdx > 0 && <div className="mx-3 mb-2 border-t border-[hsl(var(--sidebar-border))]" />
            ) : (
              <div className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-text-muted))]">
                {section.title}
              </div>
            )}
            <div className="space-y-px">
              {section.items.map((item) => {
                const isActive = pathname === item.href || (pathname.startsWith(item.href + '/') && !section.items.some(o => o.href !== item.href && pathname.startsWith(o.href)));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={collapsed ? `${item.name}${item.shortcut ? ` (${item.shortcut})` : ''}` : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      "group relative flex items-center rounded-lg text-[13px] font-medium transition-colors duration-150",
                      collapsed ? "justify-center h-10" : "gap-3 px-3 h-9",
                      isActive
                        ? "bg-primary/10 text-[hsl(var(--sidebar-text-active))] font-semibold"
                        : "hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground"
                    )}
                  >
                    {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />}
                    <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-primary" : "opacity-75 group-hover:opacity-100")} />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                    {!collapsed && item.shortcut && <kbd className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">{item.shortcut}</kbd>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[hsl(var(--sidebar-border))] p-2 shrink-0">
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex w-full h-9 items-center justify-center gap-2 rounded-lg text-xs font-medium text-[hsl(var(--sidebar-text-muted))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : (<><ChevronLeft className="h-4 w-4" /><span>Collapse</span><span className="ml-auto pr-1 font-mono text-[10px] opacity-70">v{process.env.NEXT_PUBLIC_APP_VERSION}</span></>)}
        </button>
      </div>
    </aside>
  );
}
