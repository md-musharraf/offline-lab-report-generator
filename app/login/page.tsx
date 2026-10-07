"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, ArrowRight, Activity, Shield, Users, FlaskConical, AlertCircle, Eye, EyeOff, KeyRound } from 'lucide-react';
import { db } from '../../lib/db';
import { useEnterAsTab } from '../../lib/useEnterAsTab';
import { RecoveryCode } from '../../components/kit';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labName, setLabName] = useState('');
  const [recovering, setRecovering] = useState(false);
  const router = useRouter();

  // Global Enter key behaves like Tab
  useEnterAsTab();

  // Check setup status and clear session on load
  useEffect(() => {
    localStorage.removeItem('pathology_lab_current_user');
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});

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
        const settings = await db.query('labSettings', 'findFirst', { where: { id: 1 }, select: { labName: true } });
        if (settings?.labName) setLabName(settings.labName);
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

  // Sign-in happens in the backend only: it checks the password, starts the session that every query is
  // checked against, and never sends password hashes to the screen.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        localStorage.setItem('pathology_lab_current_user', JSON.stringify(data.user));
        router.push('/dashboard');
        return;
      }
      setError(data.error || 'Invalid email or password');
    } catch (err: any) {
      setError(err.message || 'Could not reach the lab database.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background font-sans text-foreground">
      {/* Brand panel */}
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-tight">JharLab</div>
            <div className="text-xs text-primary-foreground/75">Laboratory Information System</div>
          </div>
        </div>
        <div className="relative space-y-4">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">{labName || 'Your lab'},<br />ready for today&apos;s samples.</h1>
          <ul className="space-y-2.5 text-sm text-primary-foreground/85">
            {['Registration, billing and barcodes in one screen', 'Analyzer results flow in automatically', 'Works fully offline: your data stays on this PC'].map(t => (
              <li key={t} className="flex items-center gap-2.5"><Activity className="h-4 w-4 shrink-0" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-primary-foreground/60">v{process.env.NEXT_PUBLIC_APP_VERSION} · Press Enter to move between fields</div>
      </div>

      {/* Sign-in form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-sm"
        >
          {recovering ? (
            <RecoverPanel
              onBack={recoveredEmail => {
                if (recoveredEmail) setEmail(recoveredEmail);
                setPassword('');
                setError(null);
                setRecovering(false);
              }}
            />
          ) : (
          <>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">Use the account your lab owner created for you.</p>

          <AnimatePresence>
            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-4 flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm font-medium">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="login-email"
                  type="email"
                  autoFocus
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="name@lab.com"
                  className="w-full rounded-lg border bg-card pl-10 pr-3 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm font-medium">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  className="w-full rounded-lg border bg-card pl-10 pr-11 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <button type="button" onClick={() => { setError(null); setRecovering(true); }} className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline">
            Forgot password or email?
          </button>

          {process.env.NODE_ENV === 'development' && (
            <div className="mt-8 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Development test accounts</p>
              <div className="grid grid-cols-3 gap-2">
                {demoAccounts.map((demo) => {
                  const Icon = demo.icon;
                  return (
                    <button
                      key={demo.role}
                      type="button"
                      onClick={() => handleDemoSelect(demo)}
                      className="flex flex-col items-start gap-1 rounded-lg border bg-card p-2.5 text-left text-xs transition-colors hover:border-primary/40"
                    >
                      <Icon className={`h-4 w-4 ${demo.textColor}`} />
                      <span className="font-semibold">{demo.role}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// Staff are reset by the owner (Staff screen). The owner uses the recovery code written down at setup;
// the backend returns the login email with a fresh code, since the old one is now used up.
function RecoverPanel({ onBack }: { onBack: (email?: string) => void }) {
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; recoveryCode: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError('Enter the recovery code');
    if (newPassword.length < 6) return setError('New password must be at least 6 characters');
    if (newPassword !== confirm) return setError('Passwords do not match');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not reset the password');
      setDone(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Password changed</h2>
        <p className="text-sm text-muted-foreground">Your owner login email is <b className="text-foreground">{done.email}</b>. Your old recovery code no longer works; here is the new one.</p>
        <RecoveryCode code={done.recoveryCode} continueLabel="Back to sign in" onContinue={() => onBack(done.email)} />
      </div>
    );
  }

  const field = 'w-full rounded-lg border bg-card px-3 text-sm';
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Reset password</h2>
      <div className="mb-5 mt-3 space-y-2 rounded-lg border bg-muted/40 p-3.5 text-sm text-muted-foreground">
        <p><b className="text-foreground">Staff:</b> ask your lab owner. They can see your login email and set a new password from Staff → Edit.</p>
        <p><b className="text-foreground">Lab owner:</b> enter the recovery code you wrote down when the lab was set up.</p>
      </div>
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="recover-code" className="text-sm font-medium">Recovery code</label>
          <input id="recover-code" autoFocus autoComplete="off" spellCheck={false} value={code} onChange={e => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" className={`${field} font-mono uppercase tracking-wider`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="recover-password" className="text-sm font-medium">New password</label>
          <input id="recover-password" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="recover-confirm" className="text-sm font-medium">Confirm new password</label>
          <input id="recover-confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={field} />
        </div>
        <button type="submit" disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60">
          <KeyRound className="h-4 w-4" />
          {busy ? 'Checking…' : 'Reset password'}
        </button>
      </form>
      <button type="button" onClick={() => onBack()} className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline">Back to sign in</button>
    </div>
  );
}
