'use client';

import { useState, useEffect } from 'react';
import { getCustomers, type Customer, staticUrl } from '@/lib/api';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import Link from 'next/link';
import { 
  Users, 
  Search, 
  Mail, 
  Phone, 
  MapPin, 
  ChevronRight, 
  Calendar, 
  CheckCircle2, 
  XCircle,
  ExternalLink,
  Filter
} from 'lucide-react';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [search, setSearch] = useState('');
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];

  useEffect(() => {
    setLoading(true);
    getCustomers(page, limit)
      .then(res => {
        setCustomers(res.data);
        setMeta(res.meta);
      })
      .finally(() => setLoading(false));
  }, [page, limit]);

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-serif font-bold text-slate-900 tracking-tight">Client Relations</h1>
          <p className="text-slate-400 mt-2 text-sm font-medium uppercase tracking-[0.2em]">Manage your global customer network ({customers.length})</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 pr-6 py-4 bg-white border border-slate-100 rounded-2xl w-full md:w-[400px] outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all shadow-sm"
            />
          </div>
          <button className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 transition-all hover:shadow-md active:scale-95">
            <Filter size={20} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-64 bg-white border border-slate-100 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((customer) => (
            <Link 
              key={customer._id}
              href={`/dashboard/customers/${customer._id}`}
              className="group bg-white border border-slate-100 rounded-3xl p-8 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-500 relative overflow-hidden"
            >
              {/* Profile Header */}
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform duration-500">
                    {customer.profileImage ? (
                      <img src={staticUrl(customer.profileImage)} alt={customer.name} className="w-full h-full object-cover" />
                    ) : (
                      <Users className="text-slate-300" size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{customer.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {customer.isEmailVerified ? (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100/50">
                          <CheckCircle2 size={10} /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                           Awaiting Verification
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded-xl text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                  <ExternalLink size={18} />
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                    <Mail size={14} className="opacity-50" />
                  </div>
                  <span className="text-xs font-semibold truncate uppercase tracking-wider">{customer.email || 'No email provided'}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                    <Phone size={14} className="opacity-50" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider">{customer.phone || 'No phone provided'}</span>
                </div>
                {customer.city && (
                  <div className="flex items-center gap-3 text-slate-500">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                      <MapPin size={14} className="opacity-50" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider">{customer.city}, {customer.country}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <Calendar size={12} />
                  Joined {new Date(customer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] group-hover:translate-x-1 transition-transform">
                  View Profile <ChevronRight size={12} />
                </div>
              </div>
              
              {/* Background Accent */}
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl" />
            </Link>
          ))}
        </div>
      )}

      {!loading && customers.length > 0 && (
        <div className="mt-16 flex items-center justify-between border-t border-slate-50 pt-10">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Showing Page {meta.page} of {meta.total_pages} — {meta.total} Clients Total
          </p>
          <div className="flex gap-2">
            <button 
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="px-6 py-3 bg-white border border-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              Previous
            </button>
            <button 
              disabled={page >= meta.total_pages || loading}
              onClick={() => setPage(p => p + 1)}
              className="px-6 py-3 bg-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-blue-900/10 hover:bg-blue-700 transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              Next Page
            </button>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-32 text-center">
          <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center mx-auto mb-6">
            <Users className="text-slate-200" size={40} />
          </div>
          <h2 className="text-xl font-serif font-bold text-slate-900">No Customers Found</h2>
          <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">Try refining your search terms to find the client you are looking for.</p>
        </div>
      )}
    </div>
  );
}
