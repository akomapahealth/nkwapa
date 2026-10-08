import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-fast ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        gold: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // 44 pixels is the minimum comfortable touch target, and these are used on phones in
      // clinics. The default used to be 40, which is why panels were sprinkling on
      // some buttons and not others.
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-11 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-md px-8',
        icon: 'h-11 w-11',
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
