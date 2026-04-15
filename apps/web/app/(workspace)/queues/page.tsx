'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Eye, FileEdit, Stethoscope } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { dataGridSx } from '@/lib/datagrid-theme';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyStateCard, InlineNotice } from '@/components/ops/OpsShared';

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
  const clinicId = bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];

  const canFinalize = hasPermission(perms, 'DOCTOR.FINALIZE');
  const canReview = hasPermission(perms, 'PRECEPTOR.REVIEW');
  const canDrafts = hasPermission(perms, 'ENCOUNTER.READ');

  const defaultTab = canFinalize ? 'finalize' : canReview ? 'review' : 'drafts';
  const [activeTab, setActiveTab] = useState(
    tabParam && ['drafts', 'review', 'finalize'].includes(tabParam) ? tabParam : defaultTab,
  );

  const [drafts, setDrafts] = useState<QueueRow[]>([]);
  const [review, setReview] = useState<QueueRow[]>([]);
  const [finalize, setFinalize] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(
    async (stage: 'DRAFT' | 'PRECEPTOR' | 'DOCTOR_READY') => {
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
      const [d, r, f] = await Promise.all([
        canDrafts ? fetchQueue('DRAFT') : [],
        canReview ? fetchQueue('PRECEPTOR') : [],
        canFinalize ? fetchQueue('DOCTOR_READY') : [],
      ]);
      setDrafts(d);
      setReview(r);
      setFinalize(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clinicId, canDrafts, canReview, canFinalize, fetchQueue]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const columns: GridColDef[] = [
    { field: 'patientCode', headerName: 'Patient Code', width: 130 },
    { field: 'patientName', headerName: 'Patient Name', flex: 1 },
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 160,
      valueFormatter: (v) => (v ? new Date(v as string).toLocaleString() : ''),
    },
    {
      field: 'bpStage',
      headerName: 'BP',
      width: 100,
      renderCell: (params) =>
        params.value ? <Badge variant="warning">{String(params.value)}</Badge> : null,
    },
    {
      field: 'glucoseFlag',
      headerName: 'DM Flag',
      width: 90,
      renderCell: (params) => (params.value ? <Badge variant="destructive">Flag</Badge> : null),
    },
  ];

  const handleRowClick = (params: { id: unknown }) => {
    router.push(`/encounters/${String(params.id)}`);
  };

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="ENCOUNTER.READ">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to view queues.</p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="ENCOUNTER.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinical workflow"
          title="Queues"
          description="Monitor encounter progress from draft to review to finalization with clearer status views across desktop and mobile."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <AppMetricCard
            title="Drafts"
            value={drafts.length}
            icon={FileEdit}
            detail="Encounters still being prepared before review."
          />
          <AppMetricCard
            title="Needs review"
            value={review.length}
            icon={Eye}
            detail="Encounters waiting for preceptor review."
          />
          <AppMetricCard
            title="Ready to finalize"
            value={finalize.length}
            icon={Stethoscope}
            detail="Encounters ready for doctor finalization."
          />
        </div>

        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl">Encounter queues</CardTitle>
            <CardDescription>
              Switch between queue stages and open any encounter directly from the current lane.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl border border-border/70 bg-background p-2 sm:grid-cols-3">
                {canDrafts && <TabsTrigger value="drafts">Drafts</TabsTrigger>}
                {canReview && <TabsTrigger value="review">Needs Review</TabsTrigger>}
                {canFinalize && <TabsTrigger value="finalize">Ready to Finalize</TabsTrigger>}
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
  columns: GridColDef[];
  onRowClick: (params: { id: unknown }) => void;
}) {
  if (!loading && rows.length === 0) {
    return (
      <EmptyStateCard
        title="Nothing in this queue"
        description="This lane is clear right now. Switch tabs or check back after the next clinical update."
      />
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-3xl border border-border/80 bg-background/80 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
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

      <Box sx={{ height: 420, width: '100%' }} className="hidden overflow-x-auto md:block">
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          onRowClick={onRowClick}
          pageSizeOptions={[10, 25]}
          disableRowSelectionOnClick
          sx={{ ...dataGridSx, cursor: 'pointer' }}
        />
      </Box>
    </>
  );
}
