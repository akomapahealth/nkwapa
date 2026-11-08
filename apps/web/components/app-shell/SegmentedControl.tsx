'use client';

import { useId, useState, type MouseEvent } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * A single-choice control for switching a view or narrowing a list.
 *
 * The appointment views used the ARIA tab pattern for this, which promises a panel per tab. There
 * were none, so every trigger carried an `aria-controls` pointing at an element that did not exist
 * and axe reported a critical violation. These controls reshape one list rather than revealing
 * sibling panels, so they are toggle buttons: a screen reader announces which option is pressed,
 * and there is nothing left to point at.
 *
 * Look and motion are the R0 pilot's `.seg` (R0-AUDIT §6 rules 5, 9, 17, 20, 21, 23, 24): a raised
 * knob on a `--surface-2` track that moves between options as one shared element (`layoutId`),
 * stretching up to 12% mid-move, while the active label colour is wiped in by a `clip-path` mask.
 */

export interface SegmentedOption<TValue extends string> {
  value: TValue;
  label: string;
  /**
   * Announced after the label, for options whose name alone does not say what they do.
   *
   * Carried by `aria-describedby` rather than inside the button, so it does not become part of the
   * accessible name and leave "Closed" announced, and matched in tests, as "Closed Cancelled or
   * missed."
   */
  description?: string;
}

interface SegmentedControlProps<TValue extends string> {
  /** Names the group for assistive technology, e.g. "Schedule range". */
  label: string;
  value: TValue;
  options: ReadonlyArray<SegmentedOption<TValue>>;
  onChange: (value: TValue) => void;
  className?: string;
}

/** `--ease-in-out` from globals.css; Motion needs the curve as numbers. */
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const MOVE_SECONDS = 0.22;

export function SegmentedControl<TValue extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<TValue>) {
  const groupId = useId();
  // Only a pointer press animates. A keyboard press (click `detail` 0), the first render and a
  // change made elsewhere (a reset, back navigation) snap, so nothing moves on load and nothing
  // animates on keyboard repeat (rule 21).
  const [pointerChoice, setPointerChoice] = useState<TValue | null>(null);
  const animate = pointerChoice === value;
  const activeIndex = options.findIndex((option) => option.value === value);

  const choose = (event: MouseEvent, next: TValue) => {
    setPointerChoice(event.detail > 0 ? next : null);
    onChange(next);
  };

  return (
    // Reduced motion: Motion drops the transform animations; globals.css drops the mask transition.
    <MotionConfig reducedMotion="user">
      <div
        role="group"
        aria-label={label}
        className={cn(
          'grid h-auto w-full gap-0.5 rounded-md bg-surface-2 p-[3px] shadow-[inset_0_0_0_1px_hsl(var(--border))]',
          // Four options go 2x2 on a phone rather than 3 + 1, which left one option alone on a row.
          options.length === 4 && 'grid-cols-2 sm:grid-cols-4',
          className,
        )}
        // auto-fit rather than a fixed column per option. A four-option control on a 375px phone
        // was dividing ~343px into four, which is not enough for a word like "Cancelled"; it now
        // wraps onto a second row instead of crushing or truncating the labels.
        style={
          options.length === 4
            ? undefined
            : { gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr))' }
        }
      >
        {options.map((option, index) => {
          const selected = index === activeIndex;
          const describedBy = option.description ? `${groupId}-${option.value}` : undefined;
          // Options before the active one rest collapsed at their right edge, options after it at
          // their left edge, so the colour always wipes in the knob's direction of travel and an
          // option the knob jumps over stays empty (left + right insets sum to 100% throughout).
          const clip = selected
            ? 'inset(0 0 0 0)'
            : index < activeIndex
              ? 'inset(0 0 0 100%)'
              : 'inset(0 100% 0 0)';
          return (
            <div key={option.value} className="contents">
              <button
                type="button"
                aria-pressed={selected}
                aria-describedby={describedBy}
                onClick={(event) => choose(event, option.value)}
                className="relative inline-flex min-h-[42px] min-w-11 cursor-pointer touch-manipulation items-center justify-center whitespace-nowrap rounded-[4px] px-3 text-sm font-semibold text-muted-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring hover:text-foreground [@media(pointer:coarse)]:min-h-12"
              >
                {selected ? (
                  <motion.span
                    layoutId={`${groupId}-knob`}
                    // Re-measure only when the choice changes, so a shift elsewhere on the page
                    // never makes the knob slide on its own.
                    layoutDependency={value}
                    transition={
                      animate ? { duration: MOVE_SECONDS, ease: EASE_IN_OUT } : { duration: 0 }
                    }
                    aria-hidden="true"
                    className="absolute inset-0"
                  >
                    {/* shortcut: always stretches on x, also when a wrapped control moves rows;
                        upgrade if a multi-row control ever gets heavy use. */}
                    <motion.span
                      className="absolute inset-0 rounded-[4px] bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.12),inset_0_0_0_1px_hsl(var(--border))]"
                      // Not `initial={false}`: the knob remounts on every change, and that would
                      // start it at the last keyframe, so the stretch would never play.
                      initial={{ scaleX: 1 }}
                      animate={animate ? { scaleX: [1, 1.12, 1] } : { scaleX: 1 }}
                      transition={{ duration: MOVE_SECONDS, ease: EASE_IN_OUT }}
                    />
                  </motion.span>
                ) : null}
                <span className="relative">{option.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute inset-0 inline-flex items-center justify-center px-3 text-primary ease-in-out-strong',
                    animate && 'transition-[clip-path] duration-[220ms]',
                  )}
                  style={{ clipPath: clip }}
                >
                  {option.label}
                </span>
              </button>
              {describedBy ? (
                <span id={describedBy} className="sr-only">
                  {option.description}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </MotionConfig>
  );
}
