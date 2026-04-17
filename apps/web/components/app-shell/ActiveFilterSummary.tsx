'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ActiveFilterSummaryItem {
  label: string;
  value: string | number | null | undefined;
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
}: {
  items: ActiveFilterSummaryItem[];
  emptyLabel?: string;
  className?: string;
}) {
  const visibleItems = items.filter((item) => hasValue(item.value));

  if (visibleItems.length === 0 && !emptyLabel) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {visibleItems.length > 0
        ? visibleItems.map((item) => (
            <Badge
              key={`${item.label}-${item.value}`}
              variant="outline"
              className="rounded-full px-3 py-1"
            >
              {item.label}: {item.value}
            </Badge>
          ))
        : null}
      {visibleItems.length === 0 && emptyLabel ? (
        <Badge variant="outline" className="rounded-full px-3 py-1 text-muted-foreground">
          {emptyLabel}
        </Badge>
      ) : null}
    </div>
  );
}
