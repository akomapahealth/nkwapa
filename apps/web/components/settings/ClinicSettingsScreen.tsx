'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, FlaskConical, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap, useClinicUnits } from '@/lib/bootstrap-context';
import { formatOpsDay, hasPermission } from '@/lib/ops';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import { getActiveBootstrapClinic } from '@/lib/bootstrap-clinics';
import {
  BODY_MEASURE_UNIT_LABELS,
  GLUCOSE_UNIT_LABELS,
  HBA1C_UNIT_LABELS,
} from '@nkwapa/db/measurement-units';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { FormActions } from '@/components/ui/form-actions';
import { Label } from '@/components/ui/label';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { Checkbox } from '@/components/ui/checkbox';
import { InlineNotice } from '@/components/ops/OpsShared';

export interface ResearchSettings {
  researchEnabled: boolean;
  requiresDirectorApprovalEachExport: boolean;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
}

/** The two fields this screen can actually change. */
interface SettingsDraft {
  researchEnabled: boolean;
  requiresDirectorApprovalEachExport: boolean;
}

function toDraft(settings: ResearchSettings): SettingsDraft {
  return {
    researchEnabled: settings.researchEnabled,
    requiresDirectorApprovalEachExport: settings.requiresDirectorApprovalEachExport,
  };
}

export function ClinicSettingsScreen({ clinicId }: { clinicId: string }) {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap;
  const clinic = getActiveBootstrapClinic(bootstrap, clinicId);
  const units = useClinicUnits(clinicId);
  const canEditClinic = hasPermission(
    bootstrap?.effectivePermissionsForActiveClinic ?? [],
    'CLINIC.MANAGE',
  );
  const facts = useAsyncResource<{ timezone: string }>({
    requiresOnline: true,
    resourceKey: clinicId,
    errorMessage: 'Clinic time zone could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}`, {
        getToken: token,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return response.json();
    },
  });
  const canSeeExports = hasPermission(
    useBootstrap()?.bootstrap?.effectivePermissionsForActiveClinic ?? [],
    'RESEARCH.EXPORT.REQUEST',
  );

  const settings = useAsyncResource<ResearchSettings>({
    requiresOnline: true,
    resourceKey: clinicId,
    errorMessage: 'The research settings for this clinic could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/settings`,
        { getToken: token, signal },
      );
      if (!response.ok) {
        throw await readApiError(response);
      }
      return (await response.json()) as ResearchSettings;
    },
  });

  /*
    The draft is seeded from what loaded, never from a literal.

    Before this, a failed first read left `settings` null and still rendered the form with
    hard-coded defaults of researchEnabled:false / requiresDirectorApproval:true, with Save
    enabled. A director could switch research off on a clinic that had it on, having never seen
    the real value. `ResourceState` now refuses to render the form at all until there is
    something real to edit.
  */
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  /*
    Saving keeps its own error and confirmation. One shared `error` used to cover both the read
    and the write, so a rejected save rendered in the same place, and with the same wording, as
    a clinic whose settings had never loaded.
  */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);

  const loaded = settings.data;

  useEffect(() => {
    if (!loaded) return;
    // Resets the draft whenever the server's version changes, which is exactly what should
    // happen after a successful save: the form goes back to matching what was stored.
    setDraft(toDraft(loaded));
  }, [loaded]);

  const changesSafetyPolicy = Boolean(
    draft &&
    loaded &&
    ((loaded.researchEnabled && !draft.researchEnabled) ||
      (loaded.requiresDirectorApprovalEachExport && !draft.requiresDirectorApprovalEachExport)),
  );
  const isDirty =
    draft !== null &&
    loaded !== null &&
    (draft.researchEnabled !== loaded.researchEnabled ||
      draft.requiresDirectorApprovalEachExport !== loaded.requiresDirectorApprovalEachExport);

  const updateDraft = useCallback((patch: Partial<SettingsDraft>) => {
    setSaveError(null);
    setSaveConfirmation(null);
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const handleSave = async () => {
    if (!draft || !getToken || !isDirty) return;

    setSaving(true);
    setSaveError(null);
    setSaveConfirmation(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/settings`,
        {
          method: 'PUT',
          body: JSON.stringify(draft),
          getToken,
        },
      );
      if (!response.ok) {
        throw await readApiError(response);
      }
      setSaveConfirmation('Clinic settings saved.');
      settings.refresh();
    } catch (requestError) {
      setSaveError(
        getErrorMessage(requestError, 'The clinic settings could not be saved. Nothing changed.'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Clinic settings"
        description="Set research and approval rules."
        helpTitle="How these settings affect the clinic"
        helpText="These controls decide whether the active clinic can run research exports and whether director approval is required before an export is released."
      />

      <ResourceState
        state={settings}
        errorTitle="We couldn't load this clinic's settings"
        skeleton={
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <SectionSkeleton lines={1} />
              <SectionSkeleton lines={1} />
              <SectionSkeleton lines={1} />
            </div>
            <SectionSkeleton lines={4} className="max-w-3xl" />
          </div>
        }
      >
        {(data) => (
          <div className="space-y-6">
            <RecordSection className="max-w-3xl">
              <RecordSectionHeader>
                <RecordSectionTitle>Clinic</RecordSectionTitle>
              </RecordSectionHeader>
              <RecordSectionContent>
                <dl>
                  {[
                    ['Name', clinic?.clinicName ?? 'Not available'],
                    [
                      'Time zone',
                      facts.data?.timezone ?? (facts.error ? 'Could not load' : 'Loading…'),
                    ],
                    [
                      'Measurement units',
                      `${GLUCOSE_UNIT_LABELS[units.glucoseUnit]}, ${BODY_MEASURE_UNIT_LABELS[units.bodyUnit]}, HbA1c ${HBA1C_UNIT_LABELS[units.hba1cUnit]}`,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule py-3 text-sm"
                    >
                      <dt className="w-36 text-muted-foreground">{label}</dt>
                      <dd className="flex min-w-0 flex-1 items-center gap-4 [overflow-wrap:anywhere]">
                        <span className="min-w-0 flex-1">{value}</span>
                        {canEditClinic ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link
                              href="/admin/clinics"
                              aria-label={`Edit clinic ${label.toLowerCase()}`}
                            >
                              Edit
                            </Link>
                          </Button>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
                {facts.error ? (
                  <Button variant="ghost" size="sm" onClick={facts.refresh}>
                    Retry time zone
                  </Button>
                ) : null}
              </RecordSectionContent>
            </RecordSection>

            <RecordSection className="max-w-3xl">
              <RecordSectionHeader>
                <RecordSectionTitle>Research settings</RecordSectionTitle>
              </RecordSectionHeader>
              <RecordSectionContent className="space-y-6">
                <div className="border-b border-rule py-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="researchEnabled"
                      checked={draft?.researchEnabled ?? data.researchEnabled}
                      onCheckedChange={(value) => updateDraft({ researchEnabled: value === true })}
                    />
                    <div>
                      <Label htmlFor="researchEnabled">Research enabled for clinic</Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Allow de-identified research workflows and export requests for this clinic.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-b border-rule py-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="requiresDirectorApproval"
                      disabled={!(draft?.researchEnabled ?? data.researchEnabled)}
                      aria-describedby="approval-reason"
                      checked={
                        draft?.requiresDirectorApprovalEachExport ??
                        data.requiresDirectorApprovalEachExport
                      }
                      onCheckedChange={(value) =>
                        updateDraft({ requiresDirectorApprovalEachExport: value === true })
                      }
                    />
                    <div>
                      <Label htmlFor="requiresDirectorApproval">
                        Requires director approval for each export
                      </Label>
                      <p id="approval-reason" className="mt-1 text-sm text-muted-foreground">
                        {(draft?.researchEnabled ?? data.researchEnabled)
                          ? 'Keep a director checkpoint before each export leaves the clinic.'
                          : 'Enable research to change the approval requirement.'}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  {data.updatedAt
                    ? `Last updated ${formatOpsDay(data.updatedAt)}${data.updatedByDisplayName ? ` by ${data.updatedByDisplayName}` : ''}.`
                    : 'No changes recorded yet.'}
                </p>
                {saveError ? <InlineNotice tone="error">{saveError}</InlineNotice> : null}
                {saveConfirmation ? (
                  <InlineNotice tone="success">{saveConfirmation}</InlineNotice>
                ) : null}

                {/* R7.3: the house action row; the status note sits at the start, Save last. */}
                <FormActions split>
                  {/*
                    Reserving the row keeps the button from jumping when the message appears.
                    MASTER.md principle: help and status must not move content.
                  */}
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {isDirty ? 'You have unsaved changes.' : 'No changes'}
                  </p>
                  <Button
                    variant={changesSafetyPolicy ? 'outline' : 'default'}
                    className={changesSafetyPolicy ? 'border-warning text-warning-ink' : undefined}
                    onClick={() => void handleSave()}
                    disabled={saving || !isDirty}
                  >
                    {changesSafetyPolicy ? (
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    ) : null}
                    {saving ? 'Saving…' : 'Save settings'}
                  </Button>
                </FormActions>
              </RecordSectionContent>
            </RecordSection>

            {canSeeExports ? (
              <Link
                href="/research"
                className="group flex max-w-3xl items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FlaskConical aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">Research exports</span>
                  <span className="block text-sm text-muted-foreground">
                    Check readiness, approve runs and schedules, and download packs.
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            ) : null}
          </div>
        )}
      </ResourceState>
    </div>
  );
}
