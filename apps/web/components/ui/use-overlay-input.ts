'use client';

import { useEffect } from 'react';

let consumers = 0;
let release: (() => void) | undefined;

/** Radix moves focus programmatically, so :focus-visible alone cannot identify
 * the input that opened an overlay. Share one capture listener across all roots. */
export function useOverlayInput() {
  useEffect(() => {
    if (consumers++ === 0) {
      const root = document.documentElement;
      const setInput = (input: 'pointer' | 'keyboard') => {
        if (root.dataset.overlayInput !== input) root.dataset.overlayInput = input;
      };
      const pointer = () => setInput('pointer');
      const keyboard = () => setInput('keyboard');
      setInput('keyboard');
      document.addEventListener('pointerdown', pointer, true);
      document.addEventListener('pointermove', pointer, true);
      document.addEventListener('keydown', keyboard, true);
      release = () => {
        document.removeEventListener('pointerdown', pointer, true);
        document.removeEventListener('pointermove', pointer, true);
        document.removeEventListener('keydown', keyboard, true);
        delete root.dataset.overlayInput;
      };
    }
    return () => {
      if (--consumers === 0) {
        release?.();
        release = undefined;
      }
    };
  }, []);
}
