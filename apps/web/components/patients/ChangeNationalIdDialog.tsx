'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, type GetToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { InlineNotice } from '@/components/feedback/InlineNotice';

type IdType = 'NATIONAL_ID' | 'VOTER_ID' | 'PASSPORT' | 'OTHER' | 'NONE';

export interface ChangedNationalId {
  nationalIdType: string;
  nationalIdLast4: string | null;
}

interface Clash {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
}

/**
 * Record, add or correct a chart's ID document (#214), for a patient registered with no ID who
 * comes back with one, or an ID typed wrong at registration.
 *
 * Online only: the server has to check the new ID against every chart, and a device cannot. The
 * reason is required because it is the only explanation the audit trail will carry.
 */
export function ChangeNationalIdDialog({
  open,
  onOpenChange,
  clinicId,
  patientId,
  getToken,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  patientId: string;
  getToken: GetToken | null | undefined;
  onChanged: (next: ChangedNationalId) => void;
}) {
  const [type, setType] = useState<IdType>('NATIONAL_ID');
  const [number, setNumber] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);

  const reset = () => {
    setType('NATIONAL_ID');
    setNumber('');
    setReason('');
    setError(null);
    setClash(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!getToken) return;
    setSaving(true);
    setError(null);
    setClash(null);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/national-id`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            nationalIdType: type,
            nationalId: type === 'NONE' ? undefined : number,
            reason,
          }),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (response.status === 409) {
        const payload = (await response.json()) as {
          message?: string;
          details?: { existingPatient?: Clash };
        };
        if (payload.details?.existingPatient) setClash(payload.details.existingPatient);
        else setError(payload.message ?? 'Another patient already has this ID.');
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: unknown } | null;
        setError(
          typeof payload?.message === 'string' ? payload.message : 'The ID could not be changed.',
        );
        return;
      }
      onChanged((await response.json()) as ChangedNationalId);
      reset();
      onOpenChange(false);
    } catch {
      setError('The ID can only be changed while online. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Change ID document</DialogTitle>
            <DialogDescription>
              Nkwapa checks the new ID against every chart before saving it. The reason is kept in
              the audit trail; the full number is not.
            </DialogDescription>
          </DialogHeader>

          {clash ? (
            <InlineNotice tone="error">
              {clash.firstName} {clash.lastName} ({clash.patientCode}) already has this ID.{' '}
              <Link className="underline" href={`/clinics/${clinicId}/patients/${clash.id}`}>
                Open that chart
              </Link>{' '}
              to check whether they are the same person; duplicate review can combine the charts.
            </InlineNotice>
          ) : null}
          {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

          <div className="space-y-2">
            <Label htmlFor="change-id-type">ID type</Label>
            <Select value={type} onValueChange={(value) => setType(value as IdType)}>
              <SelectTrigger id="change-id-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NATIONAL_ID">National ID (Ghana Card)</SelectItem>
                <SelectItem value="VOTER_ID">Voter ID</SelectItem>
                <SelectItem value="PASSPORT">Passport</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
                <SelectItem value="NONE">No ID document</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === 'NONE' ? (
            <p className="text-sm text-muted-foreground">
              The chart will be identified by its patient code until an ID is added.
            </p>
          ) : (
            <div className="space-y-2">
              <FieldLabel htmlFor="change-id-number" required>
                ID number
              </FieldLabel>
              <Input
                id="change-id-number"
                required
                autoComplete="off"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <FieldLabel htmlFor="change-id-reason" required>
              Reason
            </FieldLabel>
            <Textarea
              id="change-id-reason"
              required
              minLength={3}
              maxLength={300}
              placeholder="e.g. Brought their Ghana Card; ID mistyped at registration"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save ID'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
