'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, MapPinned, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import { readApiError } from '@/lib/ops';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Box } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { dataGridSx } from '@/lib/datagrid-theme';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EmptyState,
  InlineErrorState,
  NoAccessState,
  SectionSkeleton,
} from '@/components/feedback/AppState';

interface ClinicRow {
  id: string;
  name: string;
  region: string | null;
  isActive: boolean;
}

export default function AdminClinicsPage() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const isSystemAdmin = bootstrap?.globalRoles?.includes('SYSTEM_ADMIN') ?? false;
  const canAccessClinicsAdmin =
    isSystemAdmin ||
    (bootstrap?.memberships ?? []).some((membership) => membership.roles.includes('DIRECTOR'));
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingClinic, setEditingClinic] = useState<ClinicRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formRegion, setFormRegion] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchClinics = useCallback(async () => {
    if (!getToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/admin/clinics', {
        getToken,
        skipClinicHeader: true,
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const data = (await res.json()) as ClinicRow[];
      setClinics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setClinics([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchClinics();
  }, [fetchClinics]);

  const handleCreate = async () => {
    if (!getToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/admin/clinics', {
        method: 'POST',
        body: JSON.stringify({
          name: formName.trim(),
          region: formRegion.trim() || undefined,
        }),
        getToken,
        skipClinicHeader: true,
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setCreateOpen(false);
      setFormName('');
      setFormRegion('');
      await fetchClinics();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleEditOpen = (clinic: ClinicRow) => {
    setEditingClinic(clinic);
    setFormName(clinic.name);
    setFormRegion(clinic.region ?? '');
    setFormIsActive(clinic.isActive);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!getToken || !editingClinic) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/clinics/${encodeURIComponent(editingClinic.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: formName.trim(),
          region: formRegion.trim() || undefined,
          isActive: formIsActive,
        }),
        getToken,
        skipClinicHeader: true,
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setEditOpen(false);
      setEditingClinic(null);
      await fetchClinics();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 180 },
    { field: 'region', headerName: 'Region', width: 120 },
    {
      field: 'isActive',
      headerName: 'Active',
      width: 80,
      type: 'boolean',
    },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Button variant="outline" size="sm" onClick={() => handleEditOpen(params.row as ClinicRow)}>
          Edit
        </Button>
      ),
    },
  ];

  const activeCount = clinics.filter((clinic) => clinic.isActive).length;
  const inactiveCount = clinics.length - activeCount;

  /*
    A second denial UI used to live here: a centred card with its own <h1>No access</h1>, rendered
    inside RouteGuard, which already had a denial state of its own. Two components said the same
    thing in two different shapes, and only one of them told the user what to do next.

    The check itself stays -- CLINIC.MANAGE is held by Managers, and clinic administration is
    Director and System Admin only, so this is a genuine second gate rather than a duplicate of
    the permission above it.
  */
  if (!canAccessClinicsAdmin) {
    return (
      <RouteGuard requiredPermission="CLINIC.MANAGE">
        <NoAccessState
          title="You don't have access to clinic administration"
          description="Creating and deactivating clinics is limited to Directors and System Admins. Staff and role changes are available to you under Staff."
          action={
            <Button asChild variant="outline">
              <Link href="/admin/users">Go to Staff</Link>
            </Button>
          }
        />
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="CLINIC.MANAGE">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="System administration"
          title="Clinics"
          description="Manage clinic records and availability."
          helpTitle="What you manage here"
          helpText="Create clinics, review their status, and adjust operational details without losing historical records."
          actions={<Button onClick={() => setCreateOpen(true)}>Create clinic</Button>}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <AppMetricCard
            title="Total clinics"
            value={clinics.length}
            icon={Building2}
            detail="Every clinic environment in the platform."
          />
          <AppMetricCard
            title="Active clinics"
            value={activeCount}
            icon={ShieldCheck}
            detail="Clinics currently available for staff and patient workflows."
          />
          <AppMetricCard
            title="Inactive clinics"
            value={inactiveCount}
            icon={MapPinned}
            detail="Clinics preserved for history but not active for daily operations."
          />
        </div>

        {error ? (
          <InlineErrorState
            title="The clinic list could not be loaded"
            description={error}
            onRetry={() => void fetchClinics()}
          />
        ) : null}

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Clinic registry</CardTitle>
                <CardDescription>Review names, regions, and activation status.</CardDescription>
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
                <p className="text-muted-foreground">Loaded rows</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {clinics.length}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressiveHelp title="How clinic status works">
              Inactive clinics stay in the system for history and audit, but they stop acting like
              live operational workspaces until you reactivate them.
            </ProgressiveHelp>
            {loading ? (
              <SectionSkeleton lines={5} className="border-0 bg-transparent p-0 shadow-none" />
            ) : clinics.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No clinics yet"
                description="Create the first clinic to start configuring staff access and local operations."
                action={<Button onClick={() => setCreateOpen(true)}>Create clinic</Button>}
              />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {clinics.map((clinic) => (
                    <article
                      key={clinic.id}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-foreground">{clinic.name}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {clinic.region || 'No region assigned'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            clinic.isActive
                              ? 'bg-success/12 text-success-ink'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {clinic.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        className="mt-4 w-full"
                        onClick={() => handleEditOpen(clinic)}
                      >
                        Edit clinic
                      </Button>
                    </article>
                  ))}
                </div>

                <Box
                  sx={{ height: 480, width: '100%' }}
                  className="hidden overflow-x-auto md:block"
                >
                  <DataGrid
                    rows={clinics}
                    columns={columns}
                    loading={loading}
                    getRowId={(row) => row.id}
                    sx={dataGridSx}
                  />
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create clinic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Clinic name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-region">Region (optional)</Label>
              <Input
                id="create-region"
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                placeholder="Region"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving || !formName.trim()}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit clinic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Clinic name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-region">Region (optional)</Label>
              <Input
                id="edit-region"
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                placeholder="Region"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-active"
                checked={formIsActive}
                onCheckedChange={(v) => setFormIsActive(v === true)}
              />
              <Label htmlFor="edit-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={saving || !formName.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RouteGuard>
  );
}
