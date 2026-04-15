'use client';

import Tooltip from '@mui/material/Tooltip';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function InfoHint({ label, className }: { label: string; className?: string }) {
  return (
    <Tooltip
      title={label}
      arrow
      enterTouchDelay={0}
      leaveTouchDelay={4000}
      slotProps={{
        tooltip: {
          sx: {
            maxWidth: 280,
            borderRadius: '14px',
            backgroundColor: 'hsl(var(--foreground))',
            color: 'hsl(var(--background))',
            fontSize: '0.75rem',
            lineHeight: 1.6,
            px: 1.5,
            py: 1,
          },
        },
        arrow: {
          sx: {
            color: 'hsl(var(--foreground))',
          },
        },
      }}
    >
      <button
        type="button"
        aria-label={label}
        className={cn(
          'touch-target inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className,
        )}
      >
        <CircleHelp className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
