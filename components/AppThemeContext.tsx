'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type AppTheme = 'light' | 'dark';

interface AppThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function applyTheme(theme: AppTheme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  // Forced to light mode permanently per user request
  const [theme] = useState<AppTheme>('light');

  useEffect(() => {
    applyTheme('light');
  }, []);

  const value = useMemo<AppThemeContextValue>(() => {
    return {
      theme,
      setTheme: () => {}, // No-op
      toggleTheme: () => {}, // No-op
    };
  }, [theme]);

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return context;
}
