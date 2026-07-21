"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn, getRoleAndPermissions } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, FlaskConical, FileText, CreditCard,
  Settings, Package, Stethoscope, TestTubes,
  Home, Building2, BarChart3, Shield, Database, ClipboardList,
  ChevronLeft, ChevronRight, Activity, Truck, DollarSign,
  BadgeCheck, Beaker, HelpCircle, Cpu
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'MAIN',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Quick Entry', href: '/quick-register', icon: Activity },
      { name: 'Patients', href: '/patients', icon: Users },
      { name: 'Samples', href: '/samples', icon: TestTubes },
      { name: 'Results Entry', href: '/results', icon: FlaskConical },
      { name: 'Reports', href: '/reports', icon: FileText },
    ],
  },
  {
    title: 'BILLING',
    items: [
      { name: 'Billing', href: '/billing', icon: CreditCard },
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

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
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

  const isItemAllowed = (itemName: string, userRole: string | null): boolean => {
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
  };

  return (
    <div
      className={cn(
        "flex h-screen flex-col transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[260px]",
        "bg-[hsl(var(--sidebar-bg)/0.75)] backdrop-blur-xl border-r border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-text))]"
      )}
    >
      <div className={cn(
        "flex h-[64px] items-center border-b border-[hsl(var(--sidebar-border))]",
        collapsed ? "justify-center px-0" : "justify-between px-3"
      )}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm border border-[hsl(var(--sidebar-border))] p-1 overflow-hidden">
              <img src="/logo.png" alt="JharLab Logo" className="h-6 w-6 object-contain" />
            </div>
            <div>
              <h1 className="text-[13px] font-extrabold text-[hsl(var(--sidebar-text-active))] tracking-wide animate-pulse">JharLab</h1>
              <p className="text-[10px] text-[hsl(var(--sidebar-text-muted))] font-medium">Laboratory System</p>
            </div>
          </motion.div>
        )}
        {collapsed && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm border border-[hsl(var(--sidebar-border))] p-1 overflow-hidden mx-auto">
            <img src="/logo.png" alt="JharLab Logo" className="h-6 w-6 object-contain" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {navSections.map(section => ({
          ...section,
          items: section.items.filter(item => isItemAllowed(item.name, role))
        })).filter(section => section.items.length > 0).map((section, sectionIdx) => (
          <div key={section.title}>
            {!collapsed && (
              <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--sidebar-text-muted))]">
                {section.title}
              </div>
            )}
            {collapsed && sectionIdx > 0 && (
              <div className="mx-3 mb-2 border-t border-[hsl(var(--sidebar-border))]" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={collapsed ? item.name : undefined}
                    className={cn(
                      "group relative flex items-center rounded-xl transition-all duration-150",
                      collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                      isActive
                        ? "text-[hsl(var(--sidebar-text-active))]"
                        : "text-[hsl(var(--sidebar-text))] hover:text-[hsl(var(--sidebar-text-active))] hover:bg-[hsl(var(--sidebar-hover))]"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/25"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                      />
                    )}
                    {/* Active left accent bar */}
                    {isActive && !collapsed && (
                      <motion.div
                        layoutId="sidebar-accent"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
                        transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
                      />
                    )}
                    <item.icon className={cn(
                      "h-[18px] w-[18px] flex-shrink-0 relative z-10 transition-colors",
                      isActive ? "text-primary" : "text-[hsl(var(--sidebar-text))]/70 group-hover:text-[hsl(var(--sidebar-text-active))]"
                    )} />
                    {!collapsed && (
                      <span className={cn(
                        "relative z-10 truncate text-[13px] font-semibold",
                        isActive ? "text-[hsl(var(--sidebar-text-active))]" : ""
                      )}>
                        {item.name}
                      </span>
                    )}
                    {!collapsed && item.badge && item.badge > 0 && (
                      <span className="relative z-10 ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white animate-pulse">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-[hsl(var(--sidebar-border))] p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-xs text-[hsl(var(--sidebar-text-muted))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-text-active))] transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="font-semibold">Collapse</span>
            </>
          )}
        </button>
        {!collapsed && (
          <div className="mt-1 text-center text-[10px] text-[hsl(var(--sidebar-text-muted))]/60 font-medium">v3.0.0</div>
        )}
      </div>
    </div>
  );
}
