/**
 * Names, copy and colors shared by the root metadata, the web manifest and the theme-color meta
 * (#206). Kept free of 'use client' so server modules can import it.
 */
export const APP_NAME = 'Nkwapa EMR';
export const APP_SHORT_NAME = 'Nkwapa';
export const APP_DESCRIPTION =
  'Nkwapa EMR supports multi-clinic hypertension and diabetes workflows, clinical review, prescribing, reminders, and patient follow-up.';

/**
 * Hex forms of the app/globals.css tokens. Browsers paint the splash screen and title bar before
 * any CSS loads, so these must be literal colors. app/manifest.test.ts converts the tokens and
 * fails if a theme change leaves these behind.
 */
export const APP_COLORS = {
  /** :root --background: 54 63% 97% */
  lightBackground: '#FCFBF3',
  /** :root --primary: 188 100% 27% */
  lightPrimary: '#00778A',
  /** .dark --background: 200 25% 8% */
  darkBackground: '#0F161A',
} as const;

/** The title and status bar blend into the sticky header, which uses --background. */
export function themeColorFor(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? APP_COLORS.darkBackground : APP_COLORS.lightBackground;
}
