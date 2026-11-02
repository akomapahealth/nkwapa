'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const DEFAULT_REGION = 'GH' as const;

export interface PhoneInputProps {
  value?: string;
  onChange?: (e164: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * Phone input component locked to Ghana (GH).
 * Country selector is fixed to +233. Outputs E.164 when valid.
 */
export function PhoneInput({
  value = '',
  onChange,
  placeholder = '024 123 4567',
  disabled = false,
  className,
  id,
}: PhoneInputProps) {
  const [raw, setRaw] = useState(value);

  useEffect(() => {
    setRaw(value);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setRaw(next);
      const parsed = parsePhoneNumberFromString(next, DEFAULT_REGION);
      const e164 = parsed?.isValid() ? parsed.format('E.164') : '';
      onChange?.(e164);
    },
    [onChange],
  );

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span
        className="inline-flex h-11 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
        title="Ghana"
      >
        +233
      </span>
      <Input
        type="tel"
        id={id}
        value={raw}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('min-w-0 flex-1', className)}
        autoComplete="tel"
        aria-label="Phone number (Ghana)"
      />
    </div>
  );
}
