import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'relative inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-semibold transition-[color,background-color,border-color,transform] duration-fast ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Flat fills, as in the R0 pilot: hierarchy comes from fill against line, not shadow.
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/95',
        // R0-AUDIT A4: secondary actions are a white fill with the 3:1 --input boundary, so
        // they read as buttons on the sheet instead of as disabled text or a quiet outline.
        outline: 'border border-input bg-card text-foreground hover:bg-muted',
        // Same as outline. It used to be the logo gold, which is an accent, never a state; `gold`
        // keeps that fill for the few places that want it.
        secondary: 'border border-input bg-card text-foreground hover:bg-muted',
        gold: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
        // Pilot `.btn-teal`: the row's action in a list where a filled button on every row
        // would shout. Teal text carries the contrast; the 55% border only outlines it.
        primaryOutline:
          'border border-[hsl(var(--primary)/0.55)] bg-transparent text-primary hover:border-primary hover:bg-selected',
        ghost: 'hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // Heights come from the pointer-aware tokens in globals.css (MASTER section 8): 44px under
      // touch, 36px (32px small) on a mouse. The min-height keeps the floor when a call site sets
      // `h-auto` so a long label can wrap. Small and icon buttons are below 44px on a mouse, so
      // a centred pseudo-element keeps their hit area at 44px. Small buttons are never narrower
      // than 44px and extend only vertically, so the hit area cannot widen a row past its edge.
      size: {
        default:
          'h-[var(--button-height)] min-h-[var(--button-height)] min-w-[var(--button-height)] px-4 py-2',
        sm: "h-[var(--button-height-sm)] min-h-[var(--button-height-sm)] min-w-11 px-3 text-xs [@media(pointer:fine)]:after:absolute [@media(pointer:fine)]:after:inset-x-0 [@media(pointer:fine)]:after:-inset-y-1.5 [@media(pointer:fine)]:after:content-['']",
        lg: 'h-[var(--button-height-lg)] min-h-[var(--button-height-lg)] min-w-[var(--button-height-lg)] px-6',
        icon: "h-[var(--button-height)] w-[var(--button-height)] min-w-[var(--button-height)] [@media(pointer:fine)]:after:absolute [@media(pointer:fine)]:after:-inset-1 [@media(pointer:fine)]:after:content-['']",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * The action is in flight. The label stays in place (invisible) under a spinner, so the button
   * keeps its width and nothing beside it moves -- MASTER.md section 11. The button is disabled
   * and `aria-busy` while loading. Ignored with `asChild`, which has no box of its own to hold.
   */
  loading?: boolean;
}

/*
  Press feedback is a 3% scale on :active -- a response to the press, not a hover effect, so it
  does not break section 7's "no transform-based hover" rule, and it never shifts layout because
  scale does not change the box.
*/
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
          // Passed through as before: Slot's props are typed for any element, not a button.
          {...({ disabled } as React.HTMLAttributes<HTMLElement>)}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <span className="invisible inline-flex items-center gap-2">{children}</span>
            <span className="absolute inset-0 inline-flex items-center justify-center">
              <Loader2 aria-hidden="true" className="animate-spin" />
            </span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
