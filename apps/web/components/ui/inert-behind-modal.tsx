'use client';

import { useEffect } from 'react';

/**
 * While a modal Radix layer is open (Dialog, Sheet, Select, DropdownMenu), Radix marks everything
 * behind it `aria-hidden` and tags each node it touched with `data-aria-hidden`. Those nodes stay
 * focusable, which is what axe reports as `aria-hidden-focus`: Radix's focus trap keeps Tab out,
 * but nothing tells the browser or a screen reader's virtual cursor. Mirroring the marker onto
 * `inert` says it. Radix focus management is untouched: it returns focus in a setTimeout after
 * unmount, and this observer runs as a microtask before it, so the trigger is never inert then.
 */
export function InertBehindModal() {
  useEffect(() => {
    const observer = new MutationObserver((records) => {
      for (const { target } of records) {
        if (target instanceof HTMLElement) target.inert = target.hasAttribute('data-aria-hidden');
      }
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-aria-hidden'],
    });
    return () => observer.disconnect();
  }, []);
  return null;
}
