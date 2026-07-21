"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion } from 'framer-motion';
import { Plus, Search, Users, Calendar, CheckCircle, XCircle, Clock, Edit, Trash2, XIcon, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { getRoleAndPermissions } from '@/lib/utils';

interface Staff {
  id: number;
  name: string;
  role: string;
  mobile: string;
  salary: number;
  joinedAt: string;
  status: 'PRESENT' | 'ABSENT';
  isActive: boolean;
  email?: string;
  hasLogin?: boolean;
  userId?: number | null;
  userRole?: string;
}

const permissionLabels: Record<string, string> = {
  ACCESS_BILLING: 'Billing Access (for Technicians)',
  ACCESS_RESULTS: 'Results Entry Access (for Receptionists)',
  EDIT_PATIENTS: 'Edit Patients Details',
  DELETE_PATIENTS: 'Delete Patients Records',
  EDIT_RESULTS_AFTER_APPROVAL: 'Edit Approved/Delivered Lab Results'
};

const initialStaff: Staff[] = [];

const roleColors: Record<string, string> = {
  DOCTOR: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  TECHNICIAN: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  RECEPTIONIST: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
  PHLEBOTOMIST: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
};

const roles = ['DOCTOR', 'TECHNICIAN', 'RECEPTIONIST', 'PHLEBOTOMIST'];

const emptyForm = { 
  name: '', 
  role: 'DOCTOR', 
  mobile: '', 
  salary: 0, 
  joinedAt: '', 
  email: '', 
  password: '', 
  enableLogin: false 
};

export default function StaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>(initialStaff);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'list' | 'attendance'>('list');

  const [listSortField, setListSortField] = useState<keyof Staff>('name');
  const [listSortDirection, setListSortDirection] = useState<'asc' | 'desc'>('asc');

  const [attSortField, setAttSortField] = useState<keyof Staff | null>(null);
  const [attSortDirection, setAttSortDirection] = useState<'asc' | 'desc'>('asc');

  const requestAttSort = (field: keyof Staff) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (attSortField === field && attSortDirection === 'asc') {
      direction = 'desc';
    }
    setAttSortField(field);
    setAttSortDirection(direction);
  };

  const AttSortHeader = ({ field, label }: { field: keyof Staff; label: string }) => {
    const isActive = attSortField === field;
    return (
      <button
        onClick={() => requestAttSort(field)}
        className="flex items-center gap-1 hover:text-foreground font-semibold transition-colors focus:outline-none"
      >
        <span>{label}</span>
        {isActive ? (
          attSortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-80" />
        )}
      </button>
    );
  };
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Staff | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handlePermissionToggle = (perm: string) => {
    setSelectedPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const filteredStaff = useMemo(() => {
    return staffList.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.role.toLowerCase().includes(search.toLowerCase()) ||
      s.mobile.includes(search)
    );
  }, [staffList, search]);

  const sortedStaff = useMemo(() => {
    let result = [...filteredStaff];
    result.sort((a, b) => {
      let valA = a[listSortField];
      let valB = b[listSortField];

      // Date comparison
      if (listSortField === 'joinedAt') {
        const parseDate = (dStr: string) => {
          if (!dStr) return 0;
          const parts = dStr.split('/');
          if (parts.length === 3) {
            return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
          }
          return 0;
        };
        return listSortDirection === 'asc'
          ? parseDate(String(valA)) - parseDate(String(valB))
          : parseDate(String(valB)) - parseDate(String(valA));
      }

      // String comparison
      if (typeof valA === 'string' && typeof valB === 'string') {
        return listSortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      // Numeric comparison
      if (typeof valA === 'number' && typeof valB === 'number') {
        return listSortDirection === 'asc' ? valA - valB : valB - valA;
      }

      return 0;
    });
    return result;
  }, [filteredStaff, listSortField, listSortDirection]);

  const sortedAttendance = useMemo(() => {
    let result = [...staffList];
    if (attSortField) {
      result.sort((a, b) => {
        let valA = a[attSortField];
        let valB = b[attSortField];

        // String comparison
        if (typeof valA === 'string' && typeof valB === 'string') {
          return attSortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        // Numeric comparison
        if (typeof valA === 'number' && typeof valB === 'number') {
          return attSortDirection === 'asc' ? valA - valB : valB - valA;
        }

        return 0;
      });
    }
    return result;
  }, [staffList, attSortField, attSortDirection]);

  const fetchStaff = async () => {
    try {
      const staff = await db.query('staff', 'findMany', {
        where: { isActive: true },
        orderBy: { name: 'asc' }
      });
      const users = await db.query('user', 'findMany', {
        where: { deletedAt: null }
      });
      const merged = (staff || []).map((s: any) => {
        const correspondingUser = (users || []).find((u: any) => u.email && u.name.toLowerCase() === s.name.toLowerCase());
        return {
          id: s.id,
          name: s.name,
          role: s.role,
          mobile: s.mobile || '',
          salary: s.salary || 0,
          joinedAt: s.joinedAt ? new Date(s.joinedAt).toLocaleDateString('en-GB') : '',
          status: 'PRESENT' as const,
          isActive: s.isActive,
          email: correspondingUser?.email || '',
          hasLogin: !!correspondingUser,
          userId: correspondingUser?.id || null,
          userRole: correspondingUser?.role || ''
        };
      });
      setStaffList(merged);
    } catch (error) {
      console.error('Failed to fetch staff:', error);
      setToast({ message: 'Error loading staff from database', type: 'error' });
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const openAddModal = () => {
    setForm(emptyForm);
    setSelectedPermissions([]);
    setEditingStaff(null);
    setShowModal(true);
  };

  const openEditModal = (staff: Staff) => {
    const { permissions } = getRoleAndPermissions(staff.userRole);
    setForm({
      name: staff.name,
      role: staff.role,
      mobile: staff.mobile,
      salary: staff.salary,
      joinedAt: staff.joinedAt,
      email: staff.email || '',
      password: '',
      enableLogin: staff.hasLogin || false
    });
    setSelectedPermissions(permissions);
    setEditingStaff(staff);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.mobile.trim()) {
      setToast({ message: 'Name and Mobile are required', type: 'error' });
      return;
    }

    try {
      if (form.enableLogin && !form.email.trim()) {
        setToast({ message: 'Login email is required when login is enabled', type: 'error' });
        return;
      }

      let parsedJoinedAt = new Date().toISOString();
      if (form.joinedAt) {
        const parts = form.joinedAt.split('/');
        if (parts.length === 3) {
          parsedJoinedAt = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).toISOString();
        }
      }

      if (editingStaff) {
        await db.query('staff', 'update', {
          where: { id: editingStaff.id },
          data: {
            name: form.name,
            role: form.role,
            mobile: form.mobile,
            salary: Number(form.salary),
            joinedAt: parsedJoinedAt
          }
        });

        const userId = editingStaff.userId;
        const userRoleComposite = `${form.role}:${selectedPermissions.join(',')}`;
        
        if (form.enableLogin) {
          if (userId) {
            const updateData: any = {
              name: form.name,
              email: form.email.toLowerCase().trim(),
              role: userRoleComposite as any
            };
            if (form.password) {
              updateData.password = await bcrypt.hash(form.password, 12);
            }
            await db.query('user', 'update', {
              where: { id: userId },
              data: updateData
            });
          } else {
            if (!form.password) {
              setToast({ message: 'Password is required to create a login account', type: 'error' });
              return;
            }
            const hashedPassword = await bcrypt.hash(form.password, 12);
            await db.query('user', 'create', {
              data: {
                name: form.name,
                email: form.email.toLowerCase().trim(),
                password: hashedPassword,
                role: userRoleComposite as any,
                isActive: true
              }
            });
          }
        } else if (userId) {
          await db.query('user', 'update', {
            where: { id: userId },
            data: { deletedAt: new Date() }
          });
        }

        setToast({ message: `Staff "${form.name}" updated successfully`, type: 'success' });
      } else {
        await db.query('staff', 'create', {
          data: {
            name: form.name,
            role: form.role,
            mobile: form.mobile,
            salary: Number(form.salary),
            joinedAt: parsedJoinedAt,
            isActive: true
          }
        });

        if (form.enableLogin) {
          if (!form.password) {
            setToast({ message: 'Password is required to create a login account', type: 'error' });
            return;
          }
          const hashedPassword = await bcrypt.hash(form.password, 12);
          const userRoleComposite = `${form.role}:${selectedPermissions.join(',')}`;
          await db.query('user', 'create', {
            data: {
              name: form.name,
              email: form.email.toLowerCase().trim(),
              password: hashedPassword,
              role: userRoleComposite as any,
              isActive: true
            }
          });
        }

        setToast({ message: `Staff "${form.name}" added successfully`, type: 'success' });
      }

      setShowModal(false);
      setEditingStaff(null);
      fetchStaff();
    } catch (e: any) {
      console.error(e);
      setToast({ message: e.message || 'Operation failed', type: 'error' });
    }
  };

  const handleDelete = async (staff: Staff) => {
    try {
      await db.query('staff', 'update', {
        where: { id: staff.id },
        data: { isActive: false }
      });

      if (staff.userId) {
        await db.query('user', 'update', {
          where: { id: staff.userId },
          data: { deletedAt: new Date() }
        });
      }

      setToast({ message: `Staff "${staff.name}" removed`, type: 'success' });
      setShowDeleteConfirm(null);
      fetchStaff();
    } catch (e) {
      console.error(e);
      setToast({ message: 'Failed to delete staff member', type: 'error' });
    }
  };

  const toggleAttendance = (id: number) => {
    setStaffList(prev => prev.map(s => s.id === id ? { ...s, status: s.status === 'PRESENT' ? 'ABSENT' : 'PRESENT' } : s));
  };

  const inputClass = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const selectClass = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const labelClass = "form-label";

  return (
    <AppLayout title="Staff Management" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Staff' }]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-1">
          <div className="flex gap-2">
            <button 
              onClick={() => setTab('list')} 
              className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all duration-200 flex items-center gap-2 -mb-[5px] ${tab === 'list' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Users className="h-4 w-4" />
              Staff List
            </button>
            <button 
              onClick={() => setTab('attendance')} 
              className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all duration-200 flex items-center gap-2 -mb-[5px] ${tab === 'attendance' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Calendar className="h-4 w-4" />
              Attendance
            </button>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }} 
            onClick={openAddModal} 
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow shadow-sm hover:shadow-lg transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Staff
          </motion.button>
        </div>

        {tab === 'list' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search staff..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" 
                />
              </div>
              <div className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 bg-background shadow-sm h-11 text-xs self-start sm:self-auto">
                <span className="text-muted-foreground whitespace-nowrap">Sort By:</span>
                <select
                  value={`${listSortField}-${listSortDirection}`}
                  onChange={(e) => {
                    const [field, direction] = e.target.value.split('-');
                    setListSortField(field as keyof Staff);
                    setListSortDirection(direction as 'asc' | 'desc');
                  }}
                  className="font-semibold bg-transparent focus:outline-none border-none text-foreground cursor-pointer"
                >
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="role-asc">Role (A-Z)</option>
                  <option value="role-desc">Role (Z-A)</option>
                  <option value="salary-desc">Salary (High-Low)</option>
                  <option value="salary-asc">Salary (Low-High)</option>
                  <option value="joinedAt-desc">Joined Date (Newest)</option>
                  <option value="joinedAt-asc">Joined Date (Oldest)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedStaff.map((s, i) => (
                <motion.div 
                  key={s.id} 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: i * 0.05 }}
                  className="card-premium p-6 hover:shadow-md transition-shadow animate-fade-in-up"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-base">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                      <span className={`badge text-[11px] font-semibold mt-1 inline-block ${roleColors[s.role]}`}>
                        {s.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 self-start">
                      <button 
                        onClick={() => openEditModal(s)} 
                        className="btn-action rounded-lg" 
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => setShowDeleteConfirm(s)} 
                        className="btn-action rounded-lg hover:text-red-600 hover:border-red-200 dark:hover:border-red-950" 
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                      </button>
                      <div className="ml-1" title={s.status === 'PRESENT' ? 'Present' : 'Absent'}>
                        {s.status === 'PRESENT' ? (
                          <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/75">Mobile</span>
                      <span className="font-semibold text-foreground">{s.mobile}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/75">Salary</span>
                      <span className="font-semibold text-foreground">₹{s.salary?.toLocaleString('en-IN')}/mo</span>
                    </div>
                    <div className="flex flex-col gap-0.5 col-span-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/75">Joined Date</span>
                      <span className="font-semibold text-foreground">{s.joinedAt}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
              {sortedStaff.length === 0 && (
                <div className="col-span-full text-center py-12 text-sm text-muted-foreground border border-dashed rounded-xl bg-muted/20">
                  No staff members found
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'attendance' && (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden animate-fade-in-up">
            <div className="p-5 border-b bg-muted/30">
              <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Calendar className="h-5 w-5 text-primary" />
                Today&apos;s Attendance — {new Date().toLocaleDateString('en-GB')}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider table-row-standard">
                    <th className="font-semibold select-none">
                      <AttSortHeader field="name" label="Name" />
                    </th>
                    <th className="font-semibold select-none">
                      <AttSortHeader field="role" label="Role" />
                    </th>
                    <th className="font-semibold select-none">
                      <AttSortHeader field="status" label="Status" />
                    </th>
                    <th className="font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sortedAttendance.map(s => (
                    <tr key={s.id} className="hover:bg-accent/30 transition-colors table-row-standard">
                      <td className="font-semibold text-foreground">{s.name}</td>
                      <td>
                        <span className={`badge text-[11px] font-semibold ${roleColors[s.role]}`}>
                          {s.role}
                        </span>
                      </td>
                      <td>
                        {s.status === 'PRESENT' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-400">
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
                            Present
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400">
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-500" />
                            Absent
                          </span>
                        )}
                      </td>
                      <td>
                        <button 
                          onClick={() => toggleAttendance(s.id)}
                          className={`py-2 px-3.5 text-xs font-semibold rounded-lg shadow-sm hover:shadow transition-all ${
                            s.status === 'PRESENT' 
                              ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-400' 
                              : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/50 dark:text-green-400'
                          }`}
                        >
                          Mark {s.status === 'PRESENT' ? 'Absent' : 'Present'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sortedAttendance.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-sm text-muted-foreground">
                        No staff members registered
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in-up" onClick={() => setShowModal(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-foreground">{editingStaff ? 'Edit Staff Details' : 'Add New Staff Member'}</h2>
              <button 
                onClick={() => setShowModal(false)} 
                className="btn-action rounded-lg text-muted-foreground hover:bg-accent"
                aria-label="Close modal"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Name *</label>
                <input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <label className={labelClass}>Role</label>
                <select className={selectClass} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Mobile *</label>
                  <input className={inputClass} value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="10-digit mobile" />
                </div>
                <div>
                  <label className={labelClass}>Salary (₹/mo)</label>
                  <input type="number" className={inputClass} value={form.salary} onChange={e => setForm({ ...form, salary: Number(e.target.value) })} min={0} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Joined Date</label>
                <input className={inputClass} value={form.joinedAt} onChange={e => setForm({ ...form, joinedAt: e.target.value })} placeholder="DD/MM/YYYY" />
              </div>
              <div className="border-t border-border/50 pt-4 mt-2">
                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.enableLogin}
                    onChange={(e) => setForm({ ...form, enableLogin: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>Enable User Login Account</span>
                </label>
                            {form.enableLogin && (
                  <div className="space-y-4 mt-4 animate-fade-in">
                    <div>
                      <label className={labelClass}>Login Email *</label>
                      <input 
                        type="email" 
                        className={inputClass} 
                        value={form.email} 
                        onChange={e => setForm({ ...form, email: e.target.value })} 
                        placeholder="email@lab.com" 
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        {editingStaff ? 'Login Password (Leave blank to keep unchanged)' : 'Login Password *'}
                      </label>
                      <input 
                        type="password" 
                        className={inputClass} 
                        value={form.password} 
                        onChange={e => setForm({ ...form, password: e.target.value })} 
                        placeholder="••••••••" 
                      />
                    </div>
                    
                    {/* Special Permissions list */}
                    <div className="pt-2 border-t border-border/40">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2.5">
                        Special Permissions
                      </label>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {Object.entries(permissionLabels).map(([permKey, permLabel]) => (
                          <label key={permKey} className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer select-none hover:text-primary transition-colors">
                            <input
                              type="checkbox"
                              checked={selectedPermissions.includes(permKey)}
                              onChange={() => handlePermissionToggle(permKey)}
                              className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 mt-0.5"
                            />
                            <span>{permLabel}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button 
                onClick={() => setShowModal(false)} 
                className="py-2.5 px-5 text-sm font-bold rounded-xl border border-border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmit} 
                className="py-2.5 px-5 text-sm font-bold rounded-xl bg-primary text-primary-foreground btn-primary-glow"
              >
                {editingStaff ? 'Update' : 'Add Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in-up" onClick={() => setShowDeleteConfirm(null)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Remove Staff Member</h2>
              <button 
                onClick={() => setShowDeleteConfirm(null)} 
                className="btn-action rounded-lg text-muted-foreground hover:bg-accent"
                aria-label="Close modal"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to remove <span className="font-bold text-foreground">{showDeleteConfirm.name}</span>? This action is permanent and cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button 
                onClick={() => setShowDeleteConfirm(null)} 
                className="py-2.5 px-5 text-sm font-bold rounded-xl border border-border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDelete(showDeleteConfirm)} 
                className="py-2.5 px-5 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast-global ${toast.type === 'success' ? 'toast-success' : 'toast-error'} z-[200]`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}
