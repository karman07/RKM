'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSettings, type AppSettings } from '@/lib/api';

const defaultSettings: AppSettings = {
  metal_rates: { gold: 0, silver: 0, platinum: 0 },
  purity_rates: {
    gold: { '18K': 0, '22K': 0, '24K': 0 },
    silver: { '925': 0, '950': 0, '999': 0 },
    platinum: { '850': 0, '900': 0, '950': 0 },
  },
  stone_rates: { diamond: 0, ruby: 0, emerald: 0, sapphire: 0, pearl: 0, coral: 0 },
  making_charge_type: 'per_gram',
  making_charge_rate: 0,
  fixed_making_charge: 0,
};

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: defaultSettings,
  loading: true,
  reload: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await getSettings();
      setSettings(data);
    } catch {
      // Keep defaults — user may not be logged in yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <SettingsContext.Provider value={{ settings, loading, reload }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
