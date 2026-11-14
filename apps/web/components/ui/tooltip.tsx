'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';
import { useOverlayInput } from './use-overlay-input';

/*
  shadcn tooltip, adopted in #263 for one job: naming icon-only navigation, the collapsed rail and
  the header's message delivery icon (MASTER.md section 13). Contextual help stays with InfoHint. Radix opens it on hover and on keyboard focus,
  and Escape dismisses it.
*/
function TooltipProvider({
  skipDelayDuration = 300,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider skipDelayDuration={skipDelayDuration} {...props} />;
}

function Tooltip(props: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  useOverlayInput();
  return <TooltipPrimitive.Root {...props} />;
}

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[120] rounded-md border border-border/80 bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-md',
        'origin-[--radix-tooltip-content-transform-origin]',
        'anchored-overlay anchored-tooltip',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
