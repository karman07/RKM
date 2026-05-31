'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  getProfile, getMyAttendance, getMyAttendanceStats, getHolidays, checkSessionExpiry,
  type UserProfile, type StaffAttendanceRecord, type Holiday,
} from '../../../lib/api';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; textColor: string; bg: string; dotColor: string; border: string }> = {
  present:    { label: 'Present',  textColor: 'text-emerald-700', bg: 'bg-emerald-50',  dotColor: 'bg-emerald-500', border: 'border-emerald-200' },
  absent:     { label: 'Absent',   textColor: 'text-red-600',     bg: 'bg-red-50',      dotColor: 'bg-red-500',     border: 'border-red-200'     },
  'half-day': { label: 'Half Day', textColor: 'text-amber-700',   bg: 'bg-amber-50',    dotColor: 'bg-amber-500',   border: 'border-amber-200'   },
  'on-leave': { label: 'On Leave', textColor: 'text-blue-700',    bg: 'bg-blue-50',     dotColor: 'bg-blue-500',    border: 'border-blue-200'    },
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfWeek(y: number, m: number) { return new Date(y, m, 1).getDay(); }

function normalizeHolidayForYear(h: Holiday, year: number): string | null {
  if (h.is_yearly) return `${year}-${h.date}`;
  if (h.date.startsWith(String(year))) return h.date;
  return null;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, total, color, bg, barColor }: { label: string; value: number; total: number; color: string; bg: string; barColor: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`rounded-2xl border border-slate-100 p-5 shadow-sm ${bg}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</p>
      <p className={`text-3xl font-black ${color} mb-3`}>{value}</p>
      <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-slate-400 font-medium mt-1">{pct}% of days</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const todayKey = now.toISOString().split('T')[0];
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('cashier_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then(async (profile) => {
        setUser(profile);
        const startDate = new Date(viewYear, viewMonth, 1).toISOString();
        const endDate = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString();
        const [recs, sts, hols] = await Promise.all([
          getMyAttendance(profile._id, startDate, endDate),
          getMyAttendanceStats(profile._id, viewMonth, viewYear),
          getHolidays(viewYear),
        ]);
        setRecords(recs);
        setStats(sts);
        setHolidays(hols);
      })
      .catch(() => { localStorage.removeItem('cashier_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [viewYear, viewMonth, router]);

  const recordMap: Record<string, StaffAttendanceRecord> = {};
  records.forEach(r => { recordMap[new Date(r.date).toISOString().split('T')[0]] = r; });

  const holidayMap: Record<string, Holiday> = {};
  holidays.forEach(h => {
    const key = normalizeHolidayForYear(h, viewYear);
    if (key) holidayMap[key] = h;
  });

  const totalDays = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  function navMonth(dir: 1 | -1) {
    let m = viewMonth + dir, y = viewYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setViewMonth(m); setViewYear(y);
  }

  const todayRecord = recordMap[todayKey];
  const totalTracked = stats ? stats.present + stats.absent + stats.halfDay + stats.onLeave : 0;

  const upcomingHolidays = holidays
    .map(h => {
      const fullKey = normalizeHolidayForYear(h, now.getFullYear())
        ?? normalizeHolidayForYear(h, now.getFullYear() + 1);
      return fullKey ? { ...h, fullKey } : null;
    })
    .filter((h): h is Holiday & { fullKey: string } => !!h && h.fullKey >= todayKey)
    .sort((a, b) => a.fullKey.localeCompare(b.fullKey))
    .slice(0, 4);

  if (loading) return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-8 bg-white min-h-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">My Attendance</h1>
          <p className="text-slate-400 font-medium mt-1 text-sm">Your attendance is recorded automatically each time you sign in.</p>
        </div>
        {user && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl">
            <div className="w-8 h-8 rounded-xl bg-[#5A0F1A] flex items-center justify-center text-white text-xs font-black flex-shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-black text-slate-900 leading-none">{user.name}</p>
              <p className="text-[10px] text-slate-400 capitalize mt-0.5">{user.role}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Present"  value={stats.present}  total={totalTracked} color="text-emerald-600" bg="bg-white" barColor="bg-emerald-500" />
          <StatCard label="Absent"   value={stats.absent}   total={totalTracked} color="text-red-500"     bg="bg-white" barColor="bg-red-500"    />
          <StatCard label="Half Day" value={stats.halfDay}  total={totalTracked} color="text-amber-500"   bg="bg-white" barColor="bg-amber-500"  />
          <StatCard label="On Leave" value={stats.onLeave}  total={totalTracked} color="text-blue-500"    bg="bg-white" barColor="bg-blue-500"   />
        </div>
      )}

      {/* ── Attendance Rate ── */}
      {stats && totalTracked > 0 && (() => {
        const rate = Math.round(((stats.present + stats.halfDay * 0.5) / totalTracked) * 100);
        const rateColor = rate >= 90 ? 'text-emerald-700' : rate >= 75 ? 'text-amber-700' : 'text-red-600';
        const barColor  = rate >= 90 ? 'bg-emerald-500' : rate >= 75 ? 'bg-amber-500' : 'bg-red-500';
        return (
          <div className="bg-white border border-slate-100 rounded-2xl px-6 py-4 shadow-sm flex items-center gap-5">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Attendance Rate — {monthName}</p>
                <p className={`text-base font-black ${rateColor}`}>{rate}%</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${rate}%` }} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Calendar ── */}
      <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-100">
          <button onClick={() => navMonth(-1)} className="p-2 rounded-xl hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-700">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="text-base font-black text-slate-900">{monthName}</h2>
          <button onClick={() => navMonth(1)} disabled={viewYear === now.getFullYear() && viewMonth === now.getMonth()} className="p-2 rounded-xl hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-700 disabled:opacity-30">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-3 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 p-4 gap-1.5">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}

          {Array.from({ length: totalDays }).map((_, idx) => {
            const day = idx + 1;
            const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const record = recordMap[dateKey];
            const holiday = holidayMap[dateKey];
            const status = record?.status;
            const cfg = status ? STATUS_MAP[status] : null;
            const isToday = dateKey === todayKey;
            const isFuture = new Date(dateKey + 'T00:00:00') > now;
            const isSunday = new Date(dateKey + 'T00:00:00').getDay() === 0;

            return (
              <div
                key={day}
                title={holiday ? holiday.name : undefined}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl transition-all
                  ${isToday ? 'ring-2 ring-[#5A0F1A] ring-offset-1 bg-[#5A0F1A]/5' : ''}
                  ${holiday && !isToday ? 'bg-violet-50' : !isToday ? 'bg-white' : ''}
                `}
              >
                <span className={`text-sm leading-none
                  ${isFuture && !holiday  ? 'text-slate-200 font-medium'
                    : isToday             ? 'text-[#5A0F1A] font-black'
                    : holiday             ? 'text-violet-600 font-black'
                    : isSunday            ? 'text-slate-300 font-medium'
                    : cfg                 ? cfg.textColor + ' font-black'
                    : 'text-slate-400 font-medium'}
                `}>{day}</span>
                {cfg && !holiday && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${cfg.dotColor}`} />}
                {holiday && <span className="w-1.5 h-1.5 rounded-full mt-0.5 bg-violet-500" />}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-8 py-4 border-t border-slate-50 bg-slate-50/30">
          {Object.entries(STATUS_MAP).map(([, c]) => (
            <div key={c.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${c.dotColor}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${c.textColor}`}>{c.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600">Holiday</span>
          </div>
        </div>
      </div>

      {/* ── Today's Sign-in ── */}
      {todayRecord && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-100 rounded-[1.5rem] p-6 flex items-center gap-5 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-[#5A0F1A] flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-black text-[#5A0F1A] uppercase tracking-widest mb-1">Check-In Time</p>
              <p className="text-xl font-black text-slate-900">
                {todayRecord.check_in ? new Date(todayRecord.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Recorded at sign in</p>
            </div>
          </div>

          <div className={`border rounded-[1.5rem] p-6 flex items-center gap-5 shadow-sm ${todayRecord.auto_checked_out ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-100'}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${todayRecord.auto_checked_out ? 'bg-orange-100' : 'bg-slate-100'}`}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" className={todayRecord.auto_checked_out ? 'text-orange-500' : 'text-slate-500'} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <div>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${todayRecord.auto_checked_out ? 'text-orange-500' : 'text-slate-500'}`}>Check-Out Time</p>
              <p className="text-xl font-black text-slate-900">
                {todayRecord.check_out ? new Date(todayRecord.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Not Recorded'}
              </p>
              {todayRecord.auto_checked_out ? (
                <p className="text-[10px] text-orange-500 font-black mt-0.5">Auto-checkout — you forgot to sign out</p>
              ) : (
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Recorded when you sign out</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Today's status badge */}
      {todayRecord?.status && (() => {
        const cfg = STATUS_MAP[todayRecord.status];
        if (!cfg) return null;
        return (
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl border ${cfg.bg} ${cfg.border}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dotColor}`} />
            <p className={`text-sm font-black ${cfg.textColor}`}>
              Today's Status: <span className="font-black">{cfg.label}</span>
            </p>
          </div>
        );
      })()}

      {/* ── Upcoming Holidays ── */}
      {upcomingHolidays.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
          <div className="px-7 py-5 border-b border-slate-50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-violet-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Upcoming Holidays</p>
              <p className="text-[10px] text-slate-400">Set by management</p>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {upcomingHolidays.map(h => {
              const dateStr = h.is_yearly
                ? new Date(h.fullKey + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })
                : new Date(h.fullKey + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
              const daysLeft = Math.ceil((new Date(h.fullKey + 'T00:00:00').getTime() - now.getTime()) / 86400000);
              return (
                <div key={h._id} className="flex items-center gap-4 px-7 py-4">
                  <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-900">{h.name}</p>
                    <p className="text-[11px] text-violet-600 font-bold mt-0.5">{dateStr}</p>
                    {h.description && <p className="text-[10px] text-slate-400 mt-0.5">{h.description}</p>}
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full whitespace-nowrap ${daysLeft === 0 ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`}>
                    {daysLeft === 0 ? 'Today' : `${daysLeft}d away`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
