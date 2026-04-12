'use client';
import { useEffect, useState } from 'react';
import { getUsers, getCategories, getProducts, getInventory } from '@/lib/api';

interface Stats {
  users: number;
  categories: number;
  products: number;
  inventory: number;
  available: number;
  sold: number;
  reserved: number;
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="bg-white/90 border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-semibold uppercase tracking-[0.08em]">{label}</p>
          <p className="text-4xl font-semibold text-slate-900 mt-1 leading-none">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ring-1 ring-inset ring-white/70 ${accent}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [users, categories, products, inventory] = await Promise.all([
          getUsers(),
          getCategories(true),
          getProducts({ limit: '1' }),
          getInventory({ limit: '1' }),
        ]);

        const [avail, sold, reserved] = await Promise.all([
          getInventory({ limit: '1', status: 'available' }),
          getInventory({ limit: '1', status: 'sold' }),
          getInventory({ limit: '1', status: 'reserved' }),
        ]);

        setStats({
          users: users.length,
          categories: categories.length,
          products: products.total,
          inventory: inventory.total,
          available: avail.total,
          sold: sold.total,
          reserved: reserved.total,
        });
      } catch {
        // silently fail — dashboard doesn't block use
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview of your  system</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard
          label="Total Users"
          value={stats?.users ?? '—'}
          accent="bg-[var(--color-brand-50)] text-[var(--color-brand-700)]"
          icon={
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          }
        />
        <StatCard
          label="Categories"
          value={stats?.categories ?? '—'}
          accent="bg-[var(--color-warm-50)] text-[var(--color-warm-500)]"
          icon={
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          }
        />
        <StatCard
          label="Products"
          value={stats?.products ?? '—'}
          accent="bg-[var(--color-highlight-50)] text-[var(--color-highlight-700)]"
          icon={
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          }
        />
        <StatCard
          label="Inventory Items"
          value={stats?.inventory ?? '—'}
          accent="bg-slate-100 text-slate-700"
          icon={
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          }
        />
      </div>

      {/* Inventory status breakdown */}
      <div className="bg-white/90 border border-slate-200/80 rounded-2xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-5">Inventory Status Breakdown</h2>
        <div className="space-y-3">
          {[
            { label: 'Available', value: stats?.available ?? 0, color: 'bg-emerald-500', total: stats?.inventory ?? 1 },
            { label: 'Sold', value: stats?.sold ?? 0, color: 'bg-blue-500', total: stats?.inventory ?? 1 },
            { label: 'Reserved', value: stats?.reserved ?? 0, color: 'bg-amber-500', total: stats?.inventory ?? 1 },
          ].map(({ label, value, color, total }) => {
            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
            return (
              <div key={label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-slate-700">{label}</span>
                  <span className="text-slate-500">{value} items ({pct}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
