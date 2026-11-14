import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A save row that stays at the bottom of the screen while its form scrolls (data-entry flows:
 * interviews, stations, vitals, registration, the wizard). Pair it with `data-sticky-actions`,
 * which lets <main> stop being a scroll container on that page (globals.css). The right padding
 * clears the chat launcher; the bottom offset clears the phone nav.
 */
export const STICKY_ACTIONS =
  'sticky z-20 bottom-[calc(var(--workspace-bottom-nav-height,0px)+env(safe-area-inset-bottom))] border-t border-rule bg-card py-3 pr-[4.5rem]';

export interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pin the first child to the start edge: a wizard's Back, or a status note beside Save. */
  split?: boolean;
  /** Keep the row at the bottom of the screen while the form scrolls. */
  sticky?: boolean;
}

/**
 * The row that ends a form (MASTER section 8). From 600px it is right-aligned with the primary
 * action last, the way dialogs already are. On phones the actions stack full width and, because
 * the row is reversed, the primary (last child) sits on top.
 */
export function FormActions({
  className,
  split = false,
  sticky = false,
  ...props
}: FormActionsProps) {
  return (
    <div
      data-sticky-actions={sticky ? '' : undefined}
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-rule pt-4 compact:flex-row compact:flex-wrap compact:items-center compact:justify-end [&>*]:w-full [&>*]:max-w-full [&>button]:h-auto [&>button]:whitespace-normal compact:[&>*]:w-auto',
        split && 'compact:[&>*:first-child]:mr-auto',
        sticky && STICKY_ACTIONS,
        className,
      )}
      {...props}
    />
  );
}
