import type { MetadataRoute } from 'next';
import { APP_COLORS, APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME } from '@/lib/app-identity';
import { isWebFeatureEnabled } from '@/lib/feature-flags';

/**
 * The single web manifest (#206). Next serves it at /manifest.webmanifest and adds the
 * <link rel="manifest"> itself, so layout.tsx must not declare one.
 */
export default function manifest(): MetadataRoute.Manifest {
  const installPolish = isWebFeatureEnabled('pwaInstall');
  return {
    // Never change: installed devices identify the app by it.
    id: '/',
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    // /login already routes a signed-in account to its role home and shows sign-in otherwise.
    start_url: '/login?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    // Clinic tablets run in landscape; never lock it.
    orientation: 'any',
    background_color: APP_COLORS.lightBackground,
    theme_color: APP_COLORS.lightPrimary,
    lang: 'en',
    dir: 'ltr',
    categories: ['medical', 'health', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    ...(installPolish
      ? {
          // Chromium's richer install sheet. Seeded demo data only; regenerate with
          // playwright/capture-pwa-screenshots.js.
          screenshots: [
            {
              src: '/screenshots/wide-today.png',
              sizes: '1280x800',
              type: 'image/png',
              form_factor: 'wide',
              label: 'The Today Board: live clinic flow for the day',
            },
            {
              src: '/screenshots/narrow-chart.png',
              sizes: '750x1334',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'A patient chart on a phone',
            },
          ],
          // Shortcuts cannot know the role, so only destinations RouteGuard turns away gracefully.
          shortcuts: [
            { name: 'Dashboard', url: '/dashboard?source=pwa-shortcut' },
            { name: 'Patients', url: '/patients?source=pwa-shortcut' },
          ],
        }
      : {}),
  };
}
