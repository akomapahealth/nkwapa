import * as Sentry from '@sentry/nextjs';
import { scrubBrowserEvent } from '@/lib/sentry-scrubbing';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

    // Session Replay records the DOM of whatever is on screen. On a clinical workstation that is
    // a patient chart. Background recording of healthy sessions bought no diagnostic value that
    // justified holding those frames, so only sessions that actually errored are captured.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      // Masking is Sentry's default, but a default is not a decision. Pinned here so a library
      // upgrade or a stray option cannot quietly start transmitting chart text.
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
        networkDetailAllowUrls: [],
      }),
    ],

    sendDefaultPii: false,
    beforeSend: (event) => scrubBrowserEvent(event),
  });
}
