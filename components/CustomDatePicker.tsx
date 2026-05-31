'use client';
import { useState, useRef, useEffect } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (val: string) => void;
  min?: string;
  placeholder?: string;
}

export default function CustomDatePicker({ label, value, onChange, min, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const now = new Date();
  const [viewYear, setViewYear] = useState(value ? new Date(value).getFullYear() : now.getFullYear());
  const [viewMonth, setViewMonth] = useState(value ? new Date(value).getMonth() : now.getMonth());

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  function navMonth(dir: 1 | -1) {
    let m = viewMonth + dir, y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m); setViewYear(y);
  }

  function selectDay(day: number) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(dateStr);
    setOpen(false);
  }

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div ref={ref} className="relative">
      <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 focus:outline-none focus:border-[#7A1C2A] transition-all text-left flex items-center justify-between"
      >
        <span className={displayValue ? 'text-slate-900' : 'text-slate-300'}>{displayValue || placeholder || 'Select date'}</span>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-slate-400 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-2 left-0 right-0 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4 min-w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => navMonth(-1)} className="p-1.5 rounded-xl hover:bg-slate-50 text-slate-400 transition-colors">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <p className="text-sm font-black text-slate-900">{monthName}</p>
            <button type="button" onClick={() => navMonth(1)} className="p-1.5 rounded-xl hover:bg-slate-50 text-slate-400 transition-colors">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="py-1 text-center text-[10px] font-black text-slate-300 uppercase">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: totalDays }).map((_, idx) => {
              const day = idx + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = dateStr === value;
              const isDisabled = min ? dateStr < min : false;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => selectDay(day)}
                  className={`aspect-square flex items-center justify-center rounded-xl text-xs font-bold transition-all ${
                    isSelected ? 'bg-[#5A0F1A] text-white' :
                    isDisabled ? 'text-slate-200 cursor-not-allowed' :
                    'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
