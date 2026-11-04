import { cn } from '@/lib/utils';

/** A section's head in the Ruled Chart direction: the 2px ink rule, unlabelled (#282 removed the kickers). */
export function SectionRule({ className }: { className?: string }) {
  return <div aria-hidden className={cn('border-t-2 border-foreground', className)} />;
}
