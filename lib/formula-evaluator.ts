// lib/formula-evaluator.ts

export interface ParameterDef {
  id: number;
  name: string;
  type: string;
  formula?: string | null;
  unit?: string | null;
}

/**
 * Standard CKD-EPI 2021 GFR Formula
 */
export function calculateCKDEPI(
  creatinine: number,
  ageInYears: number,
  gender: string
): number {
  if (creatinine <= 0 || ageInYears <= 0) return 0;
  
  const isFemale = gender.toUpperCase() === 'FEMALE';
  const k = isFemale ? 0.7 : 0.9;
  const a = isFemale ? -0.241 : -0.302;
  const genderFactor = isFemale ? 1.012 : 1.0;
  
  const minTerm = Math.min(creatinine / k, 1);
  const maxTerm = Math.max(creatinine / k, 1);
  
  const gfr = 142 * Math.pow(minTerm, a) * Math.pow(maxTerm, -1.200) * Math.pow(0.9938, ageInYears) * genderFactor;
  return Math.round(gfr);
}

/**
 * Safe numeric parser that returns a number or null if invalid
 */
function parseVal(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

/**
 * Safely evaluates a custom arithmetic expression containing [Parameter Name] place holders
 */
export function evaluateCustomFormula(
  formula: string,
  valuesByName: Record<string, number>
): number | null {
  try {
    let parsedFormula = formula;
    const matches = formula.match(/\[([^\]]+)\]/g);
    if (!matches) return null;
    
    for (const match of matches) {
      const name = match.substring(1, match.length - 1);
      const val = valuesByName[name];
      if (val === undefined || val === null || isNaN(val)) {
        return null; // A dependent value is missing or not numeric
      }
      parsedFormula = parsedFormula.replace(match, String(val));
    }
    
    // Safety check: Only allow mathematical operators, numbers, decimals, parenthesis, and whitespace
    if (!/^[0-9+\-*/().\s]+$/.test(parsedFormula)) {
      console.warn("Safety check failed: Invalid characters in formula expression:", parsedFormula);
      return null;
    }
    
    // Evaluate the arithmetic expression safely
    const result = new Function(`return (${parsedFormula})`)();
    return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : null;
  } catch (e) {
    console.error("Error evaluating custom formula:", formula, e);
    return null;
  }
}

/**
 * Performs formula calculations for all parameters within a test.
 * Returns a map of parameterId -> calculated string value.
 */
export function evaluateTestFormulas(
  testCode: string,
  parameters: ParameterDef[],
  currentValues: Record<number, string>, // parameterId -> entered string value
  patientAge: number, // age value
  patientAgeUnit: 'YEARS' | 'MONTHS' | 'DAYS' | string,
  patientGender: string
): Record<number, { value: string; calculated: boolean }> {
  const calculatedResults: Record<number, { value: string; calculated: boolean }> = {};
  
  // 1. Build helper maps
  const idToName: Record<number, string> = {};
  const nameToId: Record<string, number> = {};
  const valuesByName: Record<string, number> = {};
  
  parameters.forEach(p => {
    idToName[p.id] = p.name;
    nameToId[p.name] = p.id;
    
    const parsed = parseVal(currentValues[p.id]);
    if (parsed !== null) {
      valuesByName[p.name] = parsed;
    }
  });

  // Convert patient age to years
  let ageInYears = patientAge;
  if (patientAgeUnit === 'MONTHS') ageInYears = patientAge / 12;
  else if (patientAgeUnit === 'DAYS') ageInYears = patientAge / 365.25;

  // 2. Perform built-in standard panel calculations
  if (testCode === 'BIO001') { // Liver Function Test (LFT)
    // Indirect Bilirubin = Total Bilirubin - Direct Bilirubin
    const totalBiliId = nameToId['Total Bilirubin'];
    const directBiliId = nameToId['Direct Bilirubin'];
    const indirectBiliId = nameToId['Indirect Bilirubin'];
    
    if (totalBiliId && directBiliId && indirectBiliId) {
      const totalBili = valuesByName['Total Bilirubin'];
      const directBili = valuesByName['Direct Bilirubin'];
      if (totalBili !== undefined && directBili !== undefined) {
        const indirectVal = Math.max(0, totalBili - directBili);
        calculatedResults[indirectBiliId] = { value: indirectVal.toFixed(2), calculated: true };
        valuesByName['Indirect Bilirubin'] = indirectVal;
      }
    }

    // Globulin = Total Protein - Albumin
    const totalProteinId = nameToId['Total Protein'];
    const albuminId = nameToId['Albumin'];
    const globulinId = nameToId['Globulin'];
    
    if (totalProteinId && albuminId && globulinId) {
      const totalProtein = valuesByName['Total Protein'];
      const albumin = valuesByName['Albumin'];
      if (totalProtein !== undefined && albumin !== undefined) {
        const globulinVal = Math.max(0, totalProtein - albumin);
        calculatedResults[globulinId] = { value: globulinVal.toFixed(1), calculated: true };
        valuesByName['Globulin'] = globulinVal;
      }
    }

    // Albumin/Globulin Ratio = Albumin / Globulin
    const agRatioId = nameToId['Albumin/Globulin Ratio (A:G Ratio)'];
    if (albuminId && globulinId && agRatioId) {
      const albumin = valuesByName['Albumin'];
      const globulin = valuesByName['Globulin'];
      if (albumin !== undefined && globulin > 0) {
        const ratioVal = albumin / globulin;
        calculatedResults[agRatioId] = { value: ratioVal.toFixed(2), calculated: true };
        valuesByName['Albumin/Globulin Ratio (A:G Ratio)'] = ratioVal;
      }
    }
  } 
  else if (testCode === 'BIO002') { // Renal Function Test (RFT/KFT)
    const bunId = nameToId['Blood Urea Nitrogen (BUN)'];
    const bloodUreaId = nameToId['Blood Urea'];
    const creatinineId = nameToId['Serum Creatinine'];
    const bunCrRatioId = nameToId['BUN / Creatinine Ratio'];
    const ureaCrRatioId = nameToId['Urea / Creatinine Ratio'];
    const egfrId = nameToId['eGFR (Estimated GFR)'];

    // 1. Blood Urea = BUN * 2.14
    if (bunId && bloodUreaId) {
      const bun = valuesByName['Blood Urea Nitrogen (BUN)'];
      if (bun !== undefined) {
        const ureaVal = bun * 2.14;
        calculatedResults[bloodUreaId] = { value: ureaVal.toFixed(1), calculated: true };
        valuesByName['Blood Urea'] = ureaVal;
      }
    }

    // 2. BUN / Creatinine Ratio = BUN / Serum Creatinine
    if (bunId && creatinineId && bunCrRatioId) {
      const bun = valuesByName['Blood Urea Nitrogen (BUN)'];
      const creatinine = valuesByName['Serum Creatinine'];
      if (bun !== undefined && creatinine > 0) {
        const ratio = bun / creatinine;
        calculatedResults[bunCrRatioId] = { value: ratio.toFixed(2), calculated: true };
        valuesByName['BUN / Creatinine Ratio'] = ratio;
      }
    }

    // 3. Urea / Creatinine Ratio = Blood Urea / Serum Creatinine
    if (bloodUreaId && creatinineId && ureaCrRatioId) {
      const urea = valuesByName['Blood Urea'];
      const creatinine = valuesByName['Serum Creatinine'];
      if (urea !== undefined && creatinine > 0) {
        const ratio = urea / creatinine;
        calculatedResults[ureaCrRatioId] = { value: ratio.toFixed(2), calculated: true };
        valuesByName['Urea / Creatinine Ratio'] = ratio;
      }
    }

    // 4. eGFR (Estimated GFR) via CKD-EPI 2021
    if (creatinineId && egfrId) {
      const creatinine = valuesByName['Serum Creatinine'];
      if (creatinine !== undefined) {
        const gfrVal = calculateCKDEPI(creatinine, ageInYears, patientGender);
        calculatedResults[egfrId] = { value: String(gfrVal), calculated: true };
        valuesByName['eGFR (Estimated GFR)'] = gfrVal;
      }
    }
  } 
  else if (testCode === 'BIO003') { // Lipid Profile
    const totalCholId = nameToId['Total Cholesterol'];
    const triglyceridesId = nameToId['Triglycerides'];
    const hdlId = nameToId['HDL Cholesterol'];
    const ldlId = nameToId['LDL Cholesterol'];
    const vldlId = nameToId['VLDL Cholesterol'];
    const nonHdlId = nameToId['Non-HDL Cholesterol'];
    const cholHdlRatioId = nameToId['Cholesterol / HDL Ratio'];
    const ldlHdlRatioId = nameToId['LDL / HDL Ratio'];

    // 1. VLDL Cholesterol = Triglycerides / 5
    if (triglyceridesId && vldlId) {
      const tg = valuesByName['Triglycerides'];
      if (tg !== undefined) {
        const vldl = tg / 5;
        calculatedResults[vldlId] = { value: vldl.toFixed(1), calculated: true };
        valuesByName['VLDL Cholesterol'] = vldl;
      }
    }

    // 2. LDL Cholesterol = Total Cholesterol - HDL Cholesterol - VLDL Cholesterol
    if (totalCholId && hdlId && vldlId && ldlId) {
      const chol = valuesByName['Total Cholesterol'];
      const hdl = valuesByName['HDL Cholesterol'];
      const vldl = valuesByName['VLDL Cholesterol'];
      if (chol !== undefined && hdl !== undefined && vldl !== undefined) {
        const ldl = Math.max(0, chol - hdl - vldl);
        calculatedResults[ldlId] = { value: ldl.toFixed(1), calculated: true };
        valuesByName['LDL Cholesterol'] = ldl;
      }
    }

    // 3. Non-HDL Cholesterol = Total Cholesterol - HDL Cholesterol
    if (totalCholId && hdlId && nonHdlId) {
      const chol = valuesByName['Total Cholesterol'];
      const hdl = valuesByName['HDL Cholesterol'];
      if (chol !== undefined && hdl !== undefined) {
        const nonHdl = Math.max(0, chol - hdl);
        calculatedResults[nonHdlId] = { value: nonHdl.toFixed(1), calculated: true };
        valuesByName['Non-HDL Cholesterol'] = nonHdl;
      }
    }

    // 4. Cholesterol / HDL Ratio = Total Cholesterol / HDL Cholesterol
    if (totalCholId && hdlId && cholHdlRatioId) {
      const chol = valuesByName['Total Cholesterol'];
      const hdl = valuesByName['HDL Cholesterol'];
      if (chol !== undefined && hdl > 0) {
        const ratio = chol / hdl;
        calculatedResults[cholHdlRatioId] = { value: ratio.toFixed(2), calculated: true };
        valuesByName['Cholesterol / HDL Ratio'] = ratio;
      }
    }

    // 5. LDL / HDL Ratio = LDL Cholesterol / HDL Cholesterol
    if (ldlId && hdlId && ldlHdlRatioId) {
      const ldl = valuesByName['LDL Cholesterol'];
      const hdl = valuesByName['HDL Cholesterol'];
      if (ldl !== undefined && hdl > 0) {
        const ratio = ldl / hdl;
        calculatedResults[ldlHdlRatioId] = { value: ratio.toFixed(2), calculated: true };
        valuesByName['LDL / HDL Ratio'] = ratio;
      }
    }
  } 
  else if (testCode === 'HEM001') { // Complete Blood Count (CBC)
    const hbId = nameToId['Hemoglobin (Hb)'];
    const rbcId = nameToId['Erythrocyte (RBC) Count'];
    const pcvId = nameToId['Packed Cell Volume (PCV)'];
    const mcvId = nameToId['Mean Cell Volume (MCV)'];
    const mchId = nameToId['Mean Cell Haemoglobin (MCH)'];
    const mchcId = nameToId['Mean Corpuscular Hb Concn. (MCHC)'];

    // MCV = (PCV * 10) / RBC
    if (pcvId && rbcId && mcvId) {
      const pcv = valuesByName['Packed Cell Volume (PCV)'];
      const rbc = valuesByName['Erythrocyte (RBC) Count'];
      if (pcv !== undefined && rbc > 0) {
        const mcv = (pcv * 10) / rbc;
        calculatedResults[mcvId] = { value: mcv.toFixed(1), calculated: true };
        valuesByName['Mean Cell Volume (MCV)'] = mcv;
      }
    }

    // MCH = (Hb * 10) / RBC
    if (hbId && rbcId && mchId) {
      const hb = valuesByName['Hemoglobin (Hb)'];
      const rbc = valuesByName['Erythrocyte (RBC) Count'];
      if (hb !== undefined && rbc > 0) {
        const mch = (hb * 10) / rbc;
        calculatedResults[mchId] = { value: mch.toFixed(1), calculated: true };
        valuesByName['Mean Cell Haemoglobin (MCH)'] = mch;
      }
    }

    // MCHC = (Hb * 100) / PCV
    if (hbId && pcvId && mchcId) {
      const hb = valuesByName['Hemoglobin (Hb)'];
      const pcv = valuesByName['Packed Cell Volume (PCV)'];
      if (hb !== undefined && pcv > 0) {
        const mchc = (hb * 100) / pcv;
        calculatedResults[mchcId] = { value: mchc.toFixed(1), calculated: true };
        valuesByName['Mean Corpuscular Hb Concn. (MCHC)'] = mchc;
      }
    }
  }

  // 3. Perform custom dynamic formula evaluations for any parameter with a formula field
  parameters.forEach(p => {
    if (p.formula && !calculatedResults[p.id]) { // If a database formula is specified and not calculated yet
      const computed = evaluateCustomFormula(p.formula, valuesByName);
      if (computed !== null) {
        calculatedResults[p.id] = { value: computed.toFixed(2), calculated: true };
        valuesByName[p.name] = computed;
      }
    }
  });

  return calculatedResults;
}

/**
 * Checks if a parameter is auto-calculated for a given test
 */
export function isCalculated(
  testCode: string,
  paramName: string,
  paramFormula?: string | null
): boolean {
  if (paramFormula && paramFormula.trim() !== '') return true;
  
  if (testCode === 'BIO001') {
    return ['Indirect Bilirubin', 'Globulin', 'Albumin/Globulin Ratio (A:G Ratio)'].includes(paramName);
  }
  if (testCode === 'BIO002') {
    return ['Blood Urea', 'BUN / Creatinine Ratio', 'Urea / Creatinine Ratio', 'eGFR (Estimated GFR)'].includes(paramName);
  }
  if (testCode === 'BIO003') {
    return ['VLDL Cholesterol', 'LDL Cholesterol', 'Non-HDL Cholesterol', 'Cholesterol / HDL Ratio', 'LDL / HDL Ratio'].includes(paramName);
  }
  if (testCode === 'HEM001') {
    return ['Mean Cell Volume (MCV)', 'Mean Cell Haemoglobin (MCH)', 'Mean Corpuscular Hb Concn. (MCHC)'].includes(paramName);
  }
  return false;
}

