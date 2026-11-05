import './globals.css';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, themeColorFor } from '@/lib/app-identity';
import { PwaBoot } from '@/components/pwa/PwaBoot';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import { ToastProvider } from '@/components/ui/toast';
import { CookieConsent } from '@/components/CookieConsent';
import { ThemeProvider } from '@/lib/theme-context';
import { themeStorageKey } from '@/lib/theme-storage';

// Self-hosted copies of the Google Fonts latin and latin-ext subsets, so the build needs no
// network (#316). latin is preloaded; latin-ext (Ghanaian letters such as Ɛ, Ɔ, Ŋ in patient
// names) loads only when a page uses one, through Google's unicode-range, repeated per call
// because font loader options must be literals. globals.css puts latin-ext first in each stack.
// shortcut: cyrillic, greek and vietnamese fall back to the system font; add those subset files the same way if names need them.
const ibmPlexSans = localFont({
  src: './fonts/ibm-plex-sans-latin.woff2',
  weight: '100 700',
  display: 'swap',
  variable: '--font-body-latin',
  fallback: ['system-ui', 'sans-serif'],
});
const ibmPlexSansExt = localFont({
  src: './fonts/ibm-plex-sans-latin-ext.woff2',
  weight: '100 700',
  display: 'swap',
  variable: '--font-body-ext',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
});
const sourceSerif4 = localFont({
  src: './fonts/source-serif-4-latin.woff2',
  weight: '200 900',
  display: 'swap',
  variable: '--font-heading-latin',
  fallback: ['Georgia', 'serif'],
});
const sourceSerif4Ext = localFont({
  src: './fonts/source-serif-4-latin-ext.woff2',
  weight: '200 900',
  display: 'swap',
  variable: '--font-heading-ext',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
});

/**
 * Runs before first paint so the correct theme is on <html> when the page renders, rather
 * than flashing light and correcting on hydration. Deliberately duplicates the logic in
 * lib/theme-context.tsx; keep the two in sync. Wrapped in try/catch because localStorage
 * throws outright in some privacy modes.
 */
const themeBootScript = `
(function(){try{
var s=localStorage.getItem(${JSON.stringify(themeStorageKey)});
var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',d);
document.documentElement.style.colorScheme=d?'dark':'light';
var c=d?${JSON.stringify(themeColorFor('dark'))}:${JSON.stringify(themeColorFor('light'))};
document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',c);});
}catch(e){}})();
`.trim();

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nkwapa.app';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: themeColorFor('light') },
    { media: '(prefers-color-scheme: dark)', color: themeColorFor('dark') },
  ],
  // Lets the installed app draw under notches and home indicators; the shell pads itself with
  // env(safe-area-inset-*), which stays 0 without this.
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: APP_NAME,
  title: {
    default: 'Nkwapa EMR',
    template: '%s | Nkwapa EMR',
  },
  description: APP_DESCRIPTION,
  keywords: [
    'Nkwapa',
    'EMR',
    'electronic medical records',
    'hypertension care',
    'diabetes care',
    'clinic operations',
  ],
  // 'default' keeps content below the iOS status bar instead of under it.
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: 'default' },
  authors: [{ name: 'Nkwapa' }],
  creator: 'Nkwapa',
  publisher: 'Nkwapa',
  // ?v= busts the browser and iOS icon caches; bump it whenever the icons are regenerated.
  icons: {
    icon: [
      { url: '/images/favicon/favicon.ico?v=2' },
      { url: '/images/favicon/favicon-16x16.png?v=2', sizes: '16x16', type: 'image/png' },
      { url: '/images/favicon/favicon-32x32.png?v=2', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/images/favicon/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Nkwapa EMR',
    title: 'Nkwapa EMR',
    description:
      'Patient records and clinic workflows for hypertension and diabetes care, in one place.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'The Nkwapa home page: "Patient records and clinic workflows, in one place," beside the clinic dashboard on a laptop and a phone.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nkwapa EMR',
    description:
      'Patient records and clinic workflows for hypertension and diabetes care, in one place.',
    images: ['/og-image.jpg'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: themeBootScript mutates <html> before React hydrates.
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexSansExt.variable} ${sourceSerif4.variable} ${sourceSerif4Ext.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            {children}
            <ServiceWorkerRegistration />
            <PwaBoot />
            <CookieConsent />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
