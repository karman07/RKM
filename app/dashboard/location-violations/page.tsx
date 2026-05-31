'use client';
import { useState, useEffect } from 'react';
import { getLocationViolations, type LocationViolation } from '@/lib/api';
import { Loader2, MapPin, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function distanceBadge(dist?: number, radius?: number) {
  if (dist == null) return null;
  const over = dist - (radius ?? 200);
  return over;
}

export default function LocationViolationsPage() {
  const [violations, setViolations] = useState<LocationViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  function showToast(msg: string, type: 'success' | 'danger') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      setViolations(await getLocationViolations(200));
    } catch (e: any) {
      showToast(e.message || 'Failed to load violations', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-[1400px] mx-auto pb-20">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-red-500 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Location Violations</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Staff who attempted to sign in from outside their branch geofence
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && violations.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-2xl text-[11px] font-black uppercase tracking-wider text-red-700">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {violations.length} Violation{violations.length !== 1 ? 's' : ''} Recorded
            </div>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-5 py-4 bg-amber-50 border border-amber-100 rounded-2xl mb-8">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-px" />
        <p className="text-[11px] font-bold text-amber-700">
          Each entry below is a login attempt that was blocked because the user was outside their branch's allowed radius. Admins receive push notifications in real time when this occurs.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {['Staff', 'Role', 'Branch', 'Distance', 'Attempted From', 'Branch Location', 'Time'].map(h => (
                  <th key={h} className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3, 4].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-6 py-5 h-16 bg-white" />
                  </tr>
                ))
              ) : violations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-28 text-center">
                    <MapPin className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-bold text-sm">No location violations recorded.</p>
                    <p className="text-slate-300 text-xs mt-1">All staff are signing in from their assigned branch locations.</p>
                  </td>
                </tr>
              ) : (
                violations.map(v => {
                  const over = distanceBadge(v.distance_meters, v.geofence_radius);
                  return (
                    <tr key={v._id} className="hover:bg-red-50/20 transition-colors">
                      {/* Staff */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-600 text-xs font-black flex-shrink-0">
                            {v.user_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{v.user_name}</p>
                            <p className="text-[10px] text-slate-400">{v.user_email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full capitalize">
                          {v.user_role}
                        </span>
                      </td>

                      {/* Branch */}
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-slate-800">{v.branch_name || '—'}</p>
                      </td>

                      {/* Distance */}
                      <td className="px-6 py-4">
                        <div>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-black bg-red-50 text-red-700 border-red-200">
                            <AlertTriangle className="w-3 h-3" />
                            {v.distance_meters != null ? `${v.distance_meters}m away` : '—'}
                          </span>
                          {over != null && over > 0 && (
                            <p className="text-[10px] text-slate-400 mt-1">+{over}m over {v.geofence_radius ?? 200}m limit</p>
                          )}
                        </div>
                      </td>

                      {/* Attempted location */}
                      <td className="px-6 py-4">
                        <a
                          href={mapsLink(v.attempted_lat, v.attempted_lng)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {v.attempted_lat.toFixed(5)}, {v.attempted_lng.toFixed(5)}
                        </a>
                      </td>

                      {/* Branch location */}
                      <td className="px-6 py-4">
                        {v.branch_lat != null && v.branch_lng != null ? (
                          <a
                            href={mapsLink(v.branch_lat, v.branch_lng)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-800 transition-colors"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            {v.branch_lat.toFixed(5)}, {v.branch_lng.toFixed(5)}
                          </a>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Time */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-xs font-bold text-slate-700">
                          {new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(v.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
