'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

const BUBBLE_WIDTH = 288;
const VIEWPORT_GUTTER = 12;
const BUBBLE_OFFSET = 10;

/**
 * Every mounted hint's close function.
 *
 * Issue #63 requires that only the intended bubble is open. State was per-instance, so a
 * dashboard with five metric hints and three chart hints could have all eight open at once,
 * stacked over the data they were explaining. A module-level registry is the smallest thing that
 * fixes it without a provider every consumer would have to remember to mount.
 */
const openHints = new Set<() => void>();

function closeOtherHints(self: () => void) {
  for (const close of openHints) {
    if (close !== self) close();
  }
}

/**
 * Contextual help that does not move the page.
 *
 * Use this for a sentence that helps someone read what is already on screen. Anything a user
 * must read to work safely -- consent wording, safety rules, de-identification terms -- belongs
 * in ProgressiveHelp instead, which stays visible and expands in place. #63 is explicit that
 * required instructions and clinical warnings must not be hidden behind a trigger.
 */
export function InfoHint({ label, className }: { label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    placement: 'top' | 'bottom';
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const bubbleId = useId();

  const close = useCallback(() => setOpen(false), []);

  /**
   * Place the bubble against the real measured height.
   *
   * This used to flip to the top whenever there was less than 160px below the trigger, which is a
   * guess: a three-line hint is shorter than that and a six-line one is taller, so long help text
   * still ran off the bottom of the viewport. Measuring means the flip happens exactly when the
   * bubble would not fit, and never otherwise.
   */
  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button || typeof window === 'undefined') return;

    const rect = button.getBoundingClientRect();
    const maxLeft = Math.max(window.innerWidth - BUBBLE_WIDTH - VIEWPORT_GUTTER, VIEWPORT_GUTTER);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - BUBBLE_WIDTH / 2, VIEWPORT_GUTTER),
      maxLeft,
    );

    const bubbleHeight = bubbleRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom - BUBBLE_OFFSET - VIEWPORT_GUTTER;
    const spaceAbove = rect.top - BUBBLE_OFFSET - VIEWPORT_GUTTER;

    // Prefer below. Flip only when it genuinely will not fit and there is more room above.
    const placement: 'top' | 'bottom' =
      bubbleHeight > 0 && spaceBelow < bubbleHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const top = placement === 'bottom' ? rect.bottom + BUBBLE_OFFSET : rect.top - BUBBLE_OFFSET;

    setPosition((current) =>
      current && current.left === left && current.top === top && current.placement === placement
        ? current
        : { left, top, placement },
    );
  }, []);

  // Runs after the bubble exists, so the first paint is already measured rather than being
  // positioned on a guess and then corrected, which the eye reads as a jump.
  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    openHints.add(close);
    closeOtherHints(close);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || bubbleRef.current?.contains(target)) return;

      // If focus is inside the bubble we are about to unmount, hand it back to the trigger.
      // Without this it lands on <body> and the next Tab restarts from the top of the page.
      const focusWasInside = bubbleRef.current?.contains(document.activeElement);
      setOpen(false);
      if (focusWasInside) buttonRef.current?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      openHints.delete(close);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-label={`Show help: ${label}`}
        aria-describedby={open ? bubbleId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          // The 44px touch target is a centred pseudo-element rather than the button's own box.
          // `touch-target` used to set min-height/min-width on the button itself, which silently
          // beat every `h-5 w-5` / `-mr-1` override the four call sites pass, and pushed metric
          // card headers around by 20px. The glyph now sizes as asked and the tap area still
          // clears the contract's 44px floor.
          'relative inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150',
          'before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
          'hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'data-[state=open]:bg-primary/10 data-[state=open]:text-primary',
          className,
        )}
        data-state={open ? 'open' : 'closed'}
      >
        <CircleHelp aria-hidden="true" className="h-4 w-4" />
      </button>
      {open
        ? createPortal(
            <div
              ref={bubbleRef}
              id={bubbleId}
              role="tooltip"
              className={cn(
                'fixed z-[120] rounded-lg border border-border/80 bg-popover px-4 py-3 text-left text-sm leading-6 text-popover-foreground outline-none animate-in fade-in-0 zoom-in-95',
                position?.placement === 'top'
                  ? '-translate-y-full slide-in-from-bottom-1'
                  : 'slide-in-from-top-1',
              )}
              style={{
                // Width is driven from the constant the placement maths uses, so the two cannot
                // drift apart the way `w-72` and BUBBLE_WIDTH could.
                width: BUBBLE_WIDTH,
                left: position?.left ?? -9999,
                top: position?.top ?? -9999,
                // Hidden for the one frame before measurement, so it is never seen mispositioned.
                visibility: position ? 'visible' : 'hidden',
              }}
            >
              <span
                className={cn(
                  'absolute h-3 w-3 rotate-45 border border-border/80 bg-popover',
                  position?.placement === 'top'
                    ? 'bottom-[-7px] left-1/2 -translate-x-1/2 border-l-0 border-t-0'
                    : 'left-1/2 top-[-7px] -translate-x-1/2 border-b-0 border-r-0',
                )}
                aria-hidden="true"
              />
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
