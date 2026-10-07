"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Shield, Building2, User, Key, CheckCircle2, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react';
import { db } from '../../lib/db';
import { useEnterAsTab } from '../../lib/useEnterAsTab';
import { RecoveryCode } from '../../components/kit';

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
  const [recoveryCode, setRecoveryCode] = useState('');

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
      // The backend creates the owner, names the lab and loads the test catalog in one transaction.
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Setup failed. Please try again.');
      localStorage.setItem('pathology_lab_current_user', JSON.stringify(data.user));
      setRecoveryCode(data.recoveryCode);
      setStep(4);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during local configuration. Please try again.');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-xl border bg-background pl-11 pr-4 py-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground";
  const labelClass = "text-xs font-semibold text-foreground";

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10 font-sans text-foreground">
      {/* Glowing backdrop blobs */}

      <div className="z-10 flex w-full max-w-4xl flex-col items-center gap-6">
        {/* Logo and Brand */}
        <div className="flex flex-col items-center text-center space-y-2 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-sm">
            <Activity className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">JharLab Laboratory Setup</h1>
          <p className="text-sm text-muted-foreground max-w-md">Initialize your pathology LIS database, lab profiles, and owner administrator account.</p>
        </div>

        {/* Setup Wizard Box */}
        <div className="w-full max-w-xl rounded-2xl border bg-card p-8 shadow-sm relative overflow-hidden">
          
          {/* Top Progress bar */}
          <div className="flex items-center justify-between mb-8 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
            <span className={step === 1 ? 'text-primary font-bold' : step > 1 ? 'text-green-600' : ''}>1. Lab Profile</span>
            <span className="h-[2px] flex-1 bg-border mx-3" />
            <span className={step === 2 ? 'text-primary font-bold' : step > 2 ? 'text-green-600' : ''}>2. Admin Credentials</span>
            <span className="h-[2px] flex-1 bg-border mx-3" />
            <span className={step >= 3 ? 'text-primary font-bold' : ''}>3. Config & Seed</span>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-destructive mb-6"
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
              <p className="text-xs text-muted-foreground mb-4">Provide details that will appear on print headers, billing invoices, and test report footers.</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Laboratory Name *</label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
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
                      className="w-full rounded-xl border bg-background px-4 py-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Lab Email Address (Optional)</label>
                    <input
                      type="email"
                      value={labEmail}
                      onChange={(e) => setLabEmail(e.target.value)}
                      placeholder="e.g. contact@lab.com"
                      className="w-full rounded-xl border bg-background px-4 py-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground"
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
                    className="w-full rounded-xl border bg-background p-4 text-sm text-foreground transition-colors placeholder:text-muted-foreground resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-border mt-6">
                <button
                  onClick={handleNextStep}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 px-5 py-3 text-sm font-bold text-white shadow-lg transition-all"
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
              <p className="text-xs text-muted-foreground mb-4">Create your secure login account. This profile will have SUPER_ADMIN owner privileges with full system controls.</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Owner Full Name *</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
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
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
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
                      <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
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
                      <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
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

              <div className="flex justify-between pt-6 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="flex items-center justify-center gap-2 rounded-xl border border-border hover:bg-accent px-5 py-3 text-sm font-semibold text-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
                
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all"
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
                <div className="absolute inset-0 rounded-full border-4 border-border" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold">Initializing Laboratory Database</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Creating pathology registers, initializing structural parameters, and seeding catalog of 200+ default tests. This will take a few moments...
                </p>
              </div>

              {/* Progress Bar Animation */}
              <div className="w-full max-w-xs bg-muted h-2 rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ width: '0%' }}
                  animate={{ width: '95%' }}
                  transition={{ duration: 15, ease: 'easeOut' }}
                  className="bg-primary h-full rounded-full"
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
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                <CheckCircle2 className="h-12 w-12" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Lab Setup Complete!</h2>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Owner account successfully registered, lab profile configured, and test databases seeded. You are ready to open the LIS!
                </p>
              </div>

              <div className="w-full max-w-sm">
                <RecoveryCode code={recoveryCode} continueLabel="Launch Dashboard" onContinue={() => router.push('/dashboard')} />
              </div>
            </motion.div>
          )}


        </div>
      </div>
    </div>
  );
}


