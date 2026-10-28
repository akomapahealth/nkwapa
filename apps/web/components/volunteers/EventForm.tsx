'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError, fieldErrorProps, focusFirstInvalid } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { clinicLocalToIso, isoToClinicLocal, type ScreeningEvent } from '@/lib/volunteers';

export interface EventFormValues {
  title: string;
  startsAt: string;
  endsAt: string;
  siteName: string;
  siteAddress: string | null;
  notes: string | null;
  notifyChange?: boolean;
}

type Errors = Partial<Record<'title' | 'startsAt' | 'endsAt' | 'siteName', string>>;
const ORDER = ['event-title', 'event-starts', 'event-ends', 'event-site'];

/**
 * Create or edit a screening day. Times are typed and shown in the clinic's timezone, whatever
 * the device's zone is, and sent as instants.
 */
export function EventForm({
  timezone,
  initial,
  hasNotifiedVolunteers = false,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  timezone: string;
  initial?: ScreeningEvent;
  /** Offer to email volunteers already told about this event when its details change. */
  hasNotifiedVolunteers?: boolean;
  submitLabel: string;
  disabled?: boolean;
  onSubmit: (values: EventFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startsAt, setStartsAt] = useState(
    initial ? isoToClinicLocal(initial.startsAt, timezone) : '',
  );
  const [endsAt, setEndsAt] = useState(initial ? isoToClinicLocal(initial.endsAt, timezone) : '');
  const [siteName, setSiteName] = useState(initial?.siteName ?? '');
  const [siteAddress, setSiteAddress] = useState(initial?.siteAddress ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [notifyChange, setNotifyChange] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const startIso = clinicLocalToIso(startsAt, timezone);
    const endIso = clinicLocalToIso(endsAt, timezone);
    const found: Errors = {};
    if (!title.trim()) found.title = 'Give the day a title.';
    if (!startIso) found.startsAt = 'Choose when it starts.';
    else if (!initial && new Date(startIso) < new Date()) {
      found.startsAt = 'A screening day must start in the future.';
    }
    if (!endIso) found.endsAt = 'Choose when it ends.';
    else if (startIso && endIso <= startIso) found.endsAt = 'The end must be after the start.';
    if (!siteName.trim()) found.siteName = 'Name the site.';
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstInvalid(
        {
          'event-title': found.title,
          'event-starts': found.startsAt,
          'event-ends': found.endsAt,
          'event-site': found.siteName,
        },
        ORDER,
      );
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        startsAt: startIso!,
        endsAt: endIso!,
        siteName: siteName.trim(),
        siteAddress: siteAddress.trim() || null,
        notes: notes.trim() || null,
        ...(initial ? { notifyChange } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="event-title">Title</Label>
        <Input
          id="event-title"
          value={title}
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          {...fieldErrorProps('event-title', errors.title)}
        />
        <FieldError id="event-title" message={errors.title} reserveSpace={submitted} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="event-starts">Starts ({timezone})</Label>
        <Input
          id="event-starts"
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          {...fieldErrorProps('event-starts', errors.startsAt)}
        />
        <FieldError id="event-starts" message={errors.startsAt} reserveSpace={submitted} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="event-ends">Ends ({timezone})</Label>
        <Input
          id="event-ends"
          type="datetime-local"
          value={endsAt}
          min={startsAt || undefined}
          onChange={(event) => setEndsAt(event.target.value)}
          {...fieldErrorProps('event-ends', errors.endsAt)}
        />
        <FieldError id="event-ends" message={errors.endsAt} reserveSpace={submitted} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="event-site">Site</Label>
        <Input
          id="event-site"
          value={siteName}
          maxLength={160}
          onChange={(event) => setSiteName(event.target.value)}
          {...fieldErrorProps('event-site', errors.siteName)}
        />
        <FieldError id="event-site" message={errors.siteName} reserveSpace={submitted} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="event-address">Address (optional)</Label>
        <Input
          id="event-address"
          value={siteAddress}
          maxLength={300}
          onChange={(event) => setSiteAddress(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="event-notes">Notes for volunteers (optional)</Label>
        <Textarea
          id="event-notes"
          value={notes}
          maxLength={1000}
          aria-describedby="event-notes-hint"
          onChange={(event) => setNotes(event.target.value)}
        />
        <p id="event-notes-hint" className="text-sm text-muted-foreground">
          Included in the roster email. Never write anything about a patient here.
        </p>
      </div>
      {initial && hasNotifiedVolunteers ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id="event-notify-change"
            checked={notifyChange}
            onCheckedChange={(checked) => setNotifyChange(checked === true)}
          />
          <Label htmlFor="event-notify-change" className="font-normal leading-snug">
            Notify rostered volunteers if the date, time or site changes
          </Label>
        </div>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || disabled}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
