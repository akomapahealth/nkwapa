import { ChevronDown, CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ProgressiveHelp({
  title = 'How this works',
  children,
  className,
  contentClassName,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <details
      className={cn(
        'group w-full rounded-lg border border-border/70 bg-background/80 shadow-sm',
        className,
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CircleHelp className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div
        className={cn(
          'border-t border-border/70 px-4 pb-4 pt-3 text-sm leading-6 text-muted-foreground',
          contentClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
