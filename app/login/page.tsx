"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, ArrowRight, Activity, Shield, Users, FlaskConical, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { db } from '../../lib/db';
import { useEnterAsTab } from '../../lib/useEnterAsTab';
import bcrypt from 'bcryptjs';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Global Enter key behaves like Tab
  useEnterAsTab();

  // Check setup status and clear session on load
  useEffect(() => {
    localStorage.removeItem('pathology_lab_current_user');

    async function checkSetup() {
      try {
        // Try local DB query first
        const userCount = await db.query('user', 'count', {
          where: {
            role: { in: ['SUPER_ADMIN', 'ADMIN'] },
            deletedAt: null
          }
        });
        if (userCount === 0) {
          router.push('/setup');
          return;
        }
      } catch (e) {
        console.warn('Local DB setup check failed, trying API route:', e);
        try {
          const res = await fetch('/api/auth/setup-status');
          const data = await res.json();
          if (res.ok && data.isSetupRequired) {
            router.push('/setup');
          }
        } catch (apiErr) {
          console.error('Error checking setup status via API:', apiErr);
        }
      }
    }
    checkSetup();
  }, [router]);

  const demoAccounts = [
    {
      role: 'Owner (Admin)',
      email: 'admin@lab.com',
      pass: 'Admin@123',
      icon: Shield,
      color: 'from-blue-500 to-indigo-600',
      textColor: 'text-blue-500'
    },
    {
      role: 'Receptionist',
      email: 'receptionist@lab.com',
      pass: 'Staff@123',
      icon: Users,
      color: 'from-purple-500 to-pink-600',
      textColor: 'text-purple-500'
    },
    {
      role: 'Lab Technician',
      email: 'technician@lab.com',
      pass: 'Staff@123',
      icon: FlaskConical,
      color: 'from-emerald-500 to-teal-600',
      textColor: 'text-emerald-500'
    }
  ];

  const handleDemoSelect = (demo: typeof demoAccounts[0]) => {
    setEmail(demo.email);
    setPassword(demo.pass);
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let apiError = null;

      // 1. Try to authenticate via our API endpoint first (standard server-side Next.js environment)
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            localStorage.setItem('pathology_lab_current_user', JSON.stringify(data.user));
            router.push('/dashboard');
            return;
          } else {
            apiError = data.error || 'Invalid credentials';
          }
        } else {
          try {
            const data = await response.json();
            apiError = data.error;
          } catch (_) {}
        }
      } catch (apiErr) {
        console.warn('API login failed or unavailable, falling back to local DB/IPC:', apiErr);
      }

      // 2. Local Database / Electron IPC Authentication (essential for offline desktop app in production)
      try {
        const users = await db.query('user', 'findMany', {
          where: {
            email: email.toLowerCase().trim(),
            deletedAt: null
          }
        });

        const user = users && users[0];

        if (user && user.isActive) {
          let isMatch = false;
          let needsRehash = false;

          try {
            isMatch = await bcrypt.compare(password, user.password);
          } catch (bcryptErr) {
            console.warn('Bcrypt comparison failed, checking plain text:', bcryptErr);
          }

          // Plain-text legacy compatibility check
          if (!isMatch && password === user.password) {
            isMatch = true;
            needsRehash = true;
          }

          if (isMatch) {
            // Rehash plain text password on the fly to secure it
            if (needsRehash) {
              try {
                const hashed = await bcrypt.hash(password, 12);
                await db.query('user', 'update', {
                  where: { id: user.id },
                  data: { password: hashed }
                });
                console.log('Successfully migrated legacy plain-text password to hash for:', user.email);
              } catch (rehashErr) {
                console.error('Failed to rehash legacy password:', rehashErr);
              }
            }

            // Update lastLogin
            await db.query('user', 'update', {
              where: { id: user.id },
              data: { lastLogin: new Date() }
            });

            const authenticatedUser = {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              isActive: user.isActive
            };

            localStorage.setItem('pathology_lab_current_user', JSON.stringify(authenticatedUser));
            router.push('/dashboard');
            return;
          }
        }
      } catch (dbErr) {
        console.error('Local DB login query failed:', dbErr);
      }

      // 3. Fallback to hardcoded demo accounts (last line of defense) - Only in development mode
      if (process.env.NODE_ENV === 'development') {
        const matchingDemo = demoAccounts.find(
          d => d.email.toLowerCase() === email.toLowerCase().trim() && d.pass === password
        );

        if (matchingDemo) {
          const fallbackUser = {
            id: matchingDemo.role.includes('Owner') ? 1 : matchingDemo.role.includes('Receptionist') ? 2 : 3,
            name: matchingDemo.role.includes('Owner') 
              ? 'Admin Owner' 
              : matchingDemo.role.includes('Receptionist') 
                ? 'Rahul Kumar (Receptionist)' 
                : 'Dr. Amit Shah (Technician)',
            email: matchingDemo.email,
            role: matchingDemo.role.includes('Owner') 
              ? 'SUPER_ADMIN' 
              : matchingDemo.role.includes('Receptionist') 
                ? 'RECEPTIONIST' 
                : 'TECHNICIAN',
            isActive: true
          };
          localStorage.setItem('pathology_lab_current_user', JSON.stringify(fallbackUser));
          router.push('/dashboard');
          return;
        }
      }

      setError(apiError || 'Invalid email or password');
    } catch (err: any) {
      console.error('System login error:', err);
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0f] p-4 font-sans text-white">
      {/* Dynamic colorful blur blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-blue-600/20 to-purple-600/20 blur-[130px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-pink-600/15 to-emerald-600/15 blur-[130px] animate-pulse pointer-events-none" />

      <div className="z-10 flex w-full max-w-5xl flex-col gap-8 lg:flex-row items-center">
        {/* Left Side: Brand Info */}
        <div className="flex-1 space-y-6 text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-2"
          >
            <Activity className="h-5 w-5 text-blue-500 animate-pulse" />
            <span className="text-xs font-semibold tracking-wider text-blue-400 uppercase">JharLab Pathology LIS</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl font-extrabold tracking-tight sm:text-5xl"
          >
            Laboratory Information <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              System Dashboard
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-md text-sm text-gray-400 leading-relaxed mx-auto lg:mx-0"
          >
            A secure, role-based desktop environment ensuring lab settings, patient registers, results, and billing remain highly protected and organized.
          </motion.p>

          {/* Quick Demo Pre-fill cards - Only in development mode */}
          {process.env.NODE_ENV === 'development' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="space-y-3"
            >
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center lg:text-left">
                Quick Test Accounts
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {demoAccounts.map((demo) => {
                  const Icon = demo.icon;
                  return (
                    <button
                      key={demo.role}
                      onClick={() => handleDemoSelect(demo)}
                      className="flex flex-col items-center lg:items-start text-left p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/20 hover:bg-white/[0.06] transition-all hover:scale-[1.03] active:scale-[0.98] group"
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${demo.color} shadow-lg text-white mb-2.5`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold text-gray-200">{demo.role}</span>
                      <span className="text-[10px] text-gray-500 group-hover:text-gray-400 transition-colors mt-0.5 select-all">{demo.email}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Side: Login Form Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring', damping: 20 }}
          className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 blur-3xl pointer-events-none" />
          
          <h2 className="text-2xl font-bold tracking-tight text-white mb-1.5">Sign In</h2>
          <p className="text-xs text-gray-400 mb-6">Enter your lab credentials to access your dashboard</p>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400 mb-5"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="name@lab.com"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] pl-11 pr-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-600"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] pl-11 pr-11 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 focus:outline-none p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>Authenticate Session</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
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
        
        /* Overrides global input focus background-color to keep it dark on the login page */
        input:focus {
          background-color: rgba(255, 255, 255, 0.04) !important;
          color: white !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
      `}} />
    </div>
  );
}
