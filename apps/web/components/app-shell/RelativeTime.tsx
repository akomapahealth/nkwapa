'use client';

import { useState } from 'react';

import { formatOpsDateTime } from '@/lib/ops';
import { formatRelativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';

const WEEK_MS = 7 * 86_400_000;

/**
 * A list-row moment: "12 min ago" for the last week, the clinic-time date beyond it or in the
 * future. The exact clinic time is always one hover away in the title and in `dateTime`.
 * shortcut: the label does not tick while the page stays open; add a timer if rows need to stay live.
 */
export function RelativeTime({ value, className }: { value: string; className?: string }) {
  // Read once per mount so a re-render never changes the label under the reader.
  const [now] = useState(Date.now);
  const age = now - new Date(value).getTime();
  if (Number.isNaN(age)) return null;
  const absolute = formatOpsDateTime(value);
  const label = age >= 0 && age < WEEK_MS ? formatRelativeTime(value, now) : absolute;
  return (
    // Server and client clocks can straddle a minute boundary; the text is allowed to differ.
    <time
      dateTime={value}
      title={absolute}
      className={cn('whitespace-nowrap tabular-nums', className)}
      suppressHydrationWarning
    >
      {label}
    </time>
  );
}
