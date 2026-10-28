'use client';

import { useEffect, useId, useState } from 'react';
import type { GetToken } from '@/lib/api';
import { fetchScreenerNames, setShiftScreener, type Screener } from '@/lib/stations';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError, fieldErrorId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** How many directory names show under the field; typing narrows them. */
const SUGGESTION_LIMIT = 8;

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
  const [isHolder, setIsHolder] = useState(!screenerName);
  const [name, setName] = useState(screenerName ?? '');
  const [contactId, setContactId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Follow the server's value when it changes elsewhere (another tab, check-out).
  useEffect(() => {
    setIsHolder(!screenerName);
    setName(screenerName ?? '');
    setContactId(null);
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
      setContactId(null);
      setError(
        `${cause instanceof Error ? cause.message : String(cause)} The previous choice is kept.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const disabled = !isOnline || busy;
  return (
    <div className="grid gap-3" data-testid="screener-control">
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
            void save({
              isAccountHolder: false,
              name: trimmed,
              ...(contactId ? { volunteerContactId: contactId } : {}),
            });
          }}
        >
          <ScreenerNameField
            id={nameId}
            label="Name of the person screening"
            hint="They don't need an account. Every patient you finish is recorded as seen by them, until you change this or end your shift."
            value={name}
            pickedId={contactId}
            error={error}
            disabled={disabled}
            clinicId={clinicId}
            getToken={getToken}
            isOnline={isOnline}
            onChange={(next, pickedId) => {
              setName(next);
              setContactId(pickedId);
            }}
          />
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

/**
 * The screener's name (#227), free text, with the clinic's volunteer directory (#226) offered as
 * buttons below it. Anyone can screen, listed or not; picking a listed person sends their contact
 * id with the name, and typing afterwards drops it.
 */
export function ScreenerNameField({
  id,
  label,
  hint,
  value,
  pickedId,
  error,
  disabled,
  clinicId,
  getToken,
  isOnline,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  /** The directory contact the value was picked from, if any. */
  pickedId: string | null;
  error: string | null;
  disabled: boolean;
  clinicId: string;
  getToken: GetToken;
  isOnline: boolean;
  onChange: (value: string, volunteerContactId: string | null) => void;
}) {
  const hintId = `${id}-hint`;
  const [contacts, setContacts] = useState<Array<{ name: string; volunteerContactId: string }>>([]);

  useEffect(() => {
    if (!isOnline) return;
    let current = true;
    fetchScreenerNames(clinicId, getToken)
      .then((result) => current && setContacts(result.items))
      // Suggestions are a convenience; typing a name still works without them.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [clinicId, getToken, isOnline]);

  const query = value.trim().toLowerCase();
  const suggestions = contacts
    .filter((contact) => !query || contact.name.toLowerCase().includes(query))
    .slice(0, SUGGESTION_LIMIT);

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>
      <Input
        id={id}
        value={value}
        maxLength={120}
        required
        autoComplete="off"
        disabled={disabled}
        aria-describedby={`${hintId}${error ? ` ${fieldErrorId(id)}` : ''}`}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          onChange(event.target.value, null);
        }}
      />
      {suggestions.length ? (
        <div role="group" aria-label="Volunteers in the directory" className="flex flex-wrap gap-2">
          {suggestions.map((contact) => (
            <Button
              key={contact.volunteerContactId}
              type="button"
              size="sm"
              variant={pickedId === contact.volunteerContactId ? 'default' : 'outline'}
              aria-pressed={pickedId === contact.volunteerContactId}
              disabled={disabled}
              onClick={() => onChange(contact.name, contact.volunteerContactId)}
            >
              {contact.name}
            </Button>
          ))}
        </div>
      ) : null}
      <FieldError id={id} message={error ?? undefined} />
    </div>
  );
}
