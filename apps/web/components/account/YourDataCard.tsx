'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/ops/OpsShared';
import { FormActions } from '@/components/ui/form-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  DATA_REQUEST_STATUS_LABEL,
  DATA_REQUEST_TYPES,
  createMyDataRequest,
  dataRequestTypeLabel,
  describeDataRequestDue,
  listMyDataRequests,
  type DataRequestType,
  type PatientDataRequest,
} from '@/lib/data-requests';
import { formatInviteDate } from '@/lib/portal-invite';
import { PRIVACY_HREF } from '@/components/landing/links';

/**
 * A patient's data rights, where they manage their account: ask for a copy, a correction, a
 * deletion or a limit, and see each answer. The clinic answers within 30 days.
 */
export function YourDataCard() {
  const getToken = useAuth();
  const clinicId = useBootstrap()?.activeClinicId ?? null;
  const [requests, setRequests] = useState<PatientDataRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<DataRequestType>('ACCESS');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const hint = DATA_REQUEST_TYPES.find((entry) => entry.value === type)?.patientHint;

  const load = useCallback(async () => {
    if (!getToken || !clinicId) return;
    setLoadError(null);
    try {
      setRequests(await listMyDataRequests(clinicId, getToken));
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Your requests could not be loaded.'));
    }
  }, [clinicId, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!getToken || !clinicId) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await createMyDataRequest(clinicId, { type, details }, getToken);
      setDetails('');
      showToast({
        tone: 'success',
        title: 'Request sent',
        description: 'Your clinic will answer within 30 days.',
      });
      await load();
    } catch (error) {
      setFailure(getErrorMessage(error, 'Your request could not be sent. Try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
          Your data
        </CardTitle>
        <CardDescription>
          Ask your clinic for a copy of your information, to correct it, to delete what does not
          have to be kept, or to limit how it is used. Asking never affects your care. See the{' '}
          <Link href={`${PRIVACY_HREF}#rights`} className="underline underline-offset-4">
            privacy notice
          </Link>{' '}
          for what each one means.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form noValidate onSubmit={(event) => void submit(event)} className="space-y-3">
          {failure ? <InlineNotice tone="error">{failure}</InlineNotice> : null}
          <div className="space-y-2">
            <Label htmlFor="data-request-type">What would you like?</Label>
            <Select value={type} onValueChange={(value) => setType(value as DataRequestType)}>
              <SelectTrigger id="data-request-type" className="sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATA_REQUEST_TYPES.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="data-request-details">
              Details <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="data-request-details"
              value={details}
              maxLength={2000}
              rows={3}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Anything that helps the clinic, such as what is wrong."
            />
          </div>
          <FormActions>
            <Button
              type="submit"
              disabled={submitting || !getToken || !clinicId}
              aria-busy={submitting}
            >
              {submitting ? 'Sending…' : 'Send request'}
            </Button>
          </FormActions>
        </form>

        <section aria-labelledby="data-requests-history" className="space-y-2">
          <h2 id="data-requests-history" className="text-eyebrow text-muted-foreground">
            Your requests
          </h2>
          {loadError ? (
            <InlineErrorState
              title="Your requests could not be loaded"
              description={loadError}
              onRetry={() => void load()}
            />
          ) : requests === null ? (
            <SectionSkeleton lines={2} />
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have not made a request.</p>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {requests.map((request) => {
                const due = describeDataRequestDue(request);
                return (
                  <li key={request.id} className="space-y-1 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="font-medium text-foreground">
                        {dataRequestTypeLabel(request.type)}
                      </p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {DATA_REQUEST_STATUS_LABEL[request.status]}
                        {' · '}
                        Sent {formatInviteDate(request.createdAt)}
                        {due ? ` · ${due.label}` : ''}
                      </p>
                    </div>
                    {request.responseNote ? (
                      <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                        {request.responseNote}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
