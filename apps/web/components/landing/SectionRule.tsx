import { cn } from '@/lib/utils';

/** A section's head in the Ruled Chart direction: the 2px ink rule, with the section named on it. */
export function SectionRule({ children, className }: { children: string; className?: string }) {
  return (
    <p className={cn('border-t-2 border-foreground pt-3 text-sm font-semibold', className)}>
      {children}
    </p>
  );
}
