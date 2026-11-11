import * as React from 'react';

import { cn } from '@/lib/utils';

export interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pin the first child to the start edge: a wizard's Back, or a status note beside Save. */
  split?: boolean;
}

/**
 * The row that ends a form (MASTER section 8). From 600px it is right-aligned with the primary
 * action last, the way dialogs already are. On phones the actions stack full width and, because
 * the row is reversed, the primary (last child) sits on top.
 */
export function FormActions({ className, split = false, ...props }: FormActionsProps) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-rule pt-4 compact:flex-row compact:flex-wrap compact:items-center compact:justify-end [&>*]:w-full [&>*]:max-w-full [&>button]:h-auto [&>button]:whitespace-normal compact:[&>*]:w-auto',
        split && 'compact:[&>*:first-child]:mr-auto',
        className,
      )}
      {...props}
    />
  );
}
