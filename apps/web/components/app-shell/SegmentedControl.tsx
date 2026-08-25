'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A single-choice control for switching a view or narrowing a list.
 *
 * The appointment views used the ARIA tab pattern for this, which promises a panel per tab. There
 * were none, so every trigger carried an `aria-controls` pointing at an element that did not exist
 * and axe reported a critical violation. These controls reshape one list rather than revealing
 * sibling panels, so they are toggle buttons: a screen reader announces which option is pressed,
 * and there is nothing left to point at.
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

export function SegmentedControl<TValue extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<TValue>) {
  const groupId = useId();
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'grid h-auto w-full gap-2 rounded-2xl border border-border/70 bg-background p-2',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const describedBy = option.description ? `${groupId}-${option.value}` : undefined;
        return (
          <div key={option.value} className="contents">
            <Button
              type="button"
              variant={selected ? 'default' : 'ghost'}
              aria-pressed={selected}
              aria-describedby={describedBy}
              onClick={() => onChange(option.value)}
              className={cn(
                'min-h-9 cursor-pointer rounded-xl text-sm font-medium',
                !selected && 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </Button>
            {describedBy ? (
              <span id={describedBy} className="sr-only">
                {option.description}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
