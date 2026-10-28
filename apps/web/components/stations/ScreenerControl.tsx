'use client';

import { useEffect, useId, useState } from 'react';
import type { GetToken } from '@/lib/api';
import { setShiftScreener, type Screener } from '@/lib/stations';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError, fieldErrorId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * "Who is working on this account?" (#227). A volunteer without an account often screens on
 * someone else's; their name is kept on the shift until changed or check-out, and stamped on each
 * stop they finish. Saving needs a connection, like choosing a station.
 */
export function ScreenerControl({
  clinicId,
  shiftId,
  screenerName,
  isOnline,
  getToken,
  onSaved,
}: {
  clinicId: string;
  shiftId: string;
  /** The current screener; null when it's the account holder. */
  screenerName: string | null;
  isOnline: boolean;
  getToken: GetToken;
  onSaved: (screenerName: string | null) => void;
}) {
  const id = useId();
  const nameId = `${id}-name`;
  const hintId = `${id}-hint`;
  const [isHolder, setIsHolder] = useState(!screenerName);
  const [name, setName] = useState(screenerName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Follow the server's value when it changes elsewhere (another tab, check-out).
  useEffect(() => {
    setIsHolder(!screenerName);
    setName(screenerName ?? '');
  }, [screenerName]);

  const save = async (screener: Screener) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const result = await setShiftScreener(clinicId, shiftId, screener, getToken);
      setSaved(
        result.screenerName ? `Now recording as ${result.screenerName}.` : 'Now recording as you.',
      );
      onSaved(result.screenerName);
    } catch (cause) {
      // Keep what was saved before, and say so.
      setIsHolder(!screenerName);
      setName(screenerName ?? '');
      setError(
        `${cause instanceof Error ? cause.message : String(cause)} The previous choice is kept.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const disabled = !isOnline || busy;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-holder`}
          checked={isHolder}
          disabled={disabled}
          onCheckedChange={(checked) => {
            const next = checked === true;
            setIsHolder(next);
            setError(null);
            if (next && screenerName) void save({ isAccountHolder: true });
          }}
        />
        <Label htmlFor={`${id}-holder`}>I&apos;m the one screening</Label>
      </div>
      {!isHolder ? (
        <form
          // Our own inline error, not the browser's bubble; `required` stays for assistive tech.
          noValidate
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) {
              setError('Enter the name of the person screening.');
              return;
            }
            void save({ isAccountHolder: false, name: trimmed });
          }}
        >
          <Label htmlFor={nameId}>Name of the person screening</Label>
          <p id={hintId} className="text-xs text-muted-foreground">
            They don&apos;t need an account. Every patient you finish is recorded as seen by them,
            until you change this or end your shift.
          </p>
          <Input
            id={nameId}
            value={name}
            maxLength={120}
            required
            autoComplete="off"
            disabled={disabled}
            aria-describedby={`${hintId}${error ? ` ${fieldErrorId(nameId)}` : ''}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldError id={nameId} message={error ?? undefined} />
          <Button type="submit" size="sm" className="justify-self-start" disabled={disabled}>
            {busy ? 'Saving…' : 'Save name'}
          </Button>
        </form>
      ) : error ? (
        <InlineNotice tone="error">{error}</InlineNotice>
      ) : null}
      {saved ? <InlineNotice tone="success">{saved}</InlineNotice> : null}
      {!isOnline ? (
        <p className="text-xs text-muted-foreground">Changing this needs a connection.</p>
      ) : null}
    </div>
  );
}
