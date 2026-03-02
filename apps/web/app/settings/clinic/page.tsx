"use client";

import { useCallback, useEffect, useState } from "react";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RouteGuard } from "@/components/RouteGuard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

interface ResearchSettings {
  researchEnabled: boolean;
  requiresDirectorApprovalEachExport: boolean;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
}

export default function ClinicSettingsPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;

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
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/settings`,
        { getToken }
      );
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
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/settings`,
        {
          method: "PUT",
          body: JSON.stringify({
            researchEnabled,
            requiresDirectorApprovalEachExport: requiresDirectorApproval,
          }),
          getToken,
        }
      );
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
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold font-heading">Clinic Settings</h1>
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Research Settings</h2>
          {settings?.updatedAt && (
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date(settings.updatedAt).toLocaleString()}
              {settings.updatedByDisplayName &&
                ` by ${settings.updatedByDisplayName}`}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="researchEnabled"
              checked={researchEnabled}
              onCheckedChange={(v) => setResearchEnabled(v === true)}
            />
            <Label htmlFor="researchEnabled">Research enabled for clinic</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="requiresDirectorApproval"
              checked={requiresDirectorApproval}
              onCheckedChange={(v) => setRequiresDirectorApproval(v === true)}
            />
            <Label htmlFor="requiresDirectorApproval">
              Requires director approval for each export
            </Label>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
    </RouteGuard>
  );
}
