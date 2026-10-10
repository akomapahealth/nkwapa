'use client';

import * as Popover from '@radix-ui/react-popover';
import { CircleHelp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Every open hint's close function.
 *
 * Issue #63 requires that only the intended bubble is open. A pointer gets that for free -- pressing
 * a second trigger is an outside click for the first bubble -- but Enter and Space fire no
 * pointerdown, so a keyboard user could stack every hint on a dashboard over the data it explains.
 * A module-level registry is the smallest thing that fixes it without a provider every consumer
 * would have to remember to mount.
 */
const openHints = new Set<() => void>();

const triggerSizes = {
  sm: 'h-5 w-5 [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-6 w-6 [&_svg]:h-4 [&_svg]:w-4',
} as const;

/**
 * Contextual help that floats and never moves the page.
 *
 * Built on Radix Popover, which brings what the hand-placed bubble kept re-deriving: collision
 * handling on every side, an arrow that stays pointed at its trigger when the bubble is pushed in
 * from a screen edge, focus return on close, and an exit animation (the old bubble unmounted).
 *
 * Use it for help that explains what is already on screen. Anything a user must read to work
 * safely -- consent wording, safety rules, de-identification terms -- belongs in ProgressiveHelp,
 * which stays visible. #63 forbids moving that class of content into a bubble.
 *
 * `label` names the trigger ("Show help: …") and is the bubble's text. Pass `children` for richer
 * help, with `label` as its short title.
 */
export function InfoHint({
  label,
  children,
  size = 'md',
  side = 'bottom',
  className,
}: {
  label: string;
  children?: React.ReactNode;
  size?: keyof typeof triggerSizes;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    for (const other of openHints) other();
    openHints.add(close);
    return () => {
      openHints.delete(close);
    };
  }, [open, close]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        aria-label={`Show help: ${label}`}
        className={cn(
          // The 44px touch target is a centred pseudo-element, so the glyph sits at the size the
          // layout needs and the tap area still clears the contract's floor (MASTER.md section 8).
          'relative inline-flex shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors duration-fast',
          'before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
          'hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'data-[state=open]:bg-primary/10 data-[state=open]:text-primary',
          triggerSizes[size],
          className,
        )}
      >
        <CircleHelp aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          // A tooltip in behaviour: focus stays on the trigger, so Tab carries on through the page
          // and Escape hands back to where the user was.
          role="tooltip"
          side={side}
          align="center"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            'z-[120] w-72 max-w-[calc(100vw-24px)] rounded-lg border border-border/80 bg-popover px-4 py-3 text-left text-sm leading-6 text-popover-foreground shadow-md outline-none',
            // Scales from the trigger, not from its own centre. Exit is quicker than entry: the
            // user has already decided to move on.
            'origin-[--radix-popover-content-transform-origin]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100',
          )}
        >
          {children ? (
            <div className="space-y-1.5">
              <p className="font-semibold text-foreground">{label}</p>
              <div className="text-muted-foreground">{children}</div>
            </div>
          ) : (
            label
          )}
          <Popover.Arrow
            width={14}
            height={7}
            className="fill-popover [filter:drop-shadow(0_1px_0_hsl(var(--border)))]"
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
