'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Eye, FileCheck2, FileEdit, Stethoscope } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoHint } from '@/components/ui/info-hint';
import { EmptyState, InlineErrorState } from '@/components/feedback/AppState';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

interface QueueRow {
  id: string;
  patientCode: string;
  patientName: string;
  createdAt: string;
  bpStage?: string;
  glucoseFlag?: boolean;
  status: string;
}

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes('*') || permissions.includes(perm);
}

export default function QueuesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') ?? '';
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const clinicRoles =
    bootstrap?.memberships.find((membership) => membership.clinicId === clinicId)?.roles ?? [];

  const canFinalize = hasPermission(perms, 'DOCTOR.FINALIZE');
  const canReview = hasPermission(perms, 'ENCOUNTER.REVIEW');
  const canDrafts = hasPermission(perms, 'ENCOUNTER.READ');
  const canCosignClinicalNotes =
    isWebFeatureEnabled('clinicalNotes') &&
    clinicRoles.includes('DOCTOR') &&
    hasPermission(perms, 'CLINICAL_NOTE.COSIGN');

  const defaultTab = canCosignClinicalNotes
    ? 'cosign'
    : canFinalize
      ? 'finalize'
      : canReview
        ? 'review'
        : 'drafts';
  const [activeTab, setActiveTab] = useState(
    tabParam && ['drafts', 'review', 'finalize', 'cosign'].includes(tabParam)
      ? tabParam
      : defaultTab,
  );

  const [drafts, setDrafts] = useState<QueueRow[]>([]);
  const [review, setReview] = useState<QueueRow[]>([]);
  const [finalize, setFinalize] = useState<QueueRow[]>([]);
  const [cosign, setCosign] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(
    async (stage: 'DRAFT' | 'REVIEW' | 'DOCTOR_READY') => {
      if (!clinicId || !getToken) return [];
      const params = stage === 'DRAFT' ? 'status=DRAFT' : `status=IN_REVIEW&stage=${stage}`;
      const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/encounters?${params}`, {
        getToken,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Array<{
        id: string;
        status: string;
        createdAt: string;
        patient?: {
          patientCode: string;
          firstName: string;
          lastName: string;
        };
        vitals?: { systolicBp?: number; diastolicBp?: number };
        hypertensionAssessment?: { classification?: string };
        diabetesScreening?: { glucoseMgDl?: number; glucoseType?: string };
      }>;
      return data.map((e) => {
        const patient = e.patient;
        const name = patient ? `${patient.firstName} ${patient.lastName}`.trim() : '—';
        const code = patient?.patientCode ?? '—';
        const bp = e.hypertensionAssessment?.classification ?? '';
        const glucose =
          e.diabetesScreening?.glucoseMgDl != null
            ? (e.diabetesScreening.glucoseType === 'FASTING' &&
                e.diabetesScreening.glucoseMgDl >= 126) ||
              (e.diabetesScreening.glucoseType === 'RANDOM' &&
                e.diabetesScreening.glucoseMgDl >= 200)
            : false;
        return {
          id: e.id,
          patientCode: code,
          patientName: name,
          createdAt: e.createdAt,
          bpStage: bp,
          glucoseFlag: glucose,
          status: e.status,
        };
      });
    },
    [clinicId, getToken],
  );

  const loadAll = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const [d, r, f, c] = await Promise.all([
        canDrafts ? fetchQueue('DRAFT') : [],
        canReview ? fetchQueue('REVIEW') : [],
        canFinalize ? fetchQueue('DOCTOR_READY') : [],
        canCosignClinicalNotes && getToken
          ? apiFetch(`/clinics/${encodeURIComponent(clinicId)}/clinical-notes/pending-cosign`, {
              getToken,
              activeClinicId: clinicId,
            }).then(async (response) => {
              if (!response.ok) throw new Error(await response.text());
              const rows = (await response.json()) as Array<{
                id: string;
                encounterId: string;
                submittedAt: string;
                author: { displayName: string };
                patient: { patientCode: string; firstName: string; lastName: string };
              }>;
              return rows.map((note) => ({
                id: note.encounterId,
                patientCode: note.patient.patientCode,
                patientName: `${note.patient.firstName} ${note.patient.lastName}`.trim(),
                createdAt: note.submittedAt,
                status: `HAP note by ${note.author.displayName}`,
              }));
            })
          : [],
      ]);
      setDrafts(d);
      setReview(r);
      setFinalize(f);
      setCosign(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clinicId, canDrafts, canReview, canFinalize, canCosignClinicalNotes, fetchQueue, getToken]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const columns: DataTableColumn<QueueRow>[] = [
    { id: 'patientCode', accessorKey: 'patientCode', header: 'Patient Code' },
    { id: 'patientName', accessorKey: 'patientName', header: 'Patient Name' },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ getValue }) => {
        const v = getValue() as string | number | null | undefined;
        return v ? new Date(v as string).toLocaleString() : '';
      },
    },
    {
      id: 'bpStage',
      accessorKey: 'bpStage',
      header: 'BP',
      cell: ({ getValue }) =>
        getValue() ? <Badge variant="warning">{String(getValue())}</Badge> : null,
    },
    {
      id: 'glucoseFlag',
      accessorKey: 'glucoseFlag',
      header: 'DM Flag',
      cell: ({ getValue }) => (getValue() ? <Badge variant="destructive">Flag</Badge> : null),
    },
  ];

  const handleRowClick = (row: { id: string }) => {
    router.push(`/encounters/${row.id}`);
  };

  return (
    <RouteGuard requiredPermission="ENCOUNTER.READ" requiresClinic clinicSurface="Encounter queues">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinical workflow"
          title="Queues"
          description="See which visits are moving and which are waiting."
          helpTitle="How the queues work"
          helpText="Each lane groups encounters by the step they are currently in so staff can jump straight to the right record without bouncing between screens."
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AppMetricCard
            title="Drafts"
            value={drafts.length}
            icon={FileEdit}
            detail="Encounters still being prepared before review."
          />
          {canCosignClinicalNotes ? (
            <AppMetricCard
              title="Pending HAP cosigns"
              value={cosign.length}
              icon={FileCheck2}
              detail="HAP notes assigned to you and waiting for cosign."
            />
          ) : null}
          <AppMetricCard
            title="Needs review"
            value={review.length}
            icon={Eye}
            detail="Encounters waiting for clinical review."
          />
          <AppMetricCard
            title="Ready to finalize"
            value={finalize.length}
            icon={Stethoscope}
            detail="Encounters ready for doctor finalization."
          />
        </div>

        {error ? (
          <InlineErrorState
            title="The queues could not be loaded"
            description={error}
            onRetry={() => void loadAll()}
          />
        ) : null}

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">
                  <span className="align-middle">Encounter queues</span>
                  <InfoHint
                    label="Drafts are still being prepared, Needs review is waiting on clinical review, and Ready to finalize is waiting on doctor sign-off."
                    className="ml-2"
                  />
                </CardTitle>
                <CardDescription>Switch lanes and open the right encounter fast.</CardDescription>
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
                <p className="text-muted-foreground">Active lane</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {activeTab === 'drafts'
                    ? drafts.length
                    : activeTab === 'review'
                      ? review.length
                      : activeTab === 'finalize'
                        ? finalize.length
                        : cosign.length}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-2 xl:grid-cols-4">
                {canDrafts && <TabsTrigger value="drafts">Drafts</TabsTrigger>}
                {canReview && <TabsTrigger value="review">Needs Review</TabsTrigger>}
                {canFinalize && <TabsTrigger value="finalize">Ready to Finalize</TabsTrigger>}
                {canCosignClinicalNotes ? (
                  <TabsTrigger value="cosign">Pending HAP Cosign</TabsTrigger>
                ) : null}
              </TabsList>
              <TabsContent value="drafts" className="mt-4">
                <QueueContent
                  rows={drafts}
                  loading={loading}
                  columns={columns}
                  onRowClick={handleRowClick}
                />
              </TabsContent>
              <TabsContent value="review" className="mt-4">
                <QueueContent
                  rows={review}
                  loading={loading}
                  columns={columns}
                  onRowClick={handleRowClick}
                />
              </TabsContent>
              <TabsContent value="finalize" className="mt-4">
                <QueueContent
                  rows={finalize}
                  loading={loading}
                  columns={columns}
                  onRowClick={handleRowClick}
                />
              </TabsContent>
              {canCosignClinicalNotes ? (
                <TabsContent value="cosign" className="mt-4">
                  <QueueContent
                    rows={cosign}
                    loading={loading}
                    columns={columns}
                    onRowClick={handleRowClick}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}

function QueueContent({
  rows,
  loading,
  columns,
  onRowClick,
}: {
  rows: QueueRow[];
  loading: boolean;
  columns: DataTableColumn<QueueRow>[];
  onRowClick: (row: { id: string }) => void;
}) {
  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        title="Nothing in this queue"
        description="This lane is clear right now. Switch tabs or check back after the next clinical update."
      />
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <article key={row.id} className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{row.patientName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{row.patientCode}</p>
              </div>
              <Badge variant="outline">{row.status}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.bpStage ? <Badge variant="warning">{row.bpStage}</Badge> : null}
              {row.glucoseFlag ? <Badge variant="destructive">DM Flag</Badge> : null}
            </div>
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => onRowClick({ id: row.id })}
            >
              <ClipboardList className="h-4 w-4" />
              Open encounter
            </Button>
          </article>
        ))}
      </div>

      <div className="hidden md:block">
        <DataTable
          caption="Encounters in this lane"
          columns={columns}
          data={rows}
          isRefreshing={loading}
          onRowClick={onRowClick}
          pageSizeOptions={[10, 25]}
        />
      </div>
    </>
  );
}
