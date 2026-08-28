import * as React from 'react';

import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // No hover treatment, and no translucency.
        //
        // The border used to lighten on hover on every card in the product, including the ones
        // that are not clickable, which is a promise the card cannot keep. Cards that really are
        // links carry their own hover at the call site.
        //
        // The surface is opaque. It was `bg-card/92`, which existed to let the shell's decorative
        // background gradient show through; that gradient is gone, so the alpha only cost contrast
        // on the text sitting on it.
        'rounded-lg border border-border/80 bg-card text-card-foreground shadow-sm shadow-black/5',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

/**
 * A card's title, as a real heading.
 *
 * shadcn ships this as a `div`, and that one default put the product's two halves in permanent
 * disagreement: the patient chart panels deliberately hand-rolled `<h2>` and `<h3>` to keep a
 * heading landmark, while the portal used `CardTitle` throughout and consequently had almost no
 * heading structure for a screen reader to navigate by. Neither half was wrong about its own
 * needs; the primitive was.
 *
 * `as` defaults to `h3`, which is right for a panel sitting under a page `<h1>` and a section
 * `<h2>`. Pass `as="h2"` for a top-level panel, or `as="div"` for the rare card whose title is
 * genuinely not a heading -- a dialog title already labelled by its own primitive, say.
 */
type CardTitleElement = 'h2' | 'h3' | 'h4' | 'div';

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: CardTitleElement }
>(({ className, as: Comp = 'h3', ...props }, ref) => (
  <Comp
    ref={ref}
    className={cn('font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
