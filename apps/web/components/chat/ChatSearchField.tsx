'use client';

import { Search } from 'lucide-react';

/** The rounded search field at the top of the chat lists. 16px text on touch, so iOS doesn't zoom. */
export function ChatSearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[var(--button-height)] w-full rounded-full border border-transparent bg-muted py-1.5 pl-9 pr-3 text-base outline-none transition-[border-color,box-shadow] duration-fast placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30 [@media(pointer:fine)]:text-sm"
      />
    </div>
  );
}
