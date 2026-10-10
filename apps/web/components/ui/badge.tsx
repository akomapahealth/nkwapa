import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
        outline: 'text-foreground',
        // Workflow and status states. Tint plus same-hue ink, per docs/design-system/MASTER.md.
        // The ink tokens are darker than the fill tokens on purpose: using the fill colour as
        // text on its own tint measures 4.28:1 for success and 2.42:1 for warning, both below
        // AA. These clear it with headroom, and resolve correctly in dark mode.
        //
        // Draft is intentionally neutral. A draft note is not a warning, and colouring it amber
        // put it in the same visual class as an out-of-range value.
        draft: 'border-transparent bg-muted text-muted-foreground',
        review: 'border-transparent bg-info/12 text-info-ink',
        finalized: 'border-transparent bg-success/12 text-success-ink',
        warning: 'border-transparent bg-warning/12 text-warning-ink',
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
