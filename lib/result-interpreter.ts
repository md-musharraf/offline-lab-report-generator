// lib/result-interpreter.ts
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type ResultStatus = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' | 'PENDING';

export interface ReferenceRange {
  id?: number;
  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  normalMin?: number | null;
  normalMax?: number | null;
  criticalMin?: number | null;
  criticalMax?: number | null;
  textNormal?: string | null;
  unit?: string | null;
}

export function interpretResult(
  value: number | string | null,
  range: ReferenceRange | null,
  patientAgeInDays: number,
  patientGender: Gender
): {
  status: ResultStatus;
  flag: '↑' | '↓' | '!!' | null;
  isCritical: boolean;
  isAbnormal: boolean;
  colorClass: string;
  bgColorClass: string;
  label: string;
} {
  const defaultReturn = {
    status: 'PENDING' as ResultStatus,
    flag: null as any,
    isCritical: false,
    isAbnormal: false,
    colorClass: 'text-gray-500',
    bgColorClass: 'bg-gray-100',
    label: 'PENDING',
  };

  if (value === null || value === undefined || value === '') return defaultReturn;
  if (!range) return { ...defaultReturn, status: 'NORMAL', label: 'NORMAL ✓', colorClass: 'text-green-700', bgColorClass: 'bg-green-100' };

  if (typeof value === 'string' && isNaN(Number(value))) {
    // Text based
    if (range.textNormal) {
      const normalValues = range.textNormal.split(',').map(v => v.trim().toLowerCase());
      const isNormal = normalValues.includes(value.toLowerCase());
      if (isNormal) {
        return {
          status: 'NORMAL',
          flag: null,
          isCritical: false,
          isAbnormal: false,
          colorClass: 'text-green-700',
          bgColorClass: 'bg-green-100',
          label: 'NORMAL ✓'
        };
      } else {
        return {
          status: 'HIGH',
          flag: '↑',
          isCritical: false,
          isAbnormal: true,
          colorClass: 'text-orange-700',
          bgColorClass: 'bg-orange-100',
          label: 'ABNORMAL ⚠'
        };
      }
    }
    return defaultReturn;
  }

  const numValue = Number(value);

  if (range.criticalMin !== null && range.criticalMin !== undefined && numValue < range.criticalMin) {
    return {
      status: 'CRITICAL',
      flag: '!!',
      isCritical: true,
      isAbnormal: true,
      colorClass: 'text-red-800 border-red-500 animate-pulse',
      bgColorClass: 'bg-red-100',
      label: 'CRITICAL ⚠',
    };
  }

  if (range.normalMin !== null && range.normalMin !== undefined && numValue < range.normalMin) {
    return {
      status: 'LOW',
      flag: '↓',
      isCritical: false,
      isAbnormal: true,
      colorClass: 'text-blue-700',
      bgColorClass: 'bg-blue-100',
      label: 'LOW ↓',
    };
  }

  if (range.criticalMax !== null && range.criticalMax !== undefined && numValue > range.criticalMax) {
    return {
      status: 'CRITICAL',
      flag: '!!',
      isCritical: true,
      isAbnormal: true,
      colorClass: 'text-red-800 border-red-500 animate-pulse',
      bgColorClass: 'bg-red-100',
      label: 'CRITICAL ⚠',
    };
  }

  if (range.normalMax !== null && range.normalMax !== undefined && numValue > range.normalMax) {
    return {
      status: 'HIGH',
      flag: '↑',
      isCritical: false,
      isAbnormal: true,
      colorClass: 'text-orange-700',
      bgColorClass: 'bg-orange-100',
      label: 'HIGH ↑',
    };
  }

  return {
    status: 'NORMAL',
    flag: null,
    isCritical: false,
    isAbnormal: false,
    colorClass: 'text-green-700',
    bgColorClass: 'bg-green-100',
    label: 'NORMAL ✓',
  };
}
