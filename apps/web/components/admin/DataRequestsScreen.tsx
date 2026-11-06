'use client';

import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { statusLabel } from '@/lib/status-presentation';
import { ShieldCheck } from 'lucide-react';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Button } from '@/components/ui/button';
import { RecordSection, RecordSectionContent } from '@/components/patients/RecordSection';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError, fieldErrorProps } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/components/ui/toast';
import { ApiError, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  dataRequestTypeLabel,
  describeDataRequestDue,
  isOpenDataRequest,
  listClinicDataRequests,
  respondToDataRequest,
  type ClinicDataRequest,
} from '@/lib/data-requests';
import { formatInviteDate } from '@/lib/portal-invite';
import { cn } from '@/lib/utils';

type Closing = { request: ClinicDataRequest; status: 'COMPLETED' | 'DECLINED' } | null;

/**
 * The clinic's data rights queue. Open requests first, soonest due first, so a deadline is never
 * found by scrolling. Nkwapa records the answer; the record itself is changed on the chart.
 */
export function DataRequestsScreen() {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const clinicId = useBootstrap()?.activeClinicId ?? null;
  const [rows, setRows] = useState<ClinicDataRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<Closing>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!getToken || !clinicId) return;
    setError(null);
    try {
      setRows(await listClinicDataRequests(clinicId, getToken));
    } catch (err) {
      setError(getErrorMessage(err, 'Data requests could not be loaded.'));
    }
  }, [clinicId, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (
    request: ClinicDataRequest,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED',
    responseNote = '',
  ) => {
    if (!getToken || !clinicId) return;
    setSaving(true);
    setNoteError(undefined);
    try {
      await respondToDataRequest(clinicId, request.id, { status, responseNote }, getToken);
      setClosing(null);
      setNote('');
      showToast({
        tone: 'success',
        title: `Marked ${statusLabel(status).toLowerCase()}`,
      });
      await load();
    } catch (err) {
      const field =
        err instanceof ApiError
          ? err.fieldErrors.find((entry) => entry.field === 'responseNote')
          : null;
      if (field) setNoteError(field.message);
      else
        showToast({
          tone: 'error',
          title: getErrorMessage(err, 'The request could not be updated.'),
        });
    } finally {
      setSaving(false);
    }
  };

  const openCount = rows?.filter((row) => isOpenDataRequest(row.status)).length ?? 0;

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Patient rights"
        title="Data requests"
        description={
          rows ? `${openCount} open. Each must be answered within 30 days of receipt.` : undefined
        }
        hint="Patients ask from their portal profile. Make the change on the patient's chart, then record what you did here; the patient sees your note. Medical records must be kept as the law requires, so a deletion request is usually answered by removing contact details, portal access or research use, and saying why the rest stays."
      />

      {!isOnline ? <StaleDataNotice isOnline={false} /> : null}
      {error ? (
        <InlineErrorState
          title="Data requests could not be loaded"
          description={error}
          onRetry={() => void load()}
        />
      ) : rows === null ? (
        <SectionSkeleton lines={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          density="compact"
          titleAs="h2"
          title="No data requests"
          description="When a patient asks for a copy, a correction or a deletion, it appears here."
        />
      ) : (
        <RecordSection>
          <RecordSectionContent className="p-0">
            <ul className="divide-y divide-border" aria-label="Data requests">
              {rows.map((row) => {
                const due = describeDataRequestDue(row);
                const open = isOpenDataRequest(row.status);
                return (
                  <li
                    key={row.id}
                    className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="font-medium text-foreground">
                          {dataRequestTypeLabel(row.type)}
                        </p>
                        <Link
                          href={`/patients/${row.patient.id}`}
                          className="text-sm text-primary underline-offset-4 hover:underline"
                        >
                          {row.patient.firstName} {row.patient.lastName} · {row.patient.patientCode}
                        </Link>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {statusLabel(row.status)}
                        </span>
                        {' · '}Received {formatInviteDate(row.createdAt)}
                        {due ? (
                          <span className={cn(due.overdue && 'font-medium text-destructive')}>
                            {' · '}
                            {due.label}
                          </span>
                        ) : null}
                        {row.respondedBy ? ` · Answered by ${row.respondedBy.displayName}` : ''}
                      </p>
                      {row.details ? (
                        <p className="whitespace-pre-line text-sm leading-6 text-foreground">
                          &ldquo;{row.details}&rdquo;
                        </p>
                      ) : null}
                      {row.responseNote ? (
                        <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                          Answer: {row.responseNote}
                        </p>
                      ) : null}
                    </div>
                    {open ? (
                      <div className="flex flex-wrap gap-1">
                        {row.status === 'RECEIVED' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={saving}
                            onClick={() => void save(row, 'IN_PROGRESS')}
                          >
                            Start
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className={
                            row.type === 'DELETION' ? 'border-warning text-warning-ink' : undefined
                          }
                          disabled={saving}
                          onClick={() => setClosing({ request: row, status: 'COMPLETED' })}
                        >
                          {row.type === 'DELETION' ? (
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                          ) : null}
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => setClosing({ request: row, status: 'DECLINED' })}
                        >
                          Decline
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </RecordSectionContent>
        </RecordSection>
      )}

      <Dialog
        open={closing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setClosing(null);
            setNote('');
            setNoteError(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {closing?.status === 'DECLINED' ? 'Decline request' : 'Complete request'}
            </DialogTitle>
            <DialogDescription>
              The patient sees this note in their portal. Say what was done, or which part cannot be
              done and why, for example the law that requires a record to be kept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {closing?.status === 'DECLINED' ? (
              <InlineNotice tone="warning">
                A decline still has to be explained. If part of the request can be met, do that and
                complete it instead.
              </InlineNotice>
            ) : null}
            <Label htmlFor="data-request-note">Note to the patient</Label>
            <Textarea
              id="data-request-note"
              rows={4}
              maxLength={2000}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteError(undefined);
              }}
              {...fieldErrorProps('data-request-note', noteError)}
            />
            <FieldError id="data-request-note" message={noteError} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant={closing?.request.type === 'DELETION' ? 'outline' : 'default'}
              className={
                closing?.request.type === 'DELETION' ? 'border-warning text-warning-ink' : undefined
              }
              disabled={saving || note.trim().length === 0}
              onClick={() => closing && void save(closing.request, closing.status, note)}
            >
              {closing?.request.type === 'DELETION' ? (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              ) : null}
              {saving ? 'Saving…' : closing?.status === 'DECLINED' ? 'Decline' : 'Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
