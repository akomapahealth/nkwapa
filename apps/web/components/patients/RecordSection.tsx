import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Patient-chart grouping on the canvas. Floating dialogs retain the shared Card primitive. */
export function RecordSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('min-w-0 border-t-2 border-rule-strong', className)} {...props} />;
}

export function RecordSectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1.5 pb-3 pt-4', className)} {...props} />;
}

export function RecordSectionContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pb-5', className)} {...props} />;
}

export function RecordSectionDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('type-label font-normal text-muted-foreground', className)} {...props} />
  );
}

export function RecordSectionTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('type-section-title', className)} {...props}>
      {children}
    </h2>
  );
}
