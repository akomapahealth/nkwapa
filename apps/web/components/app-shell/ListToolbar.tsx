'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/*
  The list toolbar every list tab shares (MASTER "Lists (W3)"): one full-width search, then a row
  of filter chips. The dashed chip opens the rest of the filters in a sheet; each set filter is a
  chip that removes itself. Pages keep their own state; this only draws it.
*/

/** A filter select that sits in a toolbar row with a quiet inline label beside it. */
export const TOOLBAR_SELECT =
  'h-[var(--button-height-sm)] min-h-[var(--button-height-sm)] w-auto gap-2 bg-transparent px-2.5 text-sm font-medium';

/** The one search a list leads with. `/` focuses it on pages that register the shortcut. */
export function ListSearch({
  id,
  label,
  value,
  onChange,
  placeholder,
  help = 'Results update as you type. Press Escape to clear.',
  shortcut = false,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
  /** Shows the `/` hint; the page owns the key listener. */
  shortcut?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) onChange('');
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${id}-help`}
        className="bg-surface-2 pl-10 pr-12 focus-visible:bg-card [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
            document.getElementById(id)?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : shortcut ? (
        // A mouse-and-keyboard affordance; touch screens never see it.
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 place-items-center rounded-sm bg-card px-1.5 font-mono text-xs font-medium text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)),0_1px_0_hsl(var(--border))] [@media(hover:hover)]:sm:grid"
        >
          /
        </kbd>
      ) : null}
      <p id={`${id}-help`} className="sr-only">
        {help}
      </p>
    </div>
  );
}

export interface ListFilterChip {
  label: string;
  value: string | number | null | undefined;
  /** Omit for context that cannot be removed (it renders as a quiet tag, not a button). */
  onRemove?: () => void;
}

/** Right on a wide screen, a bottom sheet on a phone. */
function useWideSheet(minWidth = 600) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [minWidth]);
  return wide;
}

/**
 * The dashed Filter chip, its sheet, and the chips for what is set.
 *
 * `children` is the sheet body (the page's own fields). Without children there is no Filter chip,
 * only the chips (for a list whose filters are all in the search or in tabs).
 */
export function ListFilters({
  groupLabel,
  sheetTitle,
  sheetDescription = 'Filters update results immediately.',
  sheetBreakpoint = 600,
  chips,
  onClearAll,
  open,
  onOpenChange,
  children,
  trailing,
  className,
}: {
  /** Names the chip row, e.g. "Patient filters". */
  groupLabel: string;
  /** Also the Filter chip's accessible name, e.g. "Filter patients". */
  sheetTitle: string;
  sheetDescription?: string;
  /** Below this width, use a bottom sheet. */
  sheetBreakpoint?: number;
  chips: ListFilterChip[];
  onClearAll?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  /** Pinned to the right, outside the scrolling chips (a sort control, a count). */
  trailing?: ReactNode;
  className?: string;
}) {
  const wideSheet = useWideSheet(sheetBreakpoint);
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const set = chips.filter((chip) =>
    typeof chip.value === 'number' ? true : Boolean(chip.value && String(chip.value).trim()),
  );
  const removable = set.filter((chip) => chip.onRemove);

  return (
    <div className={cn('flex items-start gap-2', className)}>
      {/* On a phone the row scrolls sideways instead of wrapping into a block. */}
      <div
        className="-ml-4 flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 pl-4 [scrollbar-width:none] compact:ml-0 compact:flex-wrap compact:overflow-visible compact:pl-0"
        aria-label={groupLabel}
        role="group"
      >
        {children ? (
          <Sheet open={isOpen} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-dashed bg-transparent text-muted-foreground hover:text-foreground"
                aria-label={sheetTitle}
              >
                <SlidersHorizontal aria-hidden="true" /> Filter
              </Button>
            </SheetTrigger>
            <SheetContent
              side={wideSheet ? 'right' : 'bottom'}
              className={cn(
                'flex flex-col bg-card p-0 pb-[env(safe-area-inset-bottom)]',
                wideSheet ? 'w-full sm:max-w-lg' : 'max-h-[90dvh] rounded-t-xl',
              )}
            >
              <SheetHeader className="shrink-0 px-5 pb-4 text-left">
                <SheetTitle className="pr-12 font-body">{sheetTitle}</SheetTitle>
                <SheetDescription>{sheetDescription}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 [&_.grid]:grid-cols-1 [&_.grid]:compact:grid-cols-2">
                {children}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-5 py-4">
                {onClearAll ? (
                  <Button variant="outline" onClick={onClearAll}>
                    Clear all filters
                  </Button>
                ) : null}
                <SheetClose asChild>
                  <Button>Show results</Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
        {set.map((chip) =>
          chip.onRemove ? (
            <Button
              key={chip.label}
              variant="outline"
              size="sm"
              className="h-auto max-w-[min(20rem,80vw)] shrink-0 gap-1.5 whitespace-normal py-1.5 text-left font-medium"
              aria-label={`Remove ${chip.label} filter`}
              onClick={chip.onRemove}
            >
              <span className="min-w-0 break-words">
                <span className="font-normal text-muted-foreground">{chip.label}</span> {chip.value}
              </span>
              <X aria-hidden="true" className="!size-3.5 shrink-0" />
            </Button>
          ) : (
            <span
              key={chip.label}
              className="inline-flex h-[var(--button-height-sm)] shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-sm font-medium text-foreground"
            >
              <span className="font-normal text-muted-foreground">{chip.label}</span>
              {chip.value}
            </span>
          ),
        )}
        {onClearAll && removable.length ? (
          <Button variant="link" size="sm" className="shrink-0" onClick={onClearAll}>
            Clear all filters
          </Button>
        ) : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
