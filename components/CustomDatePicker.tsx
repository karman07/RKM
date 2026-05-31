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
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Parse current value or default to today
  const selectedDate = value ? new Date(value + 'T00:00:00') : null;
  const [viewDate, setViewDate] = useState(selectedDate || new Date());

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  
  const handleDateClick = (day: number) => {
    const y = viewDate.getFullYear();
    const m = String(viewDate.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setIsOpen(false);
  };

  const navMonth = (dir: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + dir, 1));
  };

  const isToday = (day: number) => {
    const d = new Date();
    return d.getDate() === day && d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear();
  };

  const isSelected = (day: number) => {
    return selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === viewDate.getMonth() && selectedDate.getFullYear() === viewDate.getFullYear();
  };

  const isDisabled = (day: number) => {
    if (!min) return false;
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return d < new Date(min);
  };

  const formattedValue = selectedDate 
    ? selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  return (
    <div className="group relative" ref={containerRef}>
      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2.5 ml-1 transition-colors group-focus-within:text-[#7A1C2A]">
        {label}
      </label>
      
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex items-center cursor-pointer transition-all ${isOpen ? 'z-50' : 'z-0'}`}
      >
        <div className={`absolute left-5 text-slate-400 transition-colors ${isOpen ? 'text-[#7A1C2A]' : 'group-hover:text-slate-600'}`}>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className={`w-full pl-14 pr-5 py-4 bg-white border rounded-[1.25rem] text-sm font-bold shadow-sm transition-all flex items-center justify-between hover:shadow-md ${
          isOpen ? 'border-[#7A1C2A] ring-4 ring-[#7A1C2A]/5' : 'border-slate-200'
        }`}>
          <span className={formattedValue ? 'text-slate-900' : 'text-slate-300'}>
            {formattedValue || placeholder || 'Select date'}
          </span>
          <svg width="14" height="14" className={`text-slate-300 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-3 w-72 bg-white border border-slate-100 rounded-[2rem] shadow-2xl z-[100] overflow-hidden p-5 animate-in fade-in zoom-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navMonth(-1)} className="p-2 rounded-xl hover:bg-slate-50 transition-colors text-slate-400 hover:text-[#7A1C2A]">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-sm font-black text-slate-900">{monthName}</span>
            <button onClick={() => navMonth(1)} className="p-2 rounded-xl hover:bg-slate-50 transition-colors text-slate-400 hover:text-[#7A1C2A]">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-1">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} className="text-center text-[10px] font-black text-slate-300 uppercase py-2">{d}</div>
            ))}
            {Array.from({ length: firstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth()) }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: daysInMonth(viewDate.getFullYear(), viewDate.getMonth()) }).map((_, i) => {
              const day = i + 1;
              const disabled = isDisabled(day);
              const selected = isSelected(day);
              const today = isToday(day);
              
              return (
                <button
                  key={day}
                  disabled={disabled}
                  onClick={() => handleDateClick(day)}
                  className={`aspect-square flex items-center justify-center rounded-xl text-[11px] font-bold transition-all ${
                    selected ? 'bg-[#7A1C2A] text-white shadow-lg' :
                    today ? 'text-[#7A1C2A] bg-[#7A1C2A]/5' :
                    disabled ? 'text-slate-100 cursor-not-allowed' :
                    'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between">
            <button 
              onClick={() => { onChange(''); setIsOpen(false); }}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors"
            >
              Clear
            </button>
            <button 
              onClick={() => {
                const today = new Date();
                const y = today.getFullYear();
                const m = String(today.getMonth() + 1).padStart(2, '0');
                const d = String(today.getDate()).padStart(2, '0');
                onChange(`${y}-${m}-${d}`);
                setIsOpen(false);
              }}
              className="text-[10px] font-black text-[#7A1C2A] uppercase tracking-widest hover:opacity-80 transition-opacity"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
