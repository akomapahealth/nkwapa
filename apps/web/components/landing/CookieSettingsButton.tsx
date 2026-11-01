'use client';

import { openCookieSettings } from '@/lib/cookie-consent';

/** Reopens the cookie choice from server-rendered pages. */
export function CookieSettingsButton({
  className,
  label = 'Cookie settings',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button type="button" className={className} onClick={openCookieSettings}>
      {label}
    </button>
  );
}
