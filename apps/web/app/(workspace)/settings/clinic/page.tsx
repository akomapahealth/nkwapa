'use client';

import { useCallback, useEffect, useState } from 'react';
import { Microscope, Settings2, ShieldCheck } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { InlineNotice } from '@/components/ops/OpsShared';

interface ResearchSettings {
  researchEnabled: boolean;
  requiresDirectorApprovalEachExport: boolean;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
}

export default function ClinicSettingsPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId = bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;

  const [settings, setSettings] = useState<ResearchSettings | null>(null);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [requiresDirectorApproval, setRequiresDirectorApproval] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!clinicId || !getToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/research/settings`, {
        getToken,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ResearchSettings;
      setSettings(data);
      setResearchEnabled(data.researchEnabled);
      setRequiresDirectorApproval(data.requiresDirectorApprovalEachExport);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!clinicId || !getToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/research/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          researchEnabled,
          requiresDirectorApprovalEachExport: requiresDirectorApproval,
        }),
        getToken,
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="RESEARCH.SETTINGS.UPDATE">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to manage settings.</p>
        </div>
      </RouteGuard>
    );
  }

  if (loading && !settings) {
    return (
      <RouteGuard requiredPermission="RESEARCH.SETTINGS.UPDATE">
        <div className="flex items-center justify-center p-8">Loading…</div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="RESEARCH.SETTINGS.UPDATE">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinic controls"
          title="Clinic settings"
          description="Set research and approval rules."
          helpTitle="How these settings affect the clinic"
          helpText="These controls decide whether the active clinic can run research exports and whether director approval is required before an export is released."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <AppMetricCard
            title="Research mode"
            value={researchEnabled ? 'Enabled' : 'Disabled'}
            icon={Microscope}
            detail="Whether this clinic can generate research exports."
          />
          <AppMetricCard
            title="Approval policy"
            value={requiresDirectorApproval ? 'Per export' : 'Not required'}
            icon={ShieldCheck}
            detail="How strictly research exports are controlled."
          />
          <AppMetricCard
            title="Last updated"
            value={
              settings?.updatedAt ? new Date(settings.updatedAt).toLocaleDateString() : 'Not set'
            }
            icon={Settings2}
            detail={
              settings?.updatedByDisplayName
                ? `Last changed by ${settings.updatedByDisplayName}.`
                : 'No changes recorded yet.'
            }
          />
        </div>

        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

        <Card className="max-w-3xl rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl">Research settings</CardTitle>
            <CardDescription>
              Configure whether the active clinic participates in research workflows and how
              approvals are enforced.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="researchEnabled"
                  checked={researchEnabled}
                  onCheckedChange={(value) => setResearchEnabled(value === true)}
                />
                <div>
                  <Label htmlFor="researchEnabled">Research enabled for clinic</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Allow de-identified research workflows and export requests for this clinic.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="requiresDirectorApproval"
                  checked={requiresDirectorApproval}
                  onCheckedChange={(value) => setRequiresDirectorApproval(value === true)}
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

            <Button onClick={handleSave} disabled={saving} className="rounded-2xl">
              {saving ? 'Saving...' : 'Save settings'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
