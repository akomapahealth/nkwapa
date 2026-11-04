'use client';

import { useEffect, useRef, useState } from 'react';
import { openCookieSettings } from '@/lib/cookie-consent';
import { cn } from '@/lib/utils';

/** Reopens the existing global consent dialog without changing a saved choice. */
export function CookieSettingsButton({
  className,
  label = 'Cookie settings',
}: {
  className?: string;
  label?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [awaitingClose, setAwaitingClose] = useState(false);

  useEffect(() => {
    if (!awaitingClose) return;
    let opened = false;
    let frame = 0;
    // This entry point is outside the global Radix Dialog.Root, so it cannot be a
    // DialogTrigger. Watch that dialog's existing essential field through its exit,
    // then restore only the entry that opened it. No consent event/storage is changed.
    const checkDialog = () => {
      if (document.getElementById('cookie-essential')) {
        opened = true;
      } else if (opened) {
        observer.disconnect();
        frame = requestAnimationFrame(() => {
          trigger.current?.focus({ preventScroll: true });
          setAwaitingClose(false);
        });
      }
    };
    const observer = new MutationObserver(checkDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    checkDialog();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [awaitingClose]);

  return (
    <button
      ref={trigger}
      type="button"
      aria-haspopup="dialog"
      className={cn(
        'inline-flex min-h-11 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={() => {
        setAwaitingClose(true);
        openCookieSettings();
      }}
    >
      {label}
    </button>
  );
}
