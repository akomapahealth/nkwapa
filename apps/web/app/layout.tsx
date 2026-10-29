import './globals.css';
import type { Metadata, Viewport } from 'next';
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, themeColorFor } from '@/lib/app-identity';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeProvider } from '@/lib/theme-context';
import { themeStorageKey } from '@/lib/theme-storage';

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
  icons: {
    icon: [
      { url: '/images/favicon/favicon.ico' },
      { url: '/images/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/images/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/images/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            {children}
            <ServiceWorkerRegistration />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
