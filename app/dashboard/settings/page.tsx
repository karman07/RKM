'use client';
import { useState, useEffect } from 'react';
import { updateSettings, syncAllInventoryPrices, getLookups, type Lookup } from '@/lib/api';
import { useSettings } from '@/components/SettingsContext';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';

// ─── Static metadata for each pricing category ────────────────────────────────

const DEFAULT_METAL_CONFIG = [
  { key: 'gold',     label: 'Gold',     unit: '₹ / gram'  },
  { key: 'silver',   label: 'Silver',   unit: '₹ / gram'  },
  { key: 'platinum', label: 'Platinum', unit: '₹ / gram'  },
];

// ─── Default purity groupings (will be overridden by fetched lookups) ──────────
const DEFAULT_METAL_PURITY_GROUPS: Record<string, string[]> = {
  gold: ['18K', '22K', '24K'],
  silver: ['925', '950', '999'],
  platinum: ['850', '900', '950'],
};

const STONE_CONFIG = [
  { key: 'diamond',  label: 'Diamond',  unit: '₹ / carat' },
  { key: 'ruby',     label: 'Ruby',     unit: '₹ / carat' },
  { key: 'emerald',  label: 'Emerald',  unit: '₹ / carat' },
  { key: 'sapphire', label: 'Sapphire', unit: '₹ / carat' },
  { key: 'pearl',    label: 'Pearl',    unit: '₹ / piece' },
  { key: 'coral',    label: 'Coral',    unit: '₹ / carat' },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, loading, reload } = useSettings();
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];

  const [metalConfig, setMetalConfig] = useState<Array<{ key: string; label: string; unit: string }>>(DEFAULT_METAL_CONFIG);
  const [metalRates, setMetalRates] = useState<Record<string, string>>({});
  const [purityRates, setPurityRates] = useState<Record<string, Record<string, string>>>({});
  const [stoneRates, setStoneRates] = useState<Record<string, string>>({});
  const [purityLookups, setPurityLookups] = useState<Lookup[]>([]);
  const [chargeType, setChargeType] = useState('per_gram');
  const [chargeRate, setChargeRate] = useState('');
  const [fixedCharge, setFixedCharge] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' | 'info' } | null>(null);
  const [error, setError] = useState('');
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [unmappedPurities, setUnmappedPurities] = useState<Lookup[]>([]);

  // Fetch purity lookups from database
  useEffect(() => {
    getLookups()
      .then((lookupData) => {
        const metals = (lookupData.metal_type ?? [])
          .filter((m: Lookup) => m.is_active)
          .sort((a: Lookup, b: Lookup) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
          .map((m: Lookup) => ({ key: m.value, label: m.label, unit: '₹ / gram' }));

        const purities = lookupData.purity?.filter((p: Lookup) => p.is_active) ?? [];
        if (metals.length > 0) {
          setMetalConfig(metals);
        }
        setPurityLookups(purities);
      })
      .catch(() => {})
      .finally(() => setLookupsLoading(false));
  }, []);

  // Helper to get metal from purity lookup
  function getMetalFromLookup(purity: Lookup): string {
    if (purity.metal_type) return purity.metal_type;
    for (const [metal, purities] of Object.entries(DEFAULT_METAL_PURITY_GROUPS)) {
      if (purities.includes(purity.value)) return metal;
    }
    return '';
  }

  // Populate form
  useEffect(() => {
    if (loading || lookupsLoading) return;
    
    const mr: Record<string, string> = {};
    metalConfig.forEach(({ key }) => {
      mr[key] = settings.metal_rates?.[key] ? String(settings.metal_rates[key]) : '';
    });

    const pr: Record<string, Record<string, string>> = {};
    metalConfig.forEach(({ key: metal }) => { pr[metal] = {}; });
    
    purityLookups.forEach((purity: Lookup) => {
      const metal = getMetalFromLookup(purity);
      if (metal && pr[metal]) {
        const rate = settings.purity_rates?.[metal]?.[purity.value];
        pr[metal][purity.value] = rate ? String(rate) : '';
      }
    });

    setUnmappedPurities(purityLookups.filter((purity) => !getMetalFromLookup(purity)));

    const sr: Record<string, string> = {};
    STONE_CONFIG.forEach(({ key }) => {
      sr[key] = settings.stone_rates?.[key] ? String(settings.stone_rates[key]) : '';
    });

    setMetalRates(mr);
    setPurityRates(pr);
    setStoneRates(sr);
    setChargeType(settings.making_charge_type ?? 'per_gram');
    setChargeRate(settings.making_charge_rate ? String(settings.making_charge_rate) : '');
    setFixedCharge(settings.fixed_making_charge ? String(settings.fixed_making_charge) : '');
    setNote(settings.note ?? '');
  }, [loading, lookupsLoading, settings, purityLookups, metalConfig]);

  function showToast(message: string, type: 'success' | 'danger' | 'info' = 'info') {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const numericMetal: Record<string, number> = {};
      metalConfig.forEach(({ key }) => { numericMetal[key] = Number(metalRates[key]) || 0; });

      const numericPurity: Record<string, Record<string, number>> = {};
      Object.keys(purityRates).forEach((metal) => {
        numericPurity[metal] = {};
        Object.keys(purityRates[metal]).forEach((purity) => {
          numericPurity[metal][purity] = Number(purityRates[metal][purity]) || 0;
        });
      });

      const numericStone: Record<string, number> = {};
      STONE_CONFIG.forEach(({ key }) => { numericStone[key] = Number(stoneRates[key]) || 0; });

      await updateSettings({
        metal_rates: numericMetal,
        purity_rates: numericPurity,
        stone_rates: numericStone,
        making_charge_type: chargeType,
        making_charge_rate: Number(chargeRate) || 0,
        fixed_making_charge: Number(fixedCharge) || 0,
        note: note.trim(),
      });
      await reload();
      showToast('Rates saved. Syncing inventory prices…', 'info');

      // Sync inventory prices in the background — show result
      try {
        const syncResult = await syncAllInventoryPrices();
        showToast(
          `✓ Rates applied. ${syncResult.updated} inventory item${syncResult.updated === 1 ? '' : 's'} repriced.`,
          'success',
        );
      } catch {
        // Backend sync already runs server-side; this is just a UI notification
        showToast('Settings saved. Inventory will reprice on next load.', 'success');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8 animate-[fadeRise_400ms_ease-out]">
      {toast && (
        <div className={`app-toast app-toast-${toast.type}`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="app-toast-close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <div className="mb-7">
        <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Pricing Control</h1>
        <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
          Centralized management for all metal and stone valuation across the RKM ecosystem.
        </p>
      </div>

      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* ── Metal Rates ── */}
        <section 
          className="border rounded-2xl p-6 space-y-6 shadow-sm shadow-slate-100/50"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0 shadow-sm border border-amber-100/50 transition-transform hover:scale-105 duration-300">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-amber-600">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: colors.textMain }}>Global Metal Rates</h2>
              <p className="text-xs mt-1 leading-relaxed opacity-70" style={{ color: colors.textMuted }}>Baseline gram rates used for global valuation.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {metalConfig.map(({ key, label, unit }) => (
              <div key={key}>
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: theme === 'light' ? '#64748b' : colors.textHeader }}>{label} <span className="opacity-50">{unit}</span></label>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-4 flex items-center text-sm font-bold opacity-30" style={{ color: colors.textMain }}>₹</span>
                  <input
                    type="number" min={0} step={0.01}
                    className="w-full pl-8 pr-4 py-3 border rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/5"
                    style={{ backgroundColor: theme === 'light' ? '#fff' : '#162846', borderColor: colors.border, color: colors.textMain }}
                    placeholder="0.00"
                    value={metalRates[key] ?? ''}
                    onChange={(e) => setMetalRates((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
                {(settings.metal_rates?.[key] ?? 0) > 0 && (
                  <p className="text-[10px] font-bold uppercase tracking-tight mt-3" style={{ color: theme === 'light' ? '#94a3b8' : colors.textMuted }}>
                    Live Market: ₹{settings.metal_rates[key].toLocaleString('en-IN')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Purity Rates ── */}
        <section 
          className="border rounded-2xl p-6 space-y-6 shadow-sm shadow-slate-100/50"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center shrink-0 shadow-sm border border-orange-100/50 transition-transform hover:scale-105 duration-300">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-orange-600">
                <circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: colors.textMain }}>Purity Precision Rates</h2>
              <p className="text-xs mt-1 leading-relaxed opacity-70" style={{ color: colors.textMuted }}>Karat-specific pricing overrides.</p>
            </div>
          </div>

          <div className="space-y-6">
            {unmappedPurities.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/20 px-4 py-3 text-xs font-semibold text-amber-700 leading-relaxed">
                {unmappedPurities.length} Purities require metal association.
              </div>
            )}
            {metalConfig.map(({ key: metalKey, label: metalLabel }) => {
              const metalPurities = purityLookups.filter((p) => getMetalFromLookup(p) === metalKey);
              if (metalPurities.length === 0) return null;
              
              return (
                <div key={metalKey} className="border rounded-2xl p-6" style={{ backgroundColor: theme === 'light' ? '#fcfdfe' : '#0c1626', borderColor: colors.border }}>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-6 opacity-40" style={{ color: colors.textMain }}>{metalLabel} Catalog</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {metalPurities.map((purity: Lookup) => (
                      <div key={purity.value} className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[12px] font-bold" style={{ color: colors.textMain }}>{purity.label}</label>
                          <button
                            type="button"
                            onClick={() => setPurityRates((p) => ({ ...p, [metalKey]: { ...p[metalKey], [purity.value]: '' } }))}
                            className="w-5 h-5 flex items-center justify-center rounded-lg bg-red-50 text-red-600 border border-red-100 text-[10px] font-bold transition-all hover:bg-red-100"
                          >
                            ×
                          </button>
                        </div>
                        <div className="relative group">
                          <span className="absolute inset-y-0 left-4 flex items-center text-sm font-bold opacity-30" style={{ color: colors.textMain }}>₹</span>
                          <input
                            type="number" min={0} step={0.01}
                            className="w-full pl-8 pr-4 py-3 border rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/5"
                            style={{ backgroundColor: theme === 'light' ? '#fff' : '#111e33', borderColor: colors.border, color: colors.textMain }}
                            placeholder="0.00"
                            value={purityRates[metalKey]?.[purity.value] ?? ''}
                            onChange={(e) => setPurityRates(p => ({ ...p, [metalKey]: { ...p[metalKey], [purity.value]: e.target.value } }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Stone Rates ── */}
        <section 
          className="border rounded-2xl p-6 space-y-6 shadow-sm shadow-slate-100/50"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center shrink-0 shadow-sm border border-violet-100/50 transition-transform hover:scale-105 duration-300">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-violet-600">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: colors.textMain }}>Gemstone Valuation</h2>
              <p className="text-xs mt-1 leading-relaxed opacity-70" style={{ color: colors.textMuted }}>Market rates for precious stones.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {STONE_CONFIG.map(({ key, label, unit }) => (
              <div key={key}>
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: theme === 'light' ? '#64748b' : colors.textHeader }}>{label} <span className="opacity-50">{unit}</span></label>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-4 flex items-center text-sm font-bold opacity-30" style={{ color: colors.textMain }}>₹</span>
                  <input
                    type="number" min={0} step={0.01}
                    className="w-full pl-8 pr-4 py-3 border rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/5"
                    style={{ backgroundColor: theme === 'light' ? '#fff' : '#162846', borderColor: colors.border, color: colors.textMain }}
                    placeholder="0.00"
                    value={stoneRates[key] ?? ''}
                    onChange={(e) => setStoneRates(p => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Making Charge */}
        <section 
          className="border rounded-2xl p-6 space-y-6 shadow-sm"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0 shadow-sm border border-blue-100/50 transition-transform hover:scale-105 duration-300">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-blue-600">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: colors.textMain }}>Standard Fabrication Fees</h2>
              <p className="text-xs mt-1" style={{ color: colors.textMuted }}>Draft rates pre-populated for new catalog entries. Highly customizable per piece.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[13px] font-bold" style={{ color: colors.textMain }}>Structure</label>
              <div className="flex gap-2">
                {(['per_gram', 'fixed'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setChargeType(type)}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-tight transition-all border ${
                      chargeType === type
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-transparent border-slate-200 dark:border-slate-800'
                    }`}
                    style={{ color: chargeType === type ? '#fff' : colors.textMain }}
                  >
                    {type === 'per_gram' ? 'Per Gram' : 'Fixed'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[13px] font-bold" style={{ color: colors.textMain }}>Amount (₹)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-4 flex items-center text-sm font-bold opacity-30" style={{ color: colors.textMain }}>₹</span>
                <input
                  type="number" min={0} step={0.01}
                  className="w-full pl-8 pr-4 py-3 border rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  style={{ backgroundColor: theme === 'light' ? '#f8fafc' : '#162846', borderColor: colors.border, color: colors.textMain }}
                  value={chargeType === 'per_gram' ? chargeRate : fixedCharge}
                  onChange={(e) => chargeType === 'per_gram' ? setChargeRate(e.target.value) : setFixedCharge(e.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end items-center gap-4 pt-4">
          {saving && <span className="text-xs font-bold animate-pulse" style={{ color: colors.activeText }}>Processing Synchronization...</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-8 py-3.5 rounded-2xl transition-all shadow-xl shadow-blue-600/20"
          >
            Update Ecosystem
          </button>
        </div>
      </div>
    </div>
  );
}
