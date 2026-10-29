'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ActiveFilterSummaryItem {
  label: string;
  value: string | number | null | undefined;
  /** When given, the chip carries a button that clears just this filter. */
  onRemove?: () => void;
}

function hasValue(value: ActiveFilterSummaryItem['value']) {
  if (typeof value === 'number') {
    return true;
  }

  return Boolean(value && String(value).trim());
}

export function ActiveFilterSummary({
  items,
  emptyLabel,
  className,
  onClearAll,
}: {
  items: ActiveFilterSummaryItem[];
  emptyLabel?: string;
  className?: string;
  /** Shown as "Clear all filters" once two or more filters are active. */
  onClearAll?: () => void;
}) {
  const visibleItems = items.filter((item) => hasValue(item.value));

  if (visibleItems.length === 0 && !emptyLabel) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {visibleItems.length > 0
        ? visibleItems.map((item) => (
            <Badge
              key={`${item.label}-${item.value}`}
              variant="outline"
              className={cn('rounded-full px-3 py-1', item.onRemove && 'gap-1 py-0 pr-0')}
            >
              {item.label}: {item.value}
              {item.onRemove ? (
                <button
                  type="button"
                  onClick={item.onRemove}
                  aria-label={`Remove ${item.label} filter`}
                  className="relative inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </Badge>
          ))
        : null}
      {onClearAll && visibleItems.length > 1 ? (
        <Button type="button" variant="link" size="sm" onClick={onClearAll} className="px-2">
          Clear all filters
        </Button>
      ) : null}
      {visibleItems.length === 0 && emptyLabel ? (
        <Badge variant="outline" className="rounded-full px-3 py-1 text-muted-foreground">
          {emptyLabel}
        </Badge>
      ) : null}
    </div>
  );
}
