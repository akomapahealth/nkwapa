'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Copy text, and say whether it worked.
 *
 * The first clipboard use in the product, so it carries the rules once rather than at each
 * future call site. `navigator.clipboard` is undefined on an insecure origin and throws
 * outright when the browser refuses permission — a clinic on a plain-HTTP LAN address hits
 * the first of those every time. A copy button that silently does nothing is worse than
 * one that says it could not, because staff go on to paste stale content believing it is
 * the new thing.
 *
 * The reset timer is cleared on unmount: the card this lives in disappears when a mutation
 * refetches the chart, and setting state afterwards is a React warning in the console for
 * anyone reading it.
 */
export function useCopyToClipboard(resetAfterMs = 2000) {
  const [state, setState] = useState<CopyState>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const copy = useCallback(
    async (value: string) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      let ok = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          ok = true;
        }
      } catch {
        ok = false;
      }

      setState(ok ? 'copied' : 'failed');
      timerRef.current = window.setTimeout(() => setState('idle'), resetAfterMs);
      return ok;
    },
    [resetAfterMs],
  );

  return { state, copy };
}
