'use client';

import { useEffect } from 'react';

/** Below this, a visual-viewport shrink is browser chrome (URL bar, zoom), not a keyboard. */
const KEYBOARD_MIN_PX = 120;

/** How much of the layout viewport's bottom the visual viewport no longer shows. */
export function keyboardInset(layoutHeight: number, visualHeight: number, visualTop: number) {
  const hidden = Math.round(layoutHeight - visualHeight - visualTop);
  return hidden >= KEYBOARD_MIN_PX ? hidden : 0;
}

/**
 * R7.4: a phone's virtual keyboard covers the bottom of the layout viewport without resizing it
 * (iOS Safari, and Chrome's default `resizes-visual`), so anything fixed to the bottom (a dialog
 * sheet and its Save row, the chat panel) sits under the keys. This publishes the covered height as
 * `--keyboard-inset` on <html>, and `data-keyboard` while it is non-zero, for CSS to lift those
 * surfaces and hide the bottom nav. Pinch zoom also shrinks the visual viewport; the threshold and
 * the editable-focus check keep that from reading as a keyboard.
 */
export function KeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      const el = document.activeElement;
      const editing =
        el instanceof HTMLElement &&
        (el.isContentEditable || el.matches('input:not([type=checkbox],[type=radio]), textarea'));
      const inset = editing
        ? keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop)
        : 0;
      root.style.setProperty('--keyboard-inset', `${inset}px`);
      root.toggleAttribute('data-keyboard', inset > 0);
    };
    // focusout fires before the next field takes focus; read activeElement a frame later, so
    // moving between fields with the keyboard up does not drop the inset.
    let frame = 0;
    const onFocusChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusout', onFocusChange);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusout', onFocusChange);
      root.style.removeProperty('--keyboard-inset');
      root.removeAttribute('data-keyboard');
    };
  }, []);
  return null;
}
