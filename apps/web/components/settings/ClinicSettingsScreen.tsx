'use client';

import { useCallback, useEffect, useState } from 'react';
import { Microscope, Settings2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

  const settings = useAsyncResource<ResearchSettings>({
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
        eyebrow="Clinic controls"
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
            {/*
              These three read the saved settings, not the draft. They used to mirror the
              checkboxes, so an unsaved tick made the card claim research was already enabled
              for the clinic. The unsaved state is announced next to the Save button instead,
              which is where the user can act on it.
            */}
            <div className="grid gap-4 md:grid-cols-3">
              <AppMetricCard
                title="Research mode"
                value={data.researchEnabled ? 'Enabled' : 'Disabled'}
                icon={Microscope}
                detail="Whether this clinic can generate research exports."
              />
              <AppMetricCard
                title="Approval policy"
                value={data.requiresDirectorApprovalEachExport ? 'Per export' : 'Not required'}
                icon={ShieldCheck}
                detail="How strictly research exports are controlled."
              />
              <AppMetricCard
                title="Last updated"
                value={data.updatedAt ? new Date(data.updatedAt).toLocaleDateString() : 'Not set'}
                icon={Settings2}
                detail={
                  data.updatedByDisplayName
                    ? `Last changed by ${data.updatedByDisplayName}.`
                    : 'No changes recorded yet.'
                }
              />
            </div>

            <Card className="max-w-3xl">
              <CardHeader>
                <CardTitle className="text-xl">Research settings</CardTitle>
                <CardDescription>
                  Configure whether the active clinic participates in research workflows and how
                  approvals are enforced.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border border-border bg-background p-4">
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

                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="requiresDirectorApproval"
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
                      <p className="mt-1 text-sm text-muted-foreground">
                        Keep a director checkpoint in place before each export leaves the clinic
                        workspace.
                      </p>
                    </div>
                  </div>
                </div>

                {saveError ? <InlineNotice tone="error">{saveError}</InlineNotice> : null}
                {saveConfirmation ? (
                  <InlineNotice tone="success">{saveConfirmation}</InlineNotice>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => void handleSave()} disabled={saving || !isDirty}>
                    {saving ? 'Saving…' : 'Save settings'}
                  </Button>
                  {/*
                    Reserving the row keeps the button from jumping when the message appears.
                    MASTER.md principle: help and status must not move content.
                  */}
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {isDirty ? 'You have unsaved changes.' : ' '}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </ResourceState>
    </div>
  );
}
