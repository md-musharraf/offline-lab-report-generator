// lib/default-tests.ts
// Standard pathology tests preloaded catalog (200+ tests)

export interface DefaultTestParameter {
  name: string;
  shortName?: string | null; // analyzer code, e.g. HGB
  unit?: string | null;
  sortOrder: number;
  type?: 'NUMERIC' | 'TEXT' | 'DROPDOWN' | 'CALCULATED';
  options?: string | null;
  isHeader?: boolean;
  refRanges?: {
    gender?: 'MALE' | 'FEMALE' | null;
    normalMin?: number | null;
    normalMax?: number | null;
    criticalMin?: number | null;
    criticalMax?: number | null;
    textNormal?: string | null;
  }[];
}

export interface DefaultTest {
  code: string;
  name: string;
  shortName?: string | null;
  category: 'Hematology' | 'Biochemistry' | 'Serology' | 'Microbiology' | 'Clinical Pathology' | 'Immunology';
  price: number;
  duration: number;
  sampleType: string;
  container?: string | null;
  parameters: DefaultTestParameter[];
}

import data from './default-tests.json';

export const defaultTests = data as DefaultTest[];
