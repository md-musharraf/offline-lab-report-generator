"use client";
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, X, AlertCircle } from 'lucide-react';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { getRoleAndPermissions } from '@/lib/utils';

interface AdminOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionDescription?: string;
}

export function AdminOverrideModal({ isOpen, onClose, onSuccess, actionDescription = "this restricted action" }: AdminOverrideModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Try to query database for admin/owner
      const users = await db.query('user', 'findMany', {
        where: {
          email: email.toLowerCase().trim(),
          deletedAt: null
        }
      });

      const user = users && users[0];

      if (user && user.isActive) {
        const { role } = getRoleAndPermissions(user.role);
        const upperRole = role.toUpperCase();
        
        if (upperRole === 'SUPER_ADMIN' || upperRole === 'ADMIN') {
          let isMatch = false;

          try {
            isMatch = await bcrypt.compare(password, user.password);
          } catch (bcryptErr) {
            console.warn('Bcrypt comparison failed, checking plain text:', bcryptErr);
          }

          // Plain-text legacy check
          if (!isMatch && password === user.password) {
            isMatch = true;
          }

          if (isMatch) {
            setLoading(false);
            setEmail('');
            setPassword('');
            onSuccess();
            onClose();
            return;
          }
        }
      }

      setError('Invalid admin credentials or unauthorized account');
    } catch (err: any) {
      console.error('Admin override validation failed:', err);
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#060608]/80 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="z-10 w-full max-w-md rounded-2xl border border-destructive/25 bg-card/95 p-6 shadow-2xl backdrop-blur-md relative overflow-hidden text-foreground"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2 text-destructive">
                <Lock className="h-5 w-5" />
                <span className="font-bold text-sm tracking-tight uppercase">Manager Override Required</span>
              </div>
              <button
                onClick={onClose}
                type="button"
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              To authorize <span className="font-semibold text-foreground">"{actionDescription}"</span>, a Lab Owner or Manager must enter their password credentials below.
            </p>

            {/* Error Alert */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4.5 py-3 text-xs text-red-400 mb-4 animate-shake">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Admin/Manager Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground/60" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="manager@lab.com"
                    className="w-full rounded-xl border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-muted-foreground/45"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Manager Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground/60" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="••••••••"
                    className="w-full rounded-xl border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-muted-foreground/45"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-2 border-t mt-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2 px-4.5 text-xs font-bold rounded-xl border border-border hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-destructive hover:bg-destructive/90 py-2 px-5 text-xs font-bold text-white shadow-lg shadow-destructive/15 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <div className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      <span>Approve & Unlock</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
