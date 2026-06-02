'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getProfile, getMyPayroll, getHolidays, checkSessionExpiry,
  type UserProfile, type MyPayroll, type PayrollCalendarDay, type Holiday,
} from '../../../lib/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAND = '#5A0F1A';
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const DAY_CFG: Record<string, { text: string; dot: string; bg: string; border: string; label: string }> = {
  present:          { text: 'text-emerald-700', dot: 'bg-emerald-500',  bg: 'bg-emerald-50/70',  border: 'border-emerald-100', label: 'Present'        },
  absent:           { text: 'text-red-600',     dot: 'bg-red-500',      bg: 'bg-red-50/70',      border: 'border-red-100',     label: 'Absent'         },
  'half-day':       { text: 'text-amber-700',   dot: 'bg-amber-500',    bg: 'bg-amber-50/70',    border: 'border-amber-100',   label: 'Half Day'       },
  'paid-time-off':  { text: 'text-blue-700',    dot: 'bg-blue-500',     bg: 'bg-blue-50/70',     border: 'border-blue-100',    label: 'Paid Time Off'  },
  'on-leave':       { text: 'text-blue-700',    dot: 'bg-blue-500',     bg: 'bg-blue-50/70',     border: 'border-blue-100',    label: 'Paid Time Off'  },
  holiday:          { text: 'text-violet-700',  dot: 'bg-violet-500',   bg: 'bg-violet-50/70',   border: 'border-violet-100',  label: 'Holiday'        },
  weekend:          { text: 'text-slate-300',   dot: 'bg-slate-200',    bg: '',                  border: 'border-transparent', label: 'Sunday'         },
  'yet-to-check-in':{ text: 'text-orange-600',  dot: 'bg-orange-400',   bg: 'bg-orange-50/60',   border: 'border-orange-100',  label: 'Yet to Check In'},
  upcoming:         { text: 'text-slate-300',   dot: 'bg-slate-200',    bg: '',                  border: 'border-transparent', label: '—'              },
};

function fmtFull(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

function normalizeHoliday(h: Holiday, year: number): string | null {
  if (h.is_yearly) return `${year}-${h.date}`;
  if (h.date.startsWith(String(year))) return h.date;
  return null;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function AttendanceCalendar({ calendar, holidayMap }: { calendar: PayrollCalendarDay[]; holidayMap: Record<string, string> }) {
  const weeks: (PayrollCalendarDay | null)[][] = [];
  if (!calendar.length) return null;

  const first = new Date(calendar[0].date);
  const pad   = first.getDay();
  let week: (PayrollCalendarDay | null)[] = Array(pad).fill(null);

  for (const day of calendar) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  return (
    <div>
      <div className="grid grid-cols-7 mb-3">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 py-2">{d}</div>
        ))}
      </div>
      {weeks.map((wk, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
          {wk.map((day, di) => {
            if (!day) return <div key={di} />;
            const cfg    = DAY_CFG[day.status] ?? DAY_CFG.upcoming;
            const dayNum = new Date(day.date).getDate();
            const hName  = holidayMap[day.date];
            const isWknd = day.status === 'weekend' || day.status === 'upcoming';

            return (
              <div
                key={day.date}
                title={hName || (day.note ? `${cfg.label} · ${day.note}` : cfg.label)}
                className={`relative border rounded-xl p-1 min-h-[54px] flex flex-col items-center justify-start gap-0.5 ${cfg.bg} ${cfg.border} group cursor-default`}
              >
                <span className={`text-[11px] font-bold ${cfg.text}`}>{dayNum}</span>
                {!isWknd && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
                {day.deducted_amount > 0 && (
                  <span className="text-[8px] font-black text-red-500 leading-none">-₹{fmtFull(day.deducted_amount)}</span>
                )}
                {day.note && !isWknd && (
                  <span className={`text-[7px] font-semibold ${cfg.text} opacity-75 truncate w-full text-center px-0.5 leading-tight`}>{day.note}</span>
                )}
                {day.is_late && (
                  <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-400" title="Late arrival" />
                )}
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                  <div className="bg-slate-900 text-white text-[9px] font-bold px-2 py-1 rounded-lg whitespace-nowrap shadow-xl">
                    {cfg.label}{day.note ? ` · ${day.note}` : ''}
                    {day.check_in ? ` · In: ${new Date(day.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                  <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const router = useRouter();
  const now    = new Date();

  const [user,       setUser]       = useState<UserProfile | null>(null);
  const [payroll,    setPayroll]    = useState<MyPayroll | null>(null);
  const [holidays,   setHolidays]   = useState<Holiday[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [viewMonth,  setViewMonth]  = useState(now.getMonth());
  const [viewYear,   setViewYear]   = useState(now.getFullYear());

  const todayKey = now.toISOString().split('T')[0];

  useEffect(() => {
    if (checkSessionExpiry()) return;
    if (!localStorage.getItem('cashier_session')) { router.replace('/login'); return; }
    setLoading(true);
    getProfile()
      .then(async (profile) => {
        setUser(profile);
        const [pr, hols] = await Promise.all([
          getMyPayroll(viewMonth, viewYear),
          getHolidays(viewYear),
        ]);
        setPayroll(pr);
        setHolidays(hols);
      })
      .catch(() => { localStorage.removeItem('cashier_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [viewMonth, viewYear, router]);

  function navMonth(dir: 1 | -1) {
    let m = viewMonth + dir, y = viewYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setViewMonth(m); setViewYear(y);
  }
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  // Holiday map for the viewed month
  const holidayMap: Record<string, string> = {};
  holidays.forEach(h => {
    const key = normalizeHoliday(h, viewYear);
    if (key) holidayMap[key] = h.name;
  });

  // Today's record from calendar
  const todayEntry = payroll?.calendar.find(d => d.date === todayKey);

  // Upcoming holidays (next 4 from today)
  const upcomingHolidays = holidays
    .map(h => {
      const k = normalizeHoliday(h, now.getFullYear()) ?? normalizeHoliday(h, now.getFullYear() + 1);
      return k ? { ...h, fullKey: k } : null;
    })
    .filter((h): h is Holiday & { fullKey: string } => !!h && h.fullKey >= todayKey)
    .sort((a, b) => a.fullKey.localeCompare(b.fullKey))
    .slice(0, 4);

  // Attendance rate
  const s = payroll?.summary;
  const totalTracked = s ? s.present + s.absent + s.half_day + s.on_leave : 0;
  const rate = totalTracked > 0 ? Math.round(((s!.present + s!.half_day * 0.5) / totalTracked) * 100) : 0;

  if (loading) return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${BRAND}20`, borderTopColor: BRAND }} />
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 min-h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">My Payroll & Attendance</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">{MONTH_NAMES[viewMonth]} {viewYear}</p>
        </div>
        {user && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background: BRAND }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-black text-slate-900 leading-none">{user.name}</p>
              <p className="text-[10px] text-slate-400 capitalize mt-0.5">{user.role}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Month navigation ── */}
      <div className="flex items-center gap-2">
        <button onClick={() => navMonth(-1)} className="p-2 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-black text-slate-900">{MONTH_NAMES[viewMonth]} {viewYear}</p>
        </div>
        <button onClick={() => navMonth(1)} disabled={isCurrentMonth} className="p-2 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors disabled:opacity-30 disabled:pointer-events-none">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {payroll && (
        <>
          {/* ── Salary card ── */}
          <div className="rounded-2xl overflow-hidden border border-slate-100 bg-white shadow-sm">
            <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ background: `linear-gradient(135deg, ${BRAND}08, ${BRAND}03)` }}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Net Payable · {MONTH_NAMES[viewMonth]}</p>
                <p className="text-3xl font-black text-slate-900">₹{fmtFull(payroll.net_payable)}</p>
                {(payroll.deductions > 0 || payroll.incentives > 0) && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    ₹{fmtFull(payroll.base_salary)}
                    {payroll.deductions > 0 && <span className="text-red-500"> − ₹{fmtFull(payroll.deductions)}</span>}
                    {payroll.incentives > 0 && <span className="text-emerald-600"> + ₹{fmtFull(payroll.incentives)}</span>}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:min-w-[200px]">
                <div className="bg-white/70 border border-slate-100 rounded-xl p-3 text-center">
                  <p className="text-base font-black text-slate-800">₹{fmtFull(payroll.base_salary)}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Base Salary</p>
                </div>
                <div className="bg-white/70 border border-slate-100 rounded-xl p-3 text-center">
                  <p className="text-base font-black text-slate-800">{payroll.total_working_days}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Working Days</p>
                </div>
              </div>
            </div>

            {/* Payroll utilisation bar */}
            {payroll.base_salary > 0 && (
              <div className="px-6 py-4 border-t border-slate-50">
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Salary Utilisation</p>
                  <p className="text-[10px] font-bold text-slate-500">
                    {Math.min(100, Math.round((payroll.net_payable / payroll.base_salary) * 100))}% of base
                  </p>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, Math.round((payroll.net_payable / payroll.base_salary) * 100))}%`,
                      background: BRAND,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Attendance stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Present',      value: s!.present,   color: 'text-emerald-700', bar: 'bg-emerald-500', bg: 'bg-emerald-50/60',  border: 'border-emerald-100' },
              { label: 'Absent',       value: s!.absent,    color: 'text-red-600',     bar: 'bg-red-500',     bg: 'bg-red-50/60',      border: 'border-red-100'     },
              { label: 'Half Day',     value: s!.half_day,  color: 'text-amber-700',   bar: 'bg-amber-500',   bg: 'bg-amber-50/60',    border: 'border-amber-100'   },
              { label: 'Paid Time Off',value: s!.on_leave,  color: 'text-blue-700',    bar: 'bg-blue-500',    bg: 'bg-blue-50/60',     border: 'border-blue-100'    },
            ].map(c => {
              const pct = totalTracked > 0 ? Math.round((c.value / totalTracked) * 100) : 0;
              return (
                <div key={c.label} className={`rounded-2xl border p-4 ${c.bg} ${c.border}`}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{c.label}</p>
                  <p className={`text-3xl font-black ${c.color} mb-3`}>{c.value}</p>
                  <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">{pct}% of days</p>
                </div>
              );
            })}
          </div>

          {/* ── Attendance rate bar ── */}
          {totalTracked > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Attendance Rate · {MONTH_NAMES[viewMonth]}</p>
                <p className={`text-sm font-black ${rate >= 90 ? 'text-emerald-700' : rate >= 75 ? 'text-amber-700' : 'text-red-600'}`}>{rate}%</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${rate >= 90 ? 'bg-emerald-500' : rate >= 75 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${rate}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Incentives ── */}
          {payroll.incentive_list.length > 0 && (
            <div className="bg-white border border-emerald-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2.5 px-5 py-4 bg-emerald-50/50 border-b border-emerald-100">
                <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4H5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-emerald-900">Incentives This Month</p>
                  <p className="text-[10px] text-emerald-600 font-semibold">+₹{fmtFull(payroll.incentives)} added to your salary</p>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {payroll.incentive_list.map(inc => (
                  <div key={inc._id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      {inc.reason && <p className="text-xs font-semibold text-slate-700">{inc.reason}</p>}
                      {inc.granted_by && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          From {typeof inc.granted_by === 'object' ? inc.granted_by.name : 'Admin'}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-black text-emerald-700">+₹{fmtFull(inc.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Calendar ── */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-black text-slate-900">Attendance Calendar</p>
              <p className="text-[10px] text-slate-400">{MONTH_NAMES[viewMonth]} {viewYear}</p>
            </div>
            <div className="p-4">
              <AttendanceCalendar calendar={payroll.calendar} holidayMap={holidayMap} />
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 px-5 py-3.5 border-t border-slate-50 bg-slate-50/30">
              {Object.entries(DAY_CFG)
                .filter(([k]) => !['upcoming','weekend'].includes(k))
                .map(([, v]) => (
                  <div key={v.label} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                    <span className={`text-[10px] font-semibold ${v.text}`}>{v.label}</span>
                  </div>
                ))}
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 ring-1 ring-orange-200" />
                <span className="text-[10px] font-semibold text-orange-600">Late</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Today's check-in / check-out ── */}
      {todayEntry && (todayEntry.check_in || todayEntry.check_out) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: BRAND }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: BRAND }}>Check-In</p>
              <p className="text-lg font-black text-slate-900">
                {todayEntry.check_in ? new Date(todayEntry.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
              {todayEntry.is_late && <p className="text-[9px] font-bold text-orange-500 mt-0.5">Late arrival</p>}
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-slate-500" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Check-Out</p>
              <p className="text-lg font-black text-slate-900">
                {todayEntry.check_out ? new Date(todayEntry.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Not yet'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Today's status banner ── */}
      {todayEntry && todayEntry.status !== 'upcoming' && (() => {
        const cfg = DAY_CFG[todayEntry.status];
        return (
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl border ${cfg.bg} ${cfg.border}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            <p className={`text-sm font-black ${cfg.text}`}>
              Today: <span className="font-black">{cfg.label}</span>
              {todayEntry.deducted_amount > 0 && <span className="text-red-500 font-semibold"> · -₹{fmtFull(todayEntry.deducted_amount)} deducted</span>}
            </p>
          </div>
        );
      })()}

      {/* ── Upcoming holidays ── */}
      {upcomingHolidays.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-50 border border-violet-100 rounded-xl flex items-center justify-center">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-violet-600">
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
              const daysLeft = Math.ceil((new Date(h.fullKey + 'T00:00:00').getTime() - now.getTime()) / 86400000);
              const dateStr  = new Date(h.fullKey + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
              return (
                <div key={h._id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">{h.name}</p>
                      <p className="text-[10px] text-violet-600 font-semibold mt-0.5">{dateStr}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${daysLeft === 0 ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`}>
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
