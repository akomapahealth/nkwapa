import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// The pilot `.tag`: 24px tall, 4px radius, 12.5px semibold. `min-h-6` rather than a fixed
// height so a long label wraps instead of overflowing a phone row. No hover: a tag is not a
// control, and the ones that are links carry their own affordance at the call site.
const badgeVariants = cva(
  'inline-flex min-h-6 items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[12.5px] font-semibold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        // Neutral (pilot `.tag-neutral`). This was logo gold, which made "Closed", "Deactivated"
        // and station kinds look like highlights. Gold is an accent, never a state: use `gold`.
        secondary: 'border-border bg-surface-2 text-muted-foreground',
        // Selected or suggested (pilot `.tag-info`).
        info: 'border-transparent bg-selected text-primary',
        // Highlights only, such as a "new" marker. Never a status.
        gold: 'border-transparent bg-gold-surface text-gold-ink',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
        // Workflow and status states. Tint plus same-hue ink, per docs/design-system/MASTER.md.
        // The ink tokens are darker than the fill tokens on purpose: using the fill colour as
        // text on its own tint measures 4.28:1 for success and 2.42:1 for warning, both below
        // AA. These clear it with headroom, and resolve correctly in dark mode.
        //
        // Draft is intentionally neutral. A draft note is not a warning, and colouring it amber
        // put it in the same visual class as an out-of-range value.
        draft: 'border-transparent bg-muted text-muted-foreground',
        review: 'border-transparent bg-info-surface text-info-ink',
        finalized: 'border-transparent bg-success-surface text-success-ink',
        warning: 'border-transparent bg-warning-surface text-warning-ink',
        // Stage 2 blood pressure: stronger than warning, short of the filled destructive tag.
        severe: 'border-transparent bg-severe-surface text-severe-ink',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
