import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface ParsedRole {
  role: string;
  permissions: string[];
}

export const PERMISSIONS = {
  ACCESS_BILLING: 'ACCESS_BILLING',
  ACCESS_RESULTS: 'ACCESS_RESULTS',
  EDIT_PATIENTS: 'EDIT_PATIENTS',
  DELETE_PATIENTS: 'DELETE_PATIENTS',
  EDIT_RESULTS_AFTER_APPROVAL: 'EDIT_RESULTS_AFTER_APPROVAL'
};

export function getRoleAndPermissions(roleStr: string | null | undefined): ParsedRole {
  if (!roleStr) return { role: 'RECEPTIONIST', permissions: [] };
  const [role, permsStr] = roleStr.split(':');
  return {
    role: role || 'RECEPTIONIST',
    permissions: permsStr ? permsStr.split(',') : []
  };
}
