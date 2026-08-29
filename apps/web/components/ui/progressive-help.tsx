import { BookOpen, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Help that stays on the page.
 *
 * The counterpart to InfoHint, and the split between them is deliberate:
 *
 *   InfoHint         one sentence that helps you read what is already on screen. Floats over the
 *                    page, changes no layout, and is fine to miss.
 *   ProgressiveHelp  content a user is expected to actually read -- safety rules, what stays
 *                    protected on a record, the terms a de-identified export is governed by.
 *                    It is visible before it is opened, and #63 forbids moving this class of
 *                    content into a bubble.
 *
 * They used to share the CircleHelp glyph, so two affordances that behave completely differently
 * -- one floats, one pushes the page down -- were indistinguishable until you clicked. This one
 * is a book: something to read, not something to peek at.
 */
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
          'flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BookOpen aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
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
