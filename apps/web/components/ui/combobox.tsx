'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A single-select control for a list too long to scroll.
 *
 * This exists because the IANA time zone list is roughly 420 entries. A Radix `Select` cannot
 * carry a filter -- its own typeahead consumes the keystrokes -- and 420 options on a 375px
 * screen is not a control anyone can use. It is a combobox rather than a second Select: the
 * design system has no `command` or `popover` primitive to build one from, and this is the
 * first list in the product that needs filtering.
 *
 * It follows the ARIA combobox pattern with a listbox popup: the input owns `role="combobox"`
 * and `aria-activedescendant`, so the active option is announced without focus ever leaving
 * the text field. Options are capped rather than virtualised -- a filtered list nobody can see
 * the end of is a prompt to keep typing, not a scrolling problem.
 */

export interface ComboboxOption {
  value: string;
  /** Optional heading this option sits under. Consecutive options share one heading. */
  group?: string;
  /** Secondary text shown after the value, e.g. "organization's zone". */
  note?: string;
}

/** Beyond this many matches the list is truncated and the reader is told to keep typing. */
const MAX_VISIBLE_OPTIONS = 50;

export interface ComboboxProps {
  id: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  /** Substring match. Defaults to a case-insensitive `includes`. */
  matches?: (value: string, query: string) => boolean;
  placeholder?: string;
  /** Announced with the input, for the empty and no-match cases. */
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
}

function defaultMatches(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export function Combobox({
  id,
  value,
  options,
  onChange,
  matches = defaultMatches,
  placeholder,
  emptyLabel = 'No matches. Try a different search.',
  disabled,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const listboxId = `${id}-listbox`;
  const statusId = `${id}-status`;

  const { visible, truncated } = React.useMemo(() => {
    const filtered = query.trim()
      ? options.filter((option) => matches(option.value, query))
      : options;
    return {
      visible: filtered.slice(0, MAX_VISIBLE_OPTIONS),
      truncated: Math.max(0, filtered.length - MAX_VISIBLE_OPTIONS),
    };
  }, [options, query, matches]);

  // Reopening starts from the current value rather than the top of the list, so a keyboard
  // user is not pushed back to "Africa/Abidjan" every time they check what is selected.
  React.useEffect(() => {
    if (!open) return;
    const selected = visible.findIndex((option) => option.value === value);
    setActiveIndex(selected >= 0 ? selected : 0);
    // Only when the popup opens; typing moves the index through its own handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  // Keep the active option in view when it moves by keyboard rather than by pointer.
  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (visible.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + step + visible.length) % visible.length);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      if (!open || visible.length === 0) return;
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : visible.length - 1);
      return;
    }

    if (event.key === 'Enter') {
      if (!open) return;
      // Only swallow Enter when it is actually choosing something, so it still submits
      // the surrounding form when the popup is closed or empty.
      const option = visible[activeIndex];
      if (!option) return;
      event.preventDefault();
      commit(option.value);
      return;
    }

    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      setQuery('');
      return;
    }

    if (event.key === 'Tab' && open) {
      setOpen(false);
      setQuery('');
    }
  };

  const activeOptionId = open && visible[activeIndex] ? `${id}-option-${activeIndex}` : undefined;
  const describedBy = [ariaDescribedBy, statusId].filter(Boolean).join(' ') || undefined;

  let lastGroup: string | undefined;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-invalid={ariaInvalid}
          aria-describedby={describedBy}
          aria-labelledby={ariaLabelledBy}
          placeholder={placeholder}
          // The input shows the selection when closed and the search term when open, so the
          // field never looks empty just because the popup is up.
          value={open ? query : value}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 pr-10 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive"
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
        />
      </div>

      {/* Polite, so a filtered count is announced without interrupting typing. */}
      <span id={statusId} role="status" aria-live="polite" className="sr-only">
        {open
          ? visible.length === 0
            ? emptyLabel
            : `${visible.length}${truncated ? '+' : ''} options available.`
          : ''}
      </span>

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        // Deliberately not the field's own label. The popup is owned by the combobox through
        // aria-controls, and naming it "Time zone" too gives the field's name to two elements.
        aria-label="Suggestions"
        hidden={!open}
        className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
      >
        {visible.length === 0 ? (
          <li className="px-3 py-2 text-muted-foreground">{emptyLabel}</li>
        ) : (
          visible.map((option, index) => {
            const heading = option.group && option.group !== lastGroup ? option.group : null;
            lastGroup = option.group;
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <React.Fragment key={option.value}>
                {heading ? (
                  <li
                    role="presentation"
                    className="px-3 pb-1 pt-2 text-eyebrow text-muted-foreground"
                  >
                    {heading}
                  </li>
                ) : null}
                <li
                  id={`${id}-option-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  // Pointer down rather than click: click fires after the input blurs, which
                  // closes the popup and cancels the selection.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(option.value);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors',
                    active && 'bg-accent text-accent-foreground',
                  )}
                >
                  <Check
                    aria-hidden="true"
                    className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="truncate">{option.value}</span>
                  {option.note ? (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {option.note}
                    </span>
                  ) : null}
                </li>
              </React.Fragment>
            );
          })
        )}
        {truncated > 0 ? (
          <li role="presentation" className="px-3 py-2 text-xs text-muted-foreground">
            {truncated} more {truncated === 1 ? 'match' : 'matches'}. Keep typing to narrow the
            list.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
