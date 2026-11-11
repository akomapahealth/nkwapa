'use client';

import { useRef } from 'react';

type AutoFocusHandler = ((event: Event) => void) | undefined;

/**
 * Radix's modal Dialog returns focus only to its own `Trigger` (`triggerRef`). Most of our dialogs
 * and sheets are controlled and opened from an ordinary Button, so on close focus fell to `<body>`
 * and a keyboard user started again from the top of the page (R7.3). Remember what held focus when
 * the overlay opened and go back there; fall back to `main` if that element is gone or hidden.
 * A caller that prevents the close event keeps its own handling.
 */
export function useReturnFocus(
  onOpenAutoFocus: AutoFocusHandler,
  onCloseAutoFocus: AutoFocusHandler,
) {
  const returnFocusTo = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (event: Event) => {
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const previous = returnFocusTo.current;
      const target =
        previous?.isConnected && previous !== document.body && previous.getClientRects().length
          ? previous
          : document.getElementById('main-content');
      if (target && target !== document.body) {
        event.preventDefault();
        target.focus();
      }
    },
  };
}
