'use client';
import { useState, useEffect } from 'react';
import { updateSettings, getLookups, type Lookup } from '@/lib/api';
import { useSettings } from '@/components/SettingsContext';

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
  const [toast, setToast] = useState('');
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
    // Use metal_type from lookup if available
    if (purity.metal_type) return purity.metal_type;
    // Fallback to inferring from known defaults, but never force to gold.
    for (const [metal, purities] of Object.entries(DEFAULT_METAL_PURITY_GROUPS)) {
      if (purities.includes(purity.value)) return metal;
    }
    return '';
  }

  // Populate form when settings load or change
  useEffect(() => {
    if (loading || lookupsLoading) return;
    
    const mr: Record<string, string> = {};
    metalConfig.forEach(({ key }) => {
      mr[key] = settings.metal_rates?.[key] ? String(settings.metal_rates[key]) : '';
    });

    // Build purity rates from fetched purity lookups
    const pr: Record<string, Record<string, string>> = {};
    metalConfig.forEach(({ key: metal }) => {
      pr[metal] = {};
    });
    
    // Group purity lookups by metal
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const numericMetal: Record<string, number> = {};
      metalConfig.forEach(({ key }) => { numericMetal[key] = Number(metalRates[key]) || 0; });

      // Convert nested purity_rates back to numeric format
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
      showToast('Settings saved — all pricing across the app has been updated.');
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
    <div className="max-w-4xl">
      {toast && (
        <div className="app-toast">{toast}</div>
      )}

      <div className="mb-7">
        <h1 className="text-2xl font-bold text-slate-900">Pricing Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          All rates set here are automatically applied across the app — products, inventory, and pricing breakdowns.
        </p>
        {settings.updatedAt && (
          <p className="text-xs text-slate-400 mt-1">
            Last updated: {new Date(settings.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      <div className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* ── Metal Rates ── */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-amber-600">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Metal Rates</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Base rate per gram for each metal (fallback when purity-specific rates not set). <strong>Metal Price = Net Weight x Rate</strong>.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {metalConfig.map(({ key, label, unit }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {label}
                  <span className="ml-1 text-xs text-slate-400 font-normal">{unit}</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm pointer-events-none">₹</span>
                  <input
                    type="number" min={0} step={0.01}
                    className="w-full pl-6 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                    value={metalRates[key] ?? ''}
                    onChange={(e) => setMetalRates((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
                {(settings.metal_rates?.[key] ?? 0) > 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    Stored: <strong className="text-slate-600">₹{settings.metal_rates[key].toLocaleString('en-IN')}</strong>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Metal-Specific Purity Rates ── */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-orange-600">
                <path d="M3 12h18" />
                <path d="M12 3v18" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Purity Rates</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Metal-specific purity pricing (from lookups). When set, these take priority over the base metal rate. Delete rates using the × button.
              </p>
            </div>
          </div>

          {lookupsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {unmappedPurities.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {unmappedPurities.length} purity lookup(s) are missing metal mapping. Edit them in Lookups {'->'} Purity and select Metal Type.
                </div>
              )}
              {metalConfig.map(({ key: metalKey, label: metalLabel }) => {
                const metalPurities = purityLookups.filter((p) => getMetalFromLookup(p) === metalKey);
                if (metalPurities.length === 0) return null;
                
                return (
                  <div key={metalKey} className="border border-slate-100 rounded-xl p-5 bg-slate-50/30">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4">{metalLabel} Purities</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {metalPurities.map((purity: Lookup) => (
                        <div key={purity.value}>
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <div>
                              <label className="block text-sm font-medium text-slate-700">
                                {purity.label}
                                <span className="ml-1 text-xs text-slate-400 font-normal">₹ / gram</span>
                              </label>
                              {purity.description && (
                                <p className="text-xs text-slate-500 mt-0.5">{purity.description}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setPurityRates((prev) => ({
                                  ...prev,
                                  [metalKey]: {
                                    ...(prev[metalKey] ?? {}),
                                    [purity.value]: '',
                                  },
                                }));
                              }}
                              className="text-xs px-1.5 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                              title="Clear rate"
                            >
                              ×
                            </button>
                          </div>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm pointer-events-none">₹</span>
                            <input
                              type="number" min={0} step={0.01}
                              className="w-full pl-6 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0.00"
                              value={purityRates[metalKey]?.[purity.value] ?? ''}
                              onChange={(e) =>
                                setPurityRates((prev) => ({
                                  ...prev,
                                  [metalKey]: { ...prev[metalKey], [purity.value]: e.target.value },
                                }))
                              }
                            />
                          </div>
                          {(settings.purity_rates?.[metalKey]?.[purity.value] ?? 0) > 0 && (
                            <p className="text-xs text-slate-400 mt-1">
                              Stored: <strong className="text-slate-600">₹{settings.purity_rates[metalKey][purity.value].toLocaleString('en-IN')}</strong>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Stone / Gem Rates ── */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-violet-600">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Stone &amp; Gem Rates</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Rate per carat/piece for each stone. <strong>Stone Price = Stone Weight x Rate</strong>.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {STONE_CONFIG.map(({ key, label, unit }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {label}
                  <span className="ml-1 text-xs text-slate-400 font-normal">{unit}</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm pointer-events-none">₹</span>
                  <input
                    type="number" min={0} step={0.01}
                    className="w-full pl-6 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                    value={stoneRates[key] ?? ''}
                    onChange={(e) => setStoneRates((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
                {(settings.stone_rates?.[key] ?? 0) > 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    Stored: <strong className="text-slate-600">₹{settings.stone_rates[key].toLocaleString('en-IN')}</strong>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Making Charges */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-blue-600">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Default Making Charges</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pre-filled automatically when adding a new product. Can be overridden per product.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Charge Type</label>
            <div className="flex gap-3">
              {(['per_gram', 'fixed'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setChargeType(type)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    chargeType === type
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {type === 'per_gram' ? 'Per Gram' : 'Fixed Amount'}
                </button>
              ))}
            </div>
          </div>

          {chargeType === 'per_gram' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rate per gram (₹)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm pointer-events-none">₹</span>
                <input
                  type="number" min={0} step={0.01}
                  className="w-full pl-6 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 150"
                  value={chargeRate}
                  onChange={(e) => setChargeRate(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fixed amount (₹)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm pointer-events-none">₹</span>
                <input
                  type="number" min={0} step={0.01}
                  className="w-full pl-6 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 2000"
                  value={fixedCharge}
                  onChange={(e) => setFixedCharge(e.target.value)}
                />
              </div>
            </div>
          )}
        </section>

        {/* Note */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Note</h2>
            <p className="text-xs text-slate-500 mt-0.5">Optional internal note about this rate update.</p>
          </div>
          <input
            type="text"
            maxLength={200}
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Updated for festival season"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </section>

        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              'Save All Settings'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
