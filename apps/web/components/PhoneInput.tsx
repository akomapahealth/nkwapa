"use client";

import { useCallback, useEffect, useState } from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const DEFAULT_REGION: "GH" = "GH";

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
  value = "",
  onChange,
  placeholder = "024 123 4567",
  disabled = false,
  className,
  id,
}: PhoneInputProps) {
  const [raw, setRaw] = useState(value);

  useEffect(() => {
    if (value !== raw) setRaw(value);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setRaw(next);
      const parsed = parsePhoneNumberFromString(next, DEFAULT_REGION);
      const e164 = parsed?.isValid() ? parsed.format("E.164") : "";
      onChange?.(e164);
    },
    [onChange]
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
      <span
        style={{
          padding: "0.375rem 0.5rem",
          background: "#f5f5f5",
          border: "1px solid #ccc",
          borderRadius: "4px 0 0 4px",
          fontSize: "0.875rem",
          color: "#666",
        }}
        title="Ghana"
      >
        +233
      </span>
      <input
        type="tel"
        id={id}
        value={raw}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="tel"
        aria-label="Phone number (Ghana)"
        style={{
          padding: "0.375rem 0.5rem",
          border: "1px solid #ccc",
          borderRadius: "0 4px 4px 0",
          flex: 1,
        }}
      />
    </div>
  );
}
