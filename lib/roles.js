// Who may open which screen and do which action. The single source of truth for the sidebar, the page
// guard and the backend checks in lib/server-api.js (the backend is what actually enforces it).
//
// Small labs run on one technician, so TECHNICIAN can do everything a lab needs day to day (register,
// collect money, enter and approve results, print reports, settings, machines). Only the owner/admin can
// delete patients, delete bills, manage staff logins, restore a backup or read the audit log: each of those
// would otherwise let one person hide or undo what they did.

const SCREENS = [
  '/dashboard', '/quick-register', '/patients', '/samples', '/results', '/reports', '/billing', '/doctors',
  '/tests', '/quality-control', '/home-collection', '/outsource', '/corporate', '/inventory', '/staff',
  '/analytics', '/expenditure', '/audit-log', '/backup', '/settings', '/settings/machine', '/contact',
];

const ADMIN_ONLY_SCREENS = ['/staff', '/audit-log'];

/** @type {Record<string, { label: string, screens: string[], actions: string[] }>} */
const ROLES = {
  SUPER_ADMIN: { label: 'Lab Owner', screens: SCREENS, actions: ['*'] },
  ADMIN: { label: 'Admin / Manager', screens: SCREENS, actions: ['*'] },
  TECHNICIAN: {
    label: 'Lab Technician',
    screens: SCREENS.filter(s => !ADMIN_ONLY_SCREENS.includes(s)),
    actions: ['register', 'billing', 'discount', 'results', 'report:approve', 'report:edit-approved', 'settings', 'backup:create'],
  },
  PATHOLOGIST: {
    label: 'Pathologist / Doctor',
    screens: ['/dashboard', '/patients', '/samples', '/results', '/reports', '/tests', '/quality-control', '/outsource', '/contact'],
    actions: ['results', 'report:approve', 'report:edit-approved'],
  },
  RECEPTIONIST: {
    label: 'Receptionist',
    screens: ['/dashboard', '/quick-register', '/patients', '/samples', '/reports', '/billing', '/doctors', '/tests', '/home-collection', '/outsource', '/corporate', '/contact'],
    actions: ['register', 'billing'],
  },
  PHLEBOTOMIST: {
    label: 'Phlebotomist',
    screens: ['/dashboard', '/patients', '/samples', '/home-collection', '/contact'],
    actions: ['register'],
  },
};

// Roles created by older versions.
const ALIASES = { DOCTOR: 'PATHOLOGIST' };

// Optional add-ons stored after the role ("RECEPTIONIST:ACCESS_RESULTS"). Nothing here can grant an
// admin-only action, so DELETE_PATIENTS from older versions no longer does anything for non-admins.
const ADDONS = {
  ACCESS_RESULTS: { screens: ['/results', '/quality-control'], actions: ['results'] },
  ACCESS_BILLING: { screens: ['/billing', '/doctors'], actions: ['billing'] },
};

// Roles the owner can give to staff logins (only the first-run owner is SUPER_ADMIN).
const STAFF_ROLES = ['TECHNICIAN', 'PATHOLOGIST', 'RECEPTIONIST', 'PHLEBOTOMIST', 'ADMIN'];

function parseRole(roleString) {
  const [raw = '', addons = ''] = String(roleString || '').split(':');
  const role = ALIASES[raw.toUpperCase()] || raw.toUpperCase();
  return { role, addons: addons.split(',').filter(Boolean), def: ROLES[role] };
}

function isAdmin(roleString) {
  const { role } = parseRole(roleString);
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

function can(roleString, action) {
  const { def, addons } = parseRole(roleString);
  if (!def) return false;
  if (def.actions.includes('*') || def.actions.includes(action)) return true;
  return addons.some(a => ADDONS[a]?.actions.includes(action));
}

function canOpen(roleString, path) {
  const { def, addons } = parseRole(roleString);
  if (!def) return false;
  const screens = [...def.screens, ...addons.flatMap(a => ADDONS[a]?.screens || [])];
  return screens.some(s => path === s || path.startsWith(s + '/'));
}

function roleLabel(roleString) {
  return parseRole(roleString).def?.label || 'Staff';
}

module.exports = { ROLES, STAFF_ROLES, ADDONS, parseRole, isAdmin, can, canOpen, roleLabel };
