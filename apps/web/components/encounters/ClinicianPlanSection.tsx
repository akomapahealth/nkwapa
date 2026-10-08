'use client';

import { useCallback, useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import {
  FOLLOW_UP_OWNERS,
  FOLLOW_UP_OWNER_LABELS,
  FOLLOW_UP_WINDOWS,
  FOLLOW_UP_WINDOW_LABELS,
} from '@nkwapa/db';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { FieldLabel } from '@/components/ui/field';
import { InlineNotice } from '@/components/ops/OpsShared';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useAuth } from '@/lib/auth-context';
import { useSeededFormValues } from '@/lib/use-seeded-form-values';
import { useBootstrap } from '@/lib/bootstrap-context';
import { db } from '@/lib/db';
import {
  conditionForEndpoint,
  isQueuedPlanFor,
  queueSealedClinicianPlan,
  readCachedSealKey,
  refreshSealKey,
} from '@/lib/clinician-plan-offline';
import type { ClinicianPlanSealKey } from '@nkwapa/db/clinician-plan-seal';
import {
  ChoiceQuestion,
  MultiChoiceQuestion,
  TextQuestion,
} from './hypertension/InterviewQuestion';

export interface ClinicianPlanValues {
  clinicianPlanItems: string[];
  clinicianPlanOther: string;
  followUpWindow: string;
  followUpOther: string;
  followUpOwner: string;
  clinicianComments: string;
}

export function emptyClinicianPlan(): ClinicianPlanValues {
  return {
    clinicianPlanItems: [],
    clinicianPlanOther: '',
    followUpWindow: 'NOT_ASSESSED',
    followUpOther: '',
    followUpOwner: 'NOT_ASSESSED',
    clinicianComments: '',
  };
}

export function clinicianPlanFromRecord(
  plan: Record<string, unknown> | null | undefined,
): ClinicianPlanValues {
  const base = emptyClinicianPlan();
  if (!plan) return base;
  const str = (value: unknown, fallback: string) =>
    typeof value === 'string' && value ? value : fallback;
  return {
    clinicianPlanItems: Array.isArray(plan.items)
      ? plan.items.filter((entry): entry is string => typeof entry === 'string')
      : [],
    clinicianPlanOther: str(plan.other, ''),
    followUpWindow: str(plan.followUpWindow, base.followUpWindow),
    followUpOther: str(plan.followUpOther, ''),
    followUpOwner: str(plan.followUpOwner, base.followUpOwner),
    clinicianComments: str(plan.comments, ''),
  };
}

/**
 * The supervising clinician's assessment and plan.
 *
 * The clinical specification says this part shows only for the doctor, so the caller renders it
 * only when the actor holds `CAREPLAN.CLINICIAN_PLAN` -- and renders *nothing* otherwise rather
 * than a disabled block, because a disabled section still tells a volunteer what a doctor may do.
 * The API refuses the route independently; this is the convenience half of that boundary, not the
 * boundary itself.
 *
 * Online, it saves straight to the server. Offline (#131), a doctor's device seals the plan to the
 * server's public key and queues the sealed copy: the device keeps nothing that opens it, so it is
 * never readable here -- not in devtools, not by the doctor's own later session -- and the server
 * opens it only for this clinic, encounter, condition and doctor. The section says which of the
 * two happened. A device that has never fetched the key while online cannot queue, and says so.
 */
export function ClinicianPlanSection({
  clinicId,
  encounterId,
  endpoint,
  planItems,
  planItemLabels,
  initialPlan,
  canEdit,
  onSaved,
  idPrefix,
  extraFields,
}: {
  clinicId: string;
  encounterId: string;
  /** `hypertension-assessment` or `diabetes-screening`. */
  endpoint: string;
  planItems: readonly string[];
  planItemLabels: Record<string, string>;
  initialPlan?: Record<string, unknown> | null;
  canEdit: boolean;
  onSaved?: () => void;
  idPrefix: string;
  /** Condition-specific extras, rendered above follow-up. Hypertension adds a BP goal. */
  extraFields?: {
    render: (disabled: boolean) => React.ReactNode;
    toPayload: () => Record<string, unknown>;
  };
}) {
  /*
    Keyed on the encounter, because the plan is a projection of its assessment's columns and
    carries no id of its own -- and there is exactly one of it per encounter. See the hook for
    why re-seeding on every refetch was wrong.
  */
  const [values, setValues] = useSeededFormValues(
    encounterId,
    initialPlan,
    clinicianPlanFromRecord,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { isOnline, syncNow } = useSync();
  const getToken = useAuth();
  const userId = useBootstrap()?.bootstrap?.userId ?? null;
  const condition = conditionForEndpoint(endpoint);
  const [sealKey, setSealKey] = useState<ClinicianPlanSealKey | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  // Keep the server's key on this device while online, so the doctor can still queue without it.
  useEffect(() => {
    if (!canEdit || !condition) return;
    setSealKey(readCachedSealKey());
    if (!isOnline || !getToken) return;
    let current = true;
    refreshSealKey(clinicId, getToken)
      .then((key) => current && setSealKey(key))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [canEdit, condition, isOnline, getToken, clinicId]);

  // A plan this doctor queued for this encounter, still waiting for signal.
  useEffect(() => {
    if (!canEdit || !condition || !userId) return;
    const subscription = liveQuery(() =>
      db.outbox.where('clinicId').equals(clinicId).toArray(),
    ).subscribe({
      next: (rows) =>
        setQueuedCount(
          rows.filter((row) => isQueuedPlanFor(row, { encounterId, condition, userId })).length,
        ),
      error: () => setQueuedCount(0),
    });
    return () => subscription.unsubscribe();
  }, [canEdit, condition, userId, clinicId, encounterId]);

  const update = useCallback(
    <K extends keyof ClinicianPlanValues>(key: K, value: ClinicianPlanValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
    },
    [setValues],
  );

  const canQueue = Boolean(sealKey && condition && userId);
  const disabled = !canEdit || saving || !getToken || (!isOnline && !canQueue);

  const handleSave = useCallback(async () => {
    if (disabled) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const text = (raw: string) => raw.trim() || null;
    const plan = {
      clinicianPlanItems: values.clinicianPlanItems,
      clinicianPlanOther: values.clinicianPlanItems.includes('OTHER')
        ? text(values.clinicianPlanOther)
        : null,
      followUpWindow: values.followUpWindow,
      followUpOther: values.followUpWindow === 'OTHER' ? text(values.followUpOther) : null,
      followUpOwner: values.followUpOwner,
      clinicianComments: text(values.clinicianComments),
      ...(extraFields?.toPayload() ?? {}),
    };
    if (!isOnline) {
      try {
        if (!sealKey || !condition || !userId) throw new Error('This device cannot queue a plan.');
        await queueSealedClinicianPlan({
          key: sealKey,
          clinicId,
          encounterId,
          condition,
          authorUserId: userId,
          plan,
        });
        setMessage(
          'Queued on this device, not saved yet. It is sealed so this device cannot read it back, and it is sent when the connection returns.',
        );
      } catch (caught) {
        setError(getErrorMessage(caught, 'Unable to queue the plan.'));
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      /*
        Flush the outbox before writing the plan.

        The interview saves local-first and reaches the server when the queue drains; the plan is an
        online REST write that hangs off the record the interview creates. A clinician who completed
        the interview and moved straight to the plan would otherwise be refused by a server that had
        not seen the screening yet -- and the refusal would look like the plan being rejected rather
        than like a queue that had not drained.
      */
      await syncNow(clinicId);

      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/${endpoint}/clinician-plan`,
        {
          getToken,
          activeClinicId: clinicId,
          method: 'PUT',
          body: JSON.stringify(plan),
        },
      );
      if (!response.ok) throw await readApiError(response);
      setMessage('Plan saved.');
      onSaved?.();
    } catch (caught) {
      setError(getErrorMessage(caught, 'Unable to save the plan.'));
    } finally {
      setSaving(false);
    }
  }, [
    disabled,
    clinicId,
    encounterId,
    endpoint,
    values,
    extraFields,
    onSaved,
    syncNow,
    getToken,
    isOnline,
    sealKey,
    condition,
    userId,
  ]);

  const q = (id: string) => ({ id: `${idPrefix}-${id}`, disabled });

  return (
    <FormSectionCard
      title="Supervising clinician assessment and plan"
      titleAs="h2"
      description="Recorded by the supervising clinician."
    >
      {!isOnline && canEdit ? (
        canQueue ? (
          <InlineNotice tone="warning">
            No connection. Saving seals the plan so this device cannot read it, and queues it to
            send when the connection returns. It is not saved until then.
          </InlineNotice>
        ) : (
          <InlineNotice tone="warning">
            A clinician plan can only be queued on a device that has been online since you signed
            in. This section is unavailable until the connection returns; the rest of the interview
            continues to save on this device.
          </InlineNotice>
        )
      ) : null}
      {queuedCount > 0 ? (
        <InlineNotice tone="info" live={false}>
          A plan you recorded offline for this visit is waiting to be sent. It is sealed, so it
          cannot be shown here. Saving again once online sends the queued plan first, then this one.
        </InlineNotice>
      ) : null}

      <MultiChoiceQuestion
        {...q('plan-items')}
        label="Plan"
        value={values.clinicianPlanItems}
        onChange={(value) => update('clinicianPlanItems', value)}
        options={planItems}
        labels={planItemLabels}
      />
      {values.clinicianPlanItems.includes('OTHER') ? (
        <TextQuestion
          {...q('plan-other')}
          label="Describe the plan"
          value={values.clinicianPlanOther}
          onChange={(value) => update('clinicianPlanOther', value)}
          maxLength={200}
        />
      ) : null}

      {extraFields?.render(disabled)}

      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceQuestion
          {...q('follow-up-window')}
          label="Follow-up"
          value={values.followUpWindow}
          onChange={(value) => update('followUpWindow', value)}
          options={FOLLOW_UP_WINDOWS}
          labels={FOLLOW_UP_WINDOW_LABELS}
        />
        <ChoiceQuestion
          {...q('follow-up-owner')}
          label="Follow-up owner"
          value={values.followUpOwner}
          onChange={(value) => update('followUpOwner', value)}
          options={FOLLOW_UP_OWNERS}
          labels={FOLLOW_UP_OWNER_LABELS}
        />
      </div>
      {values.followUpWindow === 'OTHER' ? (
        <TextQuestion
          {...q('follow-up-other')}
          label="Describe the follow-up"
          value={values.followUpOther}
          onChange={(value) => update('followUpOther', value)}
          maxLength={120}
        />
      ) : null}
      {/*
        The window is the input; a date is what gets stored.

        `CarePlan.followUpDate` is what schedules the patient's reminder on finalize, so saying so
        here stops a clinician wondering whether picking a window was enough.
      */}
      {values.followUpWindow !== 'NOT_ASSESSED' && values.followUpWindow !== 'OTHER' ? (
        <p className="text-sm text-muted-foreground">
          Saving this schedules the patient&rsquo;s follow-up reminder when the encounter is
          finalized.
        </p>
      ) : null}

      <div className="space-y-2">
        <FieldLabel htmlFor={`${idPrefix}-comments`}>Additional comments</FieldLabel>
        <Textarea
          id={`${idPrefix}-comments`}
          value={values.clinicianComments}
          onChange={(event) => update('clinicianComments', event.target.value)}
          disabled={disabled}
          maxLength={2000}
          rows={3}
        />
      </div>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}

      {canEdit ? (
        <Button onClick={() => void handleSave()} disabled={disabled}>
          {saving ? 'Saving…' : isOnline ? 'Save plan' : 'Queue plan'}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">This plan is read-only.</p>
      )}
    </FormSectionCard>
  );
}
