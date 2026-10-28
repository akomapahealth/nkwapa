'use client';

import { useId, useState } from 'react';
import type { GetToken } from '@/lib/api';
import { correctPerformer, type StationVisit } from '@/lib/stations';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError, fieldErrorId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScreenerNameField } from './ScreenerControl';

/**
 * Fix who did a finished stop (#227), with a reason that goes to the audit trail. Offered where
 * `canCorrectPerformer` allows; the server makes the final call.
 */
export function PerformerCorrection({
  clinicId,
  stop,
  isOnline,
  getToken,
  onCorrected,
}: {
  clinicId: string;
  stop: StationVisit;
  isOnline: boolean;
  getToken: GetToken;
  onCorrected: (visit: StationVisit) => void;
}) {
  const id = useId();
  const account = stop.completedBy?.displayName ?? 'the account holder';
  const [open, setOpen] = useState(false);
  const [isHolder, setIsHolder] = useState(!stop.performedByName);
  const [name, setName] = useState(stop.performedByName ?? '');
  const [contactId, setContactId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ name?: string; reason?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0"
        disabled={!isOnline}
        title={isOnline ? undefined : 'Correcting needs a connection.'}
        onClick={() => setOpen(true)}
      >
        Correct who did this
      </Button>
    );
  }

  const reasonId = `${id}-reason`;
  return (
    <form
      noValidate
      data-testid="performer-correction"
      className="mt-2 grid gap-3 rounded-lg border p-3"
      aria-label={`Correct who did ${stop.station.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        const next = {
          name: !isHolder && !name.trim() ? 'Enter the name of the person screening.' : undefined,
          reason: reason.trim() ? undefined : 'Say why this is being corrected.',
        };
        setErrors(next);
        if (next.name || next.reason) return;
        setBusy(true);
        correctPerformer(
          clinicId,
          stop.id,
          isHolder
            ? { isAccountHolder: true, reason: reason.trim() }
            : {
                isAccountHolder: false,
                name: name.trim(),
                ...(contactId ? { volunteerContactId: contactId } : {}),
                reason: reason.trim(),
              },
          getToken,
        )
          .then((visit) => {
            setOpen(false);
            setReason('');
            onCorrected(visit);
          })
          .catch((cause) =>
            setErrors({ form: cause instanceof Error ? cause.message : String(cause) }),
          )
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-holder`}
          checked={isHolder}
          disabled={busy}
          onCheckedChange={(checked) => setIsHolder(checked === true)}
        />
        <Label htmlFor={`${id}-holder`}>{account} did this stop</Label>
      </div>
      {!isHolder ? (
        <ScreenerNameField
          id={`${id}-name`}
          label="Who actually did it"
          hint="The name is recorded on this stop only."
          value={name}
          pickedId={contactId}
          error={errors.name ?? null}
          disabled={busy}
          clinicId={clinicId}
          getToken={getToken}
          isOnline={isOnline}
          onChange={(next, pickedId) => {
            setName(next);
            setContactId(pickedId);
          }}
        />
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor={reasonId}>Reason for the correction</Label>
        <Input
          id={reasonId}
          value={reason}
          maxLength={500}
          required
          disabled={busy}
          aria-describedby={errors.reason ? fieldErrorId(reasonId) : undefined}
          aria-invalid={errors.reason ? true : undefined}
          onChange={(event) => setReason(event.target.value)}
        />
        <FieldError id={reasonId} message={errors.reason} />
      </div>
      {errors.form ? <InlineNotice tone="error">{errors.form}</InlineNotice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || !isOnline}>
          {busy ? 'Saving…' : 'Save correction'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setErrors({});
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
