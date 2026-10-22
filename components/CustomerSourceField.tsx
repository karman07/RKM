'use client';
import { useEffect, useState } from 'react';
import { getCustomerSourceEmployees, type SourceEmployee } from '../lib/api';

export type CustomerSource = '' | 'field' | 'walk_in';

const OPTIONS: { value: 'field' | 'walk_in'; label: string }[] = [
  { value: 'field', label: 'Field' },
  { value: 'walk_in', label: 'Walk-in' },
];

/**
 * "Customer source" picker for the add-customer forms: Field (came through an employee's contact — pick which
 * employee) or Walk-in. The employee list is only fetched once Field is chosen.
 */
export default function CustomerSourceField({ source, employeeId, onChange, accent }: {
  source: CustomerSource;
  employeeId: string;
  onChange: (source: CustomerSource, employeeId: string) => void;
  accent: string;
}) {
  const [employees, setEmployees] = useState<SourceEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (source !== 'field' || employees.length > 0) return;
    setLoading(true); setLoadError('');
    getCustomerSourceEmployees()
      .then(r => setEmployees(r.data))
      .catch((e: any) => setLoadError(e?.message || 'Could not load employees'))
      .finally(() => setLoading(false));
  }, [source, employees.length]);

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Customer Source *</label>
        <div className="flex gap-2">
          {OPTIONS.map(o => (
            <button key={o.value} type="button" onClick={() => onChange(o.value, o.value === 'walk_in' ? '' : employeeId)}
              className="flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
              style={source === o.value ? { background: accent, color: 'white', borderColor: accent } : { background: 'white', color: '#64748b', borderColor: '#e2e8f0' }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {source === 'field' && (
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">From whose contact? *</label>
          <select value={employeeId} onChange={e => onChange('field', e.target.value)} disabled={loading}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500">
            <option value="">{loading ? 'Loading employees…' : 'Select employee'}</option>
            {employees.map(emp => <option key={emp._id} value={emp._id}>{emp.name} ({emp.role})</option>)}
          </select>
          {loadError && <p className="text-[11px] text-red-600 font-semibold mt-1">{loadError}</p>}
        </div>
      )}
    </div>
  );
}
