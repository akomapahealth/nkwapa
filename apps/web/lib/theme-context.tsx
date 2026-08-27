'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const themeStorageKey = 'nkwapa-theme';

type ThemeContextValue = {
  /** What the user chose. 'system' follows the OS. */
  preference: ThemePreference;
  /** What is actually rendered right now. Never 'system'. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(themeStorageKey);
    return isPreference(stored) ? stored : 'system';
  } catch {
    // Private mode, or site data blocked. Fall back to following the OS.
    return 'system';
  }
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Applies the resolved theme to <html>. Kept in sync with the inline boot script in
 * app/layout.tsx, which runs the same logic before first paint to avoid a flash of the
 * wrong theme. If you change the class or storage key here, change it there too.
 */
function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server renders the light default; the boot script has already corrected the DOM by the
  // time this mounts, and the effect below reconciles React's state with it.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [theme, setTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const stored = readStoredPreference();
    setPreferenceState(stored);
    setTheme(stored === 'system' ? systemTheme() : stored);
  }, []);

  // Only follow the OS while the user has not made an explicit choice.
  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setTheme(next === 'system' ? systemTheme() : next);
    try {
      if (next === 'system') {
        window.localStorage.removeItem(themeStorageKey);
      } else {
        window.localStorage.setItem(themeStorageKey, next);
      }
    } catch {
      // Preference is not persisted, but the current session still switches.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  return (
    ctx ?? {
      preference: 'system' as ThemePreference,
      theme: 'light' as ResolvedTheme,
      setPreference: () => {},
    }
  );
}
