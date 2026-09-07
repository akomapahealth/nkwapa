'use client';

import { useCallback, useMemo, useState } from 'react';
import { Building2, MapPinned, ShieldAlert } from 'lucide-react';
import { Box } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { ResourceState } from '@/components/feedback/ResourceState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { ApiError, apiFetch, readApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useAsyncResource } from '@/lib/use-async-resource';
import { dataGridSx } from '@/lib/datagrid-theme';
import {
  CLINIC_METADATA_ISSUE_LABELS,
  CLINIC_METADATA_SEVERITY_VARIANT,
  clinicFormFromRow,
  clinicFormToPayload,
  clinicMetadataErrors,
  clinicNeedsAttention,
  emptyClinicForm,
  filterClinics,
  normalizeClinicRow,
  summarizeClinicMetadata,
  type ClinicFormField,
  type ClinicFormValues,
  type ClinicListFilter,
  type ClinicRow,
  type OrganizationSummary,
} from '@/lib/clinic-metadata';
import { ClinicMetadataDialog, type ClinicDialogMode } from './ClinicMetadataDialog';

const FILTER_OPTIONS = [
  { value: 'all' as const, label: 'All clinics' },
  {
    value: 'needs-attention' as const,
    label: 'Needs attention',
    description: 'Clinics whose metadata organization reporting cannot use.',
  },
  { value: 'inactive' as const, label: 'Inactive' },
];

const FILTER_LABELS: Record<ClinicListFilter, string | null> = {
  all: null,
  'needs-attention': 'Needs attention',
  inactive: 'Inactive',
};

/** The worst issue on a clinic, which is what a single-badge cell should show. */
function headlineIssue(clinic: ClinicRow) {
  const errors = clinicMetadataErrors(clinic);
  if (errors.length > 0) return errors[0];
  return clinic.metadataIssues.find((issue) => issue.severity === 'warning') ?? null;
}

function MetadataBadges({ clinic }: { clinic: ClinicRow }) {
  const summary = summarizeClinicMetadata(clinic.metadataIssues);
  const headline = headlineIssue(clinic);

  if (!headline) {
    return <span className="text-sm text-muted-foreground">No issues</span>;
  }

  const extra = summary.errorCount + summary.warningCount - 1;

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Badge variant={CLINIC_METADATA_SEVERITY_VARIANT[headline.severity]} className="truncate">
        {CLINIC_METADATA_ISSUE_LABELS[headline.code]}
      </Badge>
      {extra > 0 ? <span className="shrink-0 text-xs text-muted-foreground">+{extra}</span> : null}
    </span>
  );
}

/**
 * The clinic registry: what each clinic's location metadata is, and what is wrong with it.
 *
 * Extracted from the page so the route file is a guard and this is the screen, matching
 * DuplicateReviewScreen. On the way it picked up the pieces the page was missing: the shared
 * async-resource states rather than a hand-rolled useState triple, real Badges rather than
 * inlined tint classes, and the ApiError variant of readApiError so a duplicate location code
 * lands on the field it belongs to.
 */
export function ClinicRegistryScreen() {
  const getToken = useAuth();
  const [filter, setFilter] = useState<ClinicListFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<ClinicDialogMode>('create');
  const [dialogValues, setDialogValues] = useState<ClinicFormValues>(emptyClinicForm(null));
  const [focusField, setFocusField] = useState<ClinicFormField | undefined>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | Error | null>(null);

  const clinics = useAsyncResource<ClinicRow[]>({
    resourceKey: 'admin-clinics',
    errorMessage: 'The clinic list could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch('/admin/clinics', {
        getToken: token,
        skipClinicHeader: true,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return ((await response.json()) as ClinicRow[]).map(normalizeClinicRow);
    },
  });

  const organizations = useAsyncResource<OrganizationSummary[]>({
    resourceKey: 'admin-clinic-organizations',
    errorMessage: 'The organization list could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch('/admin/clinics/organizations', {
        getToken: token,
        skipClinicHeader: true,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as OrganizationSummary[];
    },
  });

  const rows = useMemo(() => clinics.data ?? [], [clinics.data]);
  const organizationList = organizations.data ?? [];
  const visibleRows = useMemo(() => filterClinics(rows, filter), [rows, filter]);

  const activeCount = rows.filter((clinic) => clinic.isActive).length;
  const attentionCount = rows.filter(clinicNeedsAttention).length;

  const openCreate = () => {
    setDialogMode('create');
    setDialogValues(emptyClinicForm(organizationList[0] ?? null));
    setFocusField(undefined);
    setEditingId(null);
    setSubmitError(null);
    setDialogOpen(true);
  };

  const openEdit = useCallback((clinic: ClinicRow, field?: ClinicFormField) => {
    setDialogMode('edit');
    setDialogValues(clinicFormFromRow(clinic));
    setFocusField(field);
    setEditingId(clinic.id);
    setSubmitError(null);
    setDialogOpen(true);
  }, []);

  const handleSubmit = async (values: ClinicFormValues) => {
    if (!getToken) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const isEdit = dialogMode === 'edit' && editingId;
      const payload = clinicFormToPayload(values);
      const response = await apiFetch(
        isEdit ? `/admin/clinics/${encodeURIComponent(editingId)}` : '/admin/clinics',
        {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(isEdit ? { ...payload, isActive: values.isActive } : payload),
          getToken,
          skipClinicHeader: true,
        },
      );
      if (!response.ok) throw await readApiError(response);
      setDialogOpen(false);
      await clinics.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setSaving(false);
    }
  };

  const columns: GridColDef<ClinicRow>[] = useMemo(
    () => [
      { field: 'name', headerName: 'Name', flex: 1, minWidth: 170 },
      {
        field: 'locationCode',
        headerName: 'Location code',
        width: 170,
        renderCell: (params) =>
          params.row.locationCode ? (
            <span className="font-mono text-xs">{params.row.locationCode}</span>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          ),
      },
      { field: 'timezone', headerName: 'Time zone', width: 160 },
      {
        field: 'zoneCode',
        headerName: 'Zone',
        width: 130,
        renderCell: (params) =>
          params.row.zoneCode ? (
            <span className="font-mono text-xs">{params.row.zoneCode}</span>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
      },
      {
        field: 'isActive',
        headerName: 'Status',
        width: 110,
        renderCell: (params) => (
          <Badge variant={params.row.isActive ? 'finalized' : 'destructive'}>
            {params.row.isActive ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        field: 'metadataIssues',
        headerName: 'Metadata',
        width: 200,
        sortable: false,
        renderCell: (params) => <MetadataBadges clinic={params.row} />,
      },
      {
        field: 'actions',
        headerName: '',
        width: 100,
        sortable: false,
        renderCell: (params) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openEdit(params.row, headlineIssue(params.row)?.field)}
          >
            Edit
          </Button>
        ),
      },
    ],
    [openEdit],
  );

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="System administration"
        title="Clinics"
        description="Manage clinic records, location metadata, and availability."
        helpTitle="What you manage here"
        helpText="Create clinics, review their location and zone metadata, and adjust operational details without losing historical records."
        actions={<Button onClick={openCreate}>Create clinic</Button>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AppMetricCard
          title="Total clinics"
          value={rows.length}
          icon={Building2}
          detail="Every clinic environment in the platform."
        />
        <AppMetricCard
          title="Active clinics"
          value={activeCount}
          icon={MapPinned}
          detail="Clinics currently available for staff and patient workflows."
        />
        <AppMetricCard
          title="Needs attention"
          value={attentionCount}
          icon={ShieldAlert}
          detail="Clinics whose location metadata organization reporting cannot rely on."
        />
      </div>

      <Card className="min-w-0">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl">Clinic registry</CardTitle>
              <CardDescription>
                Review names, location codes, time zones, and activation status.
              </CardDescription>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
              <p className="text-muted-foreground">Showing</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {visibleRows.length}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProgressiveHelp title="How clinic metadata is used">
            A clinic&apos;s time zone decides how appointment times, reminders, and daily reporting
            are read. Its location code identifies it in organization reporting and must be unique
            within its organization. Zone codes are optional until zone-aware reporting is switched
            on. Inactive clinics stay in the system for history and audit, but stop acting like live
            operational workspaces until you reactivate them.
          </ProgressiveHelp>

          <div className="space-y-3">
            <SegmentedControl
              label="Clinic filter"
              value={filter}
              options={FILTER_OPTIONS}
              onChange={setFilter}
            />
            <ActiveFilterSummary
              items={[{ label: 'View', value: FILTER_LABELS[filter] }]}
              emptyLabel="All clinics"
            />
          </div>

          <ResourceState
            state={clinics}
            skeleton={
              <SectionSkeleton lines={5} className="border-0 bg-transparent p-0 shadow-none" />
            }
            errorTitle="The clinic list could not be loaded"
            isEmpty={(data) => data.length === 0}
            empty={{
              icon: Building2,
              title: 'No clinics yet',
              description:
                'Create the first clinic to start configuring staff access and local operations.',
              action: <Button onClick={openCreate}>Create clinic</Button>,
            }}
          >
            {() =>
              visibleRows.length === 0 ? (
                <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  {filter === 'needs-attention'
                    ? 'No clinic has a metadata problem. Organization reporting can rely on every record here.'
                    : 'No clinic matches this view.'}
                </p>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {visibleRows.map((clinic) => (
                      <article
                        key={clinic.id}
                        className="rounded-lg border border-border bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-semibold text-foreground">
                              {clinic.name}
                            </h3>
                            <p className="mt-1 truncate text-sm text-muted-foreground">
                              {clinic.region || 'No region assigned'}
                            </p>
                          </div>
                          <Badge variant={clinic.isActive ? 'finalized' : 'destructive'}>
                            {clinic.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>

                        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                          <div className="min-w-0">
                            <dt className="text-muted-foreground">Location code</dt>
                            <dd className="truncate font-mono text-xs text-foreground">
                              {clinic.locationCode || 'Not set'}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-muted-foreground">Time zone</dt>
                            <dd className="truncate text-foreground">{clinic.timezone}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-muted-foreground">Zone</dt>
                            <dd className="truncate font-mono text-xs text-foreground">
                              {clinic.zoneCode || 'None'}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-muted-foreground">Organization</dt>
                            <dd className="truncate text-foreground">
                              {clinic.organization?.name ?? 'Not linked'}
                            </dd>
                          </div>
                        </dl>

                        {clinic.metadataIssues.length > 0 ? (
                          <ul className="mt-3 flex flex-wrap gap-2">
                            {clinic.metadataIssues.map((issue) => (
                              <li key={issue.code}>
                                <Badge variant={CLINIC_METADATA_SEVERITY_VARIANT[issue.severity]}>
                                  {CLINIC_METADATA_ISSUE_LABELS[issue.code]}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <Button
                          variant="outline"
                          className="mt-4 w-full"
                          onClick={() => openEdit(clinic, headlineIssue(clinic)?.field)}
                        >
                          Edit clinic
                        </Button>
                      </article>
                    ))}
                  </div>

                  <Box
                    sx={{ height: 520, width: '100%' }}
                    className="hidden overflow-x-auto md:block"
                  >
                    <DataGrid
                      rows={visibleRows}
                      columns={columns}
                      loading={clinics.isRefreshing}
                      getRowId={(row) => row.id}
                      sx={dataGridSx}
                    />
                  </Box>
                </>
              )
            }
          </ResourceState>
        </CardContent>
      </Card>

      <ClinicMetadataDialog
        open={dialogOpen}
        mode={dialogMode}
        initialValues={dialogValues}
        organizations={organizationList}
        focusField={focusField}
        saving={saving}
        submitError={submitError}
        onSubmit={handleSubmit}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
