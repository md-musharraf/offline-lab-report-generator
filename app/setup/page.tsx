"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Shield, Building2, User, Key, CheckCircle2, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react';
import { db } from '../../lib/db';
import { useEnterAsTab } from '../../lib/useEnterAsTab';
import { defaultTests } from '../../lib/default-tests';
import bcrypt from 'bcryptjs';

export default function SetupPage() {
  const router = useRouter();
  
  // Global Enter key behaves like Tab
  useEnterAsTab();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [labName, setLabName] = useState('');
  const [labMobile, setLabMobile] = useState('');
  const [labAddress, setLabAddress] = useState('');
  const [labEmail, setLabEmail] = useState('');

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Checking if setup is already done
  useEffect(() => {
    async function checkSetup() {
      try {
        // Try local DB query first
        const userCount = await db.query('user', 'count', {
          where: {
            role: { in: ['SUPER_ADMIN', 'ADMIN'] },
            deletedAt: null
          }
        });
        if (userCount > 0) {
          router.push('/login');
          return;
        }
      } catch (e) {
        console.warn('Local DB setup check failed, trying API route:', e);
        try {
          const res = await fetch('/api/auth/setup-status');
          const data = await res.json();
          if (res.ok && !data.isSetupRequired) {
            router.push('/login');
          }
        } catch (apiErr) {
          console.error('Error checking setup status via API:', apiErr);
        }
      }
    }
    checkSetup();
  }, [router]);

  const handleNextStep = () => {
    setError(null);
    if (step === 1) {
      if (!labName.trim() || !labMobile.trim() || !labAddress.trim()) {
        setError('Please fill in all required lab profile fields.');
        return;
      }
      setStep(2);
    }
  };

  const handlePrevStep = () => {
    setError(null);
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation for owner details
    if (!ownerName.trim() || !ownerEmail.trim() || !ownerPassword.trim()) {
      setError('Owner profile fields are required.');
      return;
    }

    if (ownerPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (ownerPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setStep(3); // Go to installation loading screen

    try {
      let apiSuccess = false;
      let apiUser = null;

      // 1. Try to set up via server-side API first (standard Next.js dev server environment)
      try {
        const response = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            labName,
            mobile: labMobile,
            address: labAddress,
            email: labEmail,
            ownerName,
            ownerEmail,
            ownerPassword
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            apiSuccess = true;
            apiUser = data.user;
          } else {
            setError(data.error || 'Configuration failed. Please try again.');
            setStep(2);
            setLoading(false);
            return;
          }
        }
      } catch (apiErr) {
        console.warn('Setup API failed or unavailable, falling back to local DB/IPC:', apiErr);
      }

      if (apiSuccess && apiUser) {
        localStorage.setItem('pathology_lab_current_user', JSON.stringify(apiUser));
        setStep(4);
        return;
      }

      // 2. Local Database / Electron IPC Setup (essential for offline desktop app in production)
      // Check existing admin count
      const existingAdmins = await db.query('user', 'count', {
        where: {
          role: { in: ['SUPER_ADMIN', 'ADMIN'] },
          deletedAt: null
        }
      });

      if (existingAdmins > 0) {
        setError('Setup is already complete. Owner registration blocked.');
        setStep(2);
        setLoading(false);
        return;
      }

      // Create LabSettings (Prisma SQLite fields only)
      await db.query('labSettings', 'create', {
        data: {
          id: 1,
          labName,
          mobile: labMobile,
          address: labAddress,
          email: labEmail || null
        }
      });

      // Hash Password and Create Owner User
      const hashedPassword = await bcrypt.hash(ownerPassword, 12);
      const owner = await db.query('user', 'create', {
        data: {
          name: ownerName,
          email: ownerEmail.toLowerCase().trim(),
          password: hashedPassword,
          role: 'SUPER_ADMIN',
          isActive: true,
          lastLogin: new Date()
        }
      });

      // Cleanup any pre-existing tests/parameters to avoid unique constraint issues
      try {
        const existingTests = await db.query('test', 'findMany', {});
        if (existingTests && existingTests.length > 0) {
          console.log(`Cleaning up ${existingTests.length} legacy tests before seeding...`);
          for (const t of existingTests) {
            const params = await db.query('testParameter', 'findMany', { where: { testId: t.id } });
            if (params && params.length > 0) {
              for (const p of params) {
                await db.query('referenceRange', 'deleteMany', { where: { parameterId: p.id } });
              }
              await db.query('testParameter', 'deleteMany', { where: { testId: t.id } });
            }
            await db.query('test', 'delete', { where: { id: t.id } });
          }
        }
      } catch (cleanErr) {
        console.warn('Cleanup before seed failed (ignoring):', cleanErr);
      }

      // Seed Default Test Categories & Tests Catalog
      const categories = [
        'Hematology', 'Biochemistry', 'Serology', 'Microbiology', 'Clinical Pathology', 'Immunology'
      ];

      const categoryMap: Record<string, number> = {};

      for (const cat of categories) {
        const c = await db.query('testCategory', 'upsert', {
          where: { name: cat },
          update: {},
          create: { name: cat },
        });
        categoryMap[cat] = c.id;
      }

      for (const t of defaultTests) {
        await db.query('test', 'create', {
          data: {
            code: t.code,
            name: t.name,
            shortName: t.shortName || null,
            categoryId: categoryMap[t.category],
            price: Number(t.price),
            duration: t.duration || 1,
            sampleType: t.sampleType || 'Whole Blood',
            container: t.container || null,
            parameters: t.parameters.map((p: any, pIdx: number) => ({
              name: p.name,
              unit: p.unit || null,
              sortOrder: p.sortOrder || (pIdx + 1),
              type: p.type || 'NUMERIC',
              options: p.options || null,
              isHeader: p.isHeader || false,
              refRanges: (p.refRanges || []).map((r: any) => ({
                gender: r.gender || null,
                normalMin: r.normalMin !== undefined ? r.normalMin : null,
                normalMax: r.normalMax !== undefined ? r.normalMax : null,
                criticalMin: r.criticalMin !== undefined ? r.criticalMin : null,
                criticalMax: r.criticalMax !== undefined ? r.criticalMax : null,
                textNormal: r.textNormal || null
              }))
            }))
          }
        });
      }

      const authenticatedUser = {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        isActive: owner.isActive
      };

      localStorage.setItem('pathology_lab_current_user', JSON.stringify(authenticatedUser));
      setStep(4);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during local configuration. Please try again.');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.02] pl-11 pr-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-600";
  const labelClass = "text-xs font-semibold text-gray-300";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0f] p-4 font-sans text-white">
      {/* Glowing backdrop blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-blue-600/15 to-indigo-600/15 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-purple-600/15 to-pink-600/15 blur-[130px] pointer-events-none" />

      <div className="z-10 flex w-full max-w-4xl flex-col items-center gap-6">
        {/* Logo and Brand */}
        <div className="flex flex-col items-center text-center space-y-2 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
            <Activity className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">JharLab Laboratory Setup</h1>
          <p className="text-sm text-gray-400 max-w-md">Initialize your pathology LIS database, lab profiles, and owner administrator account.</p>
        </div>

        {/* Setup Wizard Box */}
        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.02] p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          
          {/* Top Progress bar */}
          <div className="flex items-center justify-between mb-8 text-xs text-gray-400 font-semibold uppercase tracking-wider">
            <span className={step === 1 ? 'text-blue-400 font-bold' : step > 1 ? 'text-green-500' : ''}>1. Lab Profile</span>
            <span className="h-[2px] flex-1 bg-white/10 mx-3" />
            <span className={step === 2 ? 'text-blue-400 font-bold' : step > 2 ? 'text-green-500' : ''}>2. Admin Credentials</span>
            <span className="h-[2px] flex-1 bg-white/10 mx-3" />
            <span className={step >= 3 ? 'text-blue-400 font-bold' : ''}>3. Config & Seed</span>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400 mb-6"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* STEP 1: Lab Profile Information */}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold mb-1">Laboratory Information</h2>
              <p className="text-xs text-gray-400 mb-4">Provide details that will appear on print headers, billing invoices, and test report footers.</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Laboratory Name *</label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-500" />
                    <input
                      type="text"
                      value={labName}
                      onChange={(e) => setLabName(e.target.value)}
                      placeholder="e.g. Apex Diagnostics Lab"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Mobile Number *</label>
                    <input
                      type="tel"
                      value={labMobile}
                      onChange={(e) => setLabMobile(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Lab Email Address (Optional)</label>
                    <input
                      type="email"
                      value={labEmail}
                      onChange={(e) => setLabEmail(e.target.value)}
                      placeholder="e.g. contact@lab.com"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Physical Address *</label>
                  <textarea
                    rows={3}
                    value={labAddress}
                    onChange={(e) => setLabAddress(e.target.value)}
                    placeholder="e.g. 1st Floor, Royal Plaza, Court Road, Ranchi, Jharkhand"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-600 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-white/5 mt-6">
                <button
                  onClick={handleNextStep}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-lg transition-all"
                >
                  <span>Owner Account Credentials</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Owner Credentials */}
          {step === 2 && (
            <motion.form
              onSubmit={handleSetup}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold mb-1">Create Owner Credentials</h2>
              <p className="text-xs text-gray-400 mb-4">Create your secure login account. This profile will have SUPER_ADMIN owner privileges with full system controls.</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Owner Full Name *</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-500" />
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Dr. Ramesh Prasad"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Login Email Address *</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-500" />
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="e.g. owner@lab.com"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Login Password *</label>
                    <div className="relative">
                      <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-500" />
                      <input
                        type="password"
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                        placeholder="••••••••"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Confirm Password *</label>
                    <div className="relative">
                      <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-500" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-6 border-t border-white/5 mt-6">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/15 hover:bg-white/5 px-5 py-3 text-sm font-semibold text-gray-300 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
                
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all"
                >
                  <span>Build Lab & Database</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.form>
          )}

          {/* STEP 3: Setup & Seeding In Progress */}
          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-10 text-center space-y-6"
            >
              <div className="h-16 w-16 relative">
                <div className="absolute inset-0 rounded-full border-4 border-white/10" />
                <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold">Initializing Laboratory Database</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Creating pathology registers, initializing structural parameters, and seeding catalog of 200+ default tests. This will take a few moments...
                </p>
              </div>

              {/* Progress Bar Animation */}
              <div className="w-full max-w-xs bg-white/5 h-2 rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ width: '0%' }}
                  animate={{ width: '95%' }}
                  transition={{ duration: 15, ease: 'easeOut' }}
                  className="bg-blue-500 h-full rounded-full"
                />
              </div>
            </motion.div>
          )}

          {/* STEP 4: Setup Complete */}
          {step === 4 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-8 text-center space-y-6 animate-fade-in"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 text-green-500 border border-green-500/20 animate-bounce">
                <CheckCircle2 className="h-12 w-12" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Lab Setup Complete!</h2>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Owner account successfully registered, lab profile configured, and test databases seeded. You are ready to open the LIS!
                </p>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full max-w-xs py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Launch Dashboard
              </button>
            </motion.div>
          )}

      <style dangerouslySetInnerHTML={{__html: `
        /* Overrides Chrome/Chromium autofill background and text color */
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px #181824 inset !important;
          -webkit-text-fill-color: white !important;
          caret-color: white !important;
        }
        
        /* Overrides global input focus background-color to keep it dark on the setup page */
        input:focus {
          background-color: rgba(255, 255, 255, 0.04) !important;
          color: white !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
      `}} />
        </div>
      </div>
    </div>
  );
}


