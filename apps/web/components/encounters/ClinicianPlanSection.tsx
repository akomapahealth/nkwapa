'use client';

import { useCallback, useEffect, useState } from 'react';
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
 * Unlike the rest of the interview this saves online only. The plan is not an offline entity type:
 * `SYNC.PUSH` is held by four roles, and the repo's precedent -- a finalize that a replay cannot
 * perform, a clinical note that never leaves the server -- is that a clinician's deliberate,
 * audited act stays online. That is a real constraint on a doctor working without signal, recorded
 * on #114 rather than hidden.
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
  const [values, setValues] = useState<ClinicianPlanValues>(() =>
    clinicianPlanFromRecord(initialPlan),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { isOnline, syncNow } = useSync();
  const getToken = useAuth();

  useEffect(() => {
    if (!initialPlan) return;
    setValues(clinicianPlanFromRecord(initialPlan));
  }, [initialPlan]);

  const update = useCallback(
    <K extends keyof ClinicianPlanValues>(key: K, value: ClinicianPlanValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const disabled = !canEdit || saving || !isOnline || !getToken;

  const handleSave = useCallback(async () => {
    if (disabled) return;
    setSaving(true);
    setError(null);
    setMessage(null);
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

      const text = (raw: string) => raw.trim() || null;
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/${endpoint}/clinician-plan`,
        {
          getToken,
          activeClinicId: clinicId,
          method: 'PUT',
          body: JSON.stringify({
            clinicianPlanItems: values.clinicianPlanItems,
            clinicianPlanOther: values.clinicianPlanItems.includes('OTHER')
              ? text(values.clinicianPlanOther)
              : null,
            followUpWindow: values.followUpWindow,
            followUpOther: values.followUpWindow === 'OTHER' ? text(values.followUpOther) : null,
            followUpOwner: values.followUpOwner,
            clinicianComments: text(values.clinicianComments),
            ...(extraFields?.toPayload() ?? {}),
          }),
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
  }, [disabled, clinicId, encounterId, endpoint, values, extraFields, onSaved, syncNow, getToken]);

  const q = (id: string) => ({ id: `${idPrefix}-${id}`, disabled });

  return (
    <FormSectionCard
      title="Supervising clinician assessment and plan"
      titleAs="h2"
      description="Recorded by the supervising clinician."
    >
      {!isOnline ? (
        <InlineNotice tone="warning">
          A clinician plan is recorded online. This section is unavailable until the connection
          returns; the rest of the interview continues to save on this device.
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
          {saving ? 'Saving…' : 'Save plan'}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">This plan is read-only.</p>
      )}
    </FormSectionCard>
  );
}
