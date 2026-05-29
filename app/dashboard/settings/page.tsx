'use client';
import { useState, useEffect } from 'react';
import { updateSettings, syncAllInventoryPrices, getLookups, type Lookup, API_BASE } from '@/lib/api';
import { useSettings } from '@/components/SettingsContext';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import { MessageCircle, Mail, Bell, AlertCircle } from 'lucide-react';

// ─── Static metadata for each pricing category ────────────────────────────────

const DEFAULT_METAL_CONFIG = [
  { key: 'gold', label: 'Gold', unit: '₹ / gram' },
  { key: 'silver', label: 'Silver', unit: '₹ / gram' },
  { key: 'platinum', label: 'Platinum', unit: '₹ / gram' },
];

interface DeliveryZone { min_km: number; max_km: number; charge: number; label?: string; }
interface DeliverySettings {
  store_latitude: number;
  store_longitude: number;
  store_address: string;
  free_delivery_above: number;
  zones: DeliveryZone[];
  max_delivery_radius_km: number;
  is_delivery_enabled: boolean;
}

const DEFAULT_DELIVERY: DeliverySettings = {
  store_latitude: 30.7046, store_longitude: 76.7179, store_address: '',
  free_delivery_above: 5000, zones: [
    { min_km: 0, max_km: 5, charge: 0, label: 'Local (Free)' },
    { min_km: 5, max_km: 15, charge: 99, label: 'City' },
    { min_km: 15, max_km: 30, charge: 199, label: 'Extended' },
    { min_km: 30, max_km: 100, charge: 399, label: 'Regional' },
  ],
  max_delivery_radius_km: 100,
  is_delivery_enabled: true,
};

// ─── Default purity groupings (will be overridden by fetched lookups) ──────────
const DEFAULT_METAL_PURITY_GROUPS: Record<string, string[]> = {
  gold: ['18K', '22K', '24K'],
  silver: ['925', '950', '999'],
  platinum: ['850', '900', '950'],
};

const STONE_CONFIG = [
  { key: 'diamond', label: 'Diamond', unit: '₹ / carat' },
  { key: 'ruby', label: 'Ruby', unit: '₹ / carat' },
  { key: 'emerald', label: 'Emerald', unit: '₹ / carat' },
  { key: 'sapphire', label: 'Sapphire', unit: '₹ / carat' },
  { key: 'pearl', label: 'Pearl', unit: '₹ / piece' },
  { key: 'coral', label: 'Coral', unit: '₹ / carat' },
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
  const [stoneRefundPct, setStoneRefundPct] = useState<string>('50');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' | 'info' } | null>(null);
  const [error, setError] = useState('');
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [unmappedPurities, setUnmappedPurities] = useState<Lookup[]>([]);
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>(DEFAULT_DELIVERY);
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);

  // Notification channel
  const [waEnabled, setWaEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

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
      .catch(() => { })
      .finally(() => setLookupsLoading(false));

    fetch(`${API_BASE}/online-orders/delivery-settings`, {
      headers: { Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('admin_token') || '' : ''}` }
    })
      .then(r => r.json())
      .then(d => { if (d) setDeliverySettings({ ...DEFAULT_DELIVERY, ...d }); })
      .catch(() => { })
      .finally(() => setDeliveryLoading(false));
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
    setStoneRefundPct(settings.stone_refund_percentage != null ? String(settings.stone_refund_percentage) : '50');
    setWaEnabled((settings as any).whatsapp_notifications_enabled !== false);
    setEmailEnabled((settings as any).email_notifications_enabled !== false);
  }, [loading, lookupsLoading, settings, purityLookups, metalConfig]);

  function showToast(message: string, type: 'success' | 'danger' | 'info' = 'info') {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }

  function detectLocation() {
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(pos => {
      setDeliverySettings(s => ({ ...s, store_latitude: pos.coords.latitude, store_longitude: pos.coords.longitude }));
      setDetecting(false);
      showToast('Store location detected!', 'success');
    }, () => { showToast('Could not detect location', 'danger'); setDetecting(false); });
  }

  function updateZone(i: number, field: keyof DeliveryZone, value: string | number) {
    setDeliverySettings(s => { const z = [...s.zones]; z[i] = { ...z[i], [field]: field === 'label' ? value : Number(value) }; return { ...s, zones: z }; });
  }
  function addZone() { setDeliverySettings(s => ({ ...s, zones: [...s.zones, { min_km: 0, max_km: 50, charge: 299, label: 'New Zone' }] })); }
  function removeZone(i: number) { setDeliverySettings(s => ({ ...s, zones: s.zones.filter((_, j) => j !== i) })); }

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
        stone_refund_percentage: Number(stoneRefundPct) || 50,
        whatsapp_notifications_enabled: waEnabled,
        email_notifications_enabled: emailEnabled,
      });

      await fetch(`${API_BASE}/online-orders/delivery-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('admin_token') || '' : ''}`
        },
        body: JSON.stringify(deliverySettings)
      });

      await reload();
      showToast('Rates saved. Syncing inventory prices…', 'info');

      // Sync inventory prices in the background — show result
      try {
        const syncResult = await syncAllInventoryPrices();
        showToast(
          `Rates applied. ${syncResult.updated} inventory item${syncResult.updated === 1 ? '' : 's'} repriced.`,
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

  if (loading || lookupsLoading || deliveryLoading) {
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
                  className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-tight transition-all border ${chargeType === type
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

      {/* ── Refund Policy ── */}
      <section
        className="border rounded-2xl p-6 space-y-6 shadow-sm"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center shrink-0 shadow-sm border border-red-100/50 transition-transform hover:scale-105 duration-300">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-red-500">
              <path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: colors.textMain }}>Refund Policy Settings</h2>
            <p className="text-xs mt-1 opacity-70" style={{ color: colors.textMuted }}>
              Configure how much of stone/diamond value is returned to the customer on a refund. Metal (gold/silver/platinum) value is always refunded at 100%.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="space-y-3">
            <label className="text-[13px] font-bold" style={{ color: colors.textMain }}>Stone / Gemstone Refund Percentage (%)</label>
            <div className="relative">
              <input
                type="number" min={0} max={100} step={1}
                className="w-full pr-10 pl-4 py-3 border rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-red-400/20"
                style={{ backgroundColor: theme === 'light' ? '#f8fafc' : '#162846', borderColor: colors.border, color: colors.textMain }}
                placeholder="50"
                value={stoneRefundPct}
                onChange={e => setStoneRefundPct(e.target.value)}
              />
              <span className="absolute inset-y-0 right-4 flex items-center text-sm font-bold opacity-40" style={{ color: colors.textMain }}>%</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>
              Currently: {stoneRefundPct || 50}% of assessed stone value is refunded
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-red-50 border border-red-100 space-y-2">
            <p className="text-xs font-black text-red-700 uppercase tracking-widest">Refund Formula</p>
            <div className="text-[11px] text-red-700 space-y-1 font-medium">
              <div>- Metal Value → <b>100%</b> returned</div>
              <div>- Stone Value → <b>{stoneRefundPct || 50}%</b> returned</div>
              <div>- Making Charges → <b>0%</b> (not returned)</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Delivery Settings ── */}
      <section
        className="border rounded-2xl p-6 space-y-6 shadow-sm"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center shrink-0 shadow-sm border border-teal-100/50 transition-transform hover:scale-105 duration-300">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-teal-600">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: colors.textMain }}>Delivery Settings</h2>
            <p className="text-xs mt-1 opacity-70" style={{ color: colors.textMuted }}>
              Configure delivery zones, charges, and free delivery threshold for online orders.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Toggle */}
          <div className="rounded-2xl p-6 flex items-center justify-between" style={{ backgroundColor: theme === 'light' ? '#fcfdfe' : '#0c1626' }}>
            <div>
              <p className="text-sm font-black" style={{ color: colors.textMain }}>Online Delivery Enabled</p>
              <p className="text-xs mt-0.5 opacity-60" style={{ color: colors.textMain }}>Allow customers to place delivery orders</p>
            </div>
            <button onClick={() => setDeliverySettings(s => ({ ...s, is_delivery_enabled: !s.is_delivery_enabled }))}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${deliverySettings.is_delivery_enabled ? 'bg-teal-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${deliverySettings.is_delivery_enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {/* Store Location */}
          <div className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: theme === 'light' ? '#fcfdfe' : '#0c1626' }}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60" style={{ color: colors.textMain }}>Store Location (Origin)</p>
            <input value={deliverySettings.store_address} onChange={e => setDeliverySettings(s => ({ ...s, store_address: e.target.value }))}
              placeholder="Store address (for display)"
              style={{ backgroundColor: theme === 'light' ? '#f8fafc' : '#162846', borderColor: colors.border, color: colors.textMain }}
              className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:border-blue-500" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase mb-1 block opacity-60" style={{ color: colors.textMain }}>Latitude</label>
                <input type="number" step="0.0001" value={deliverySettings.store_latitude}
                  onChange={e => setDeliverySettings(s => ({ ...s, store_latitude: Number(e.target.value) }))}
                  style={{ backgroundColor: theme === 'light' ? '#f8fafc' : '#162846', borderColor: colors.border, color: colors.textMain }}
                  className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase mb-1 block opacity-60" style={{ color: colors.textMain }}>Longitude</label>
                <input type="number" step="0.0001" value={deliverySettings.store_longitude}
                  onChange={e => setDeliverySettings(s => ({ ...s, store_longitude: Number(e.target.value) }))}
                  style={{ backgroundColor: theme === 'light' ? '#f8fafc' : '#162846', borderColor: colors.border, color: colors.textMain }}
                  className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <button onClick={detectLocation} disabled={detecting}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-xs font-black hover:bg-blue-100 transition-all disabled:opacity-50">
              {detecting ? 'Detecting…' : 'Use My Current Location'}
            </button>
            <a href={`https://maps.google.com/?q=${deliverySettings.store_latitude},${deliverySettings.store_longitude}`} target="_blank" rel="noreferrer"
              className="text-xs text-blue-600 hover:underline block">Preview on Google Maps →</a>
          </div>

          {/* Free Delivery & Max Radius */}
          <div className="rounded-2xl p-6 grid grid-cols-2 gap-6" style={{ backgroundColor: theme === 'light' ? '#fcfdfe' : '#0c1626' }}>
            <div>
              <label className="text-[10px] font-black uppercase mb-2 block opacity-60" style={{ color: colors.textMain }}>Free Delivery Above (₹)</label>
              <input type="number" value={deliverySettings.free_delivery_above}
                onChange={e => setDeliverySettings(s => ({ ...s, free_delivery_above: Number(e.target.value) }))}
                style={{ backgroundColor: theme === 'light' ? '#f8fafc' : '#162846', borderColor: colors.border, color: colors.textMain }}
                className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              <p className="text-[10px] mt-1 opacity-60" style={{ color: colors.textMain }}>Orders above this amount get free delivery</p>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase mb-2 block opacity-60" style={{ color: colors.textMain }}>Max Delivery Radius (km)</label>
              <input type="number" value={deliverySettings.max_delivery_radius_km}
                onChange={e => setDeliverySettings(s => ({ ...s, max_delivery_radius_km: Number(e.target.value) }))}
                style={{ backgroundColor: theme === 'light' ? '#f8fafc' : '#162846', borderColor: colors.border, color: colors.textMain }}
                className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              <p className="text-[10px] mt-1 opacity-60" style={{ color: colors.textMain }}>Orders beyond this radius are not accepted</p>
            </div>
          </div>

          {/* Delivery Zones */}
          <div className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: theme === 'light' ? '#fcfdfe' : '#0c1626' }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60" style={{ color: colors.textMain }}>Delivery Zones & Charges</p>
              <button onClick={addZone} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all">
                + Add Zone
              </button>
            </div>
            <div className="space-y-3">
              {deliverySettings.zones.map((zone, i) => (
                <div key={i} className="grid grid-cols-5 gap-3 items-center p-4 rounded-2xl border" style={{ backgroundColor: theme === 'light' ? '#f8fafc' : '#162846', borderColor: colors.border }}>
                  <div>
                    <label className="text-[9px] font-black uppercase block mb-1 opacity-60" style={{ color: colors.textMain }}>Label</label>
                    <input value={zone.label || ''} onChange={e => updateZone(i, 'label', e.target.value)}
                      placeholder="e.g. City"
                      style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                      className="w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase block mb-1 opacity-60" style={{ color: colors.textMain }}>From (km)</label>
                    <input type="number" value={zone.min_km} onChange={e => updateZone(i, 'min_km', e.target.value)}
                      style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                      className="w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase block mb-1 opacity-60" style={{ color: colors.textMain }}>To (km)</label>
                    <input type="number" value={zone.max_km} onChange={e => updateZone(i, 'max_km', e.target.value)}
                      style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                      className="w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase block mb-1 opacity-60" style={{ color: colors.textMain }}>Charge (₹)</label>
                    <input type="number" value={zone.charge} onChange={e => updateZone(i, 'charge', e.target.value)}
                      style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                      className="w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="flex justify-center pt-4">
                    <button onClick={() => removeZone(i)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl p-4" style={{ backgroundColor: theme === 'light' ? '#fffbeb' : '#2d2412' }}>
              <p className="text-[10px] font-medium" style={{ color: theme === 'light' ? '#92400e' : '#fbbf24' }}>Tip: Set Charge to 0 for free zones. Orders above the free delivery threshold get free delivery regardless of zone.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Notification Channels ── */}
      <section className="border rounded-2xl p-6 space-y-5 shadow-sm" style={{ borderColor: colors.border }}>
        <div>
          <h2 className="text-[15px] font-bold" style={{ color: colors.textMain }}>Notification Channels</h2>
          <p className="text-xs mt-1 opacity-60" style={{ color: colors.textMain }}>
            Control which channels send automated messages to customers on purchase, return or reservation events.
          </p>
        </div>

        {/* Both-off warning */}
        {!waEnabled && !emailEnabled && (
          <div className="flex items-center gap-3 px-4 py-3.5 bg-red-50 border border-red-200 rounded-2xl">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-[12px] font-bold text-red-700">
              Both channels are disabled — customers will not receive any notifications on purchase or return.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* WhatsApp toggle card */}
          <div className={`rounded-2xl border-2 p-5 transition-all ${waEnabled ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100'}`}
            style={!waEnabled ? { borderColor: colors.border, backgroundColor: theme === 'light' ? '#f8fafc' : '#0c1626' } : {}}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${waEnabled ? 'bg-blue-100' : 'bg-slate-100'}`}>
                  <MessageCircle size={20} className={waEnabled ? 'text-blue-600' : 'text-slate-400'} />
                </div>
                <div>
                  <p className="text-[13px] font-black" style={{ color: colors.textMain }}>WhatsApp</p>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${waEnabled ? 'text-blue-600' : 'text-slate-400'}`}>
                    {waEnabled ? 'Active' : 'Blocked'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWaEnabled(v => !v)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${waEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${waEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: colors.textMuted }}>
              {waEnabled
                ? 'Purchase confirmations, return notices and reservations sent via WhatsApp.'
                : 'No WhatsApp messages will be sent for any sale events.'}
            </p>
          </div>

          {/* Email toggle card */}
          <div className={`rounded-2xl border-2 p-5 transition-all ${emailEnabled ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100'}`}
            style={!emailEnabled ? { borderColor: colors.border, backgroundColor: theme === 'light' ? '#f8fafc' : '#0c1626' } : {}}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${emailEnabled ? 'bg-blue-100' : 'bg-slate-100'}`}>
                  <Mail size={20} className={emailEnabled ? 'text-blue-600' : 'text-slate-400'} />
                </div>
                <div>
                  <p className="text-[13px] font-black" style={{ color: colors.textMain }}>Email</p>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${emailEnabled ? 'text-blue-600' : 'text-slate-400'}`}>
                    {emailEnabled ? 'Active' : 'Blocked'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEmailEnabled(v => !v)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${emailEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${emailEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: colors.textMuted }}>
              {emailEnabled
                ? 'Purchase confirmations and return acknowledgements sent via email (requires Mailgun).'
                : 'No emails will be sent for any sale events.'}
            </p>
          </div>
        </div>

        {/* Live summary */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: theme === 'light' ? '#f8fafc' : '#0c1626' }}>
          <Bell size={13} className="text-slate-400 flex-shrink-0" />
          <p className="text-[11px] font-bold" style={{ color: colors.textMuted }}>
            {waEnabled && emailEnabled && 'Customers will receive notifications via both WhatsApp and Email'}
            {waEnabled && !emailEnabled && 'Customers will only receive WhatsApp messages'}
            {!waEnabled && emailEnabled && 'Customers will only receive Emails'}
            {!waEnabled && !emailEnabled && 'All automated notifications are currently blocked'}
          </p>
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
