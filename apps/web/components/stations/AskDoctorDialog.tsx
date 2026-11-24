'use client';

import { useState } from 'react';
import { Loader2, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { showToast } from '@/components/ui/toast';
import type { GetToken } from '@/lib/api';
import {
  DOCTOR_REQUEST_REASONS,
  DOCTOR_REQUEST_URGENCIES,
  type DoctorRequest,
  type DoctorRequestReason,
  type DoctorRequestUrgency,
} from '@/lib/doctor-requests';
import { requestDoctor } from '@/lib/stations';
import { cn } from '@/lib/utils';

const OPTION =
  'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring';

/**
 * "Ask a doctor" from a station (#418). Needs a connection: a request that waits in an outbox
 * would tell nobody, so offline the button says so instead of queueing.
 */
export function AskDoctorButton({
  clinicId,
  visitId,
  isOnline,
  getToken,
  onSent,
}: {
  clinicId: string;
  visitId: string;
  isOnline: boolean;
  getToken: GetToken;
  onSent: (request: DoctorRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [urgency, setUrgency] = useState<DoctorRequestUrgency | null>(null);
  const [reason, setReason] = useState<DoctorRequestReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setUrgency(null);
    setReason(null);
    setError(null);
  };

  const send = async () => {
    if (!urgency) return;
    setBusy(true);
    setError(null);
    try {
      const sent = await requestDoctor(
        clinicId,
        visitId,
        { urgency, ...(reason ? { reason } : {}) },
        getToken,
      );
      onSent(sent);
      showToast({
        tone: 'success',
        title: 'Doctor asked',
        description: 'The doctors on shift were told. You will see here who is on it.',
      });
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not send. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!isOnline}
        title={isOnline ? undefined : 'Needs a connection'}
      >
        <Stethoscope aria-hidden="true" />
        {isOnline ? 'Ask a doctor' : 'Ask a doctor (needs a connection)'}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
        <DialogContent className="max-w-md rounded-lg border-border/80">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Ask a doctor</DialogTitle>
            <DialogDescription>
              The doctors on shift get a notification with this station and the patient&apos;s
              number, never their name.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">How soon</legend>
            {DOCTOR_REQUEST_URGENCIES.map((option) => (
              <label
                key={option.value}
                className={cn(
                  OPTION,
                  'grid grid-cols-[auto_1fr] gap-x-3 gap-y-0',
                  urgency === option.value && 'border-primary bg-selected',
                )}
              >
                <input
                  type="radio"
                  name="doctor-urgency"
                  value={option.value}
                  checked={urgency === option.value}
                  onChange={() => setUrgency(option.value)}
                  className="row-span-2 mt-0.5 accent-primary"
                />
                <span className="font-medium">{option.label}</span>
                <span className="text-muted-foreground">{option.description}</span>
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Why (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {DOCTOR_REQUEST_REASONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    OPTION,
                    'items-center rounded-full px-3 py-1.5',
                    reason === option.value && 'border-primary bg-selected font-medium',
                  )}
                >
                  <input
                    type="radio"
                    name="doctor-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => void send()} disabled={!urgency || busy || !isOnline}>
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              Send to doctors
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
