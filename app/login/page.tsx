'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, checkIn } from '@/lib/api';
import { motion } from 'framer-motion';
import { Lock, Mail, Loader2, Star, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await login(email, password) as any;
      const { access_token, user } = res;

      // Block manager/cashier from admin portal
      if (user?.role === 'manager' || user?.role === 'cashier') {
        throw new Error('Access Denied: Use the Manager or Cashier portal instead.');
      }

      localStorage.setItem('admin_token', access_token);

      // Store user identity for header display
      localStorage.setItem('admin_user', JSON.stringify({
        name: user?.name ?? 'Admin',
        role: user?.role ?? 'admin',
        customRole: user?.custom_role ?? null,
      }));

      // Record attendance check-in based on login time
      await checkIn().catch(() => {});

      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f3ea] flex items-center justify-center px-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-600/5 rounded-full blur-[100px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-[400px] relative z-10"
      >
        {/* Logo Section */}
        <div className="text-center mb-10">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="inline-flex items-center justify-center w-20 h-20 bg-white border border-slate-100 rounded-2xl mb-5 shadow-xl shadow-blue-500/5 relative group p-2 overflow-hidden"
          >
            <img src="/rkm-logo.png" alt="RKM Logo" className="w-full h-full object-contain transform group-hover:scale-110 transition-transform duration-700" />
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-[28px] font-black text-slate-900 tracking-tighter uppercase"
          >
            RKM Jewellers
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-slate-500 text-sm mt-1.5 font-medium"
          >
            Sign in to your admin account
          </motion.p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200 rounded-[24px] p-8 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-2xl px-5 py-4 flex items-center gap-3">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="shrink-0 text-red-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div className="group/field relative">
                <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2 ml-1">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/field:text-blue-600 transition-colors" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@jewellery.com"
                    className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all duration-200"
                  />
                </div>
              </div>

              <div className="group/field relative">
                <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2 ml-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/field:text-blue-600 transition-colors" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all duration-200"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full relative group/btn overflow-hidden rounded-xl transition-all duration-300 h-13 shadow-md shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/20 active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-blue-600 group-hover/btn:bg-blue-700 transition-colors duration-300" />
              
              <div className="relative flex items-center justify-center gap-2.5 text-white text-sm font-semibold">
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Sign in</span>
                  </>
                )}
              </div>
            </button>
          </form>
        </div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-[11px] font-medium text-slate-400 mt-8 uppercase tracking-widest"
        >
          Admin access only
        </motion.p>
      </motion.div>
    </div>
  );
}
