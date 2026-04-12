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
  const [theme, setThemeState] = useState<AppTheme>('light');

  useEffect(() => {
    const stored = localStorage.getItem('admin_theme_v2') as AppTheme | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = stored ?? (prefersDark ? 'dark' : 'light');
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('admin_theme_v2', theme);
  }, [theme]);

  const value = useMemo<AppThemeContextValue>(() => {
    return {
      theme,
      setTheme: (nextTheme: AppTheme) => setThemeState(nextTheme),
      toggleTheme: () => setThemeState((current) => (current === 'light' ? 'dark' : 'light')),
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
