"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RouteGuard } from "@/components/RouteGuard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";

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
  return permissions.includes("*") || permissions.includes(perm);
}

export default function QueuesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];

  const canFinalize = hasPermission(perms, "DOCTOR.FINALIZE");
  const canReview = hasPermission(perms, "PRECEPTOR.REVIEW");
  const canDrafts = hasPermission(perms, "ENCOUNTER.READ");

  const defaultTab = canFinalize ? "finalize" : canReview ? "review" : "drafts";
  const [activeTab, setActiveTab] = useState(
    tabParam && ["drafts", "review", "finalize"].includes(tabParam)
      ? tabParam
      : defaultTab
  );

  const [drafts, setDrafts] = useState<QueueRow[]>([]);
  const [review, setReview] = useState<QueueRow[]>([]);
  const [finalize, setFinalize] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(
    async (stage: "DRAFT" | "PRECEPTOR" | "DOCTOR_READY") => {
      if (!clinicId || !getToken) return [];
      const params =
        stage === "DRAFT"
          ? "status=DRAFT"
          : `status=IN_REVIEW&stage=${stage}`;
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters?${params}`,
        { getToken }
      );
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
        const name = patient
          ? `${patient.firstName} ${patient.lastName}`.trim()
          : "—";
        const code = patient?.patientCode ?? "—";
        const bp = e.hypertensionAssessment?.classification ?? "";
        const glucose =
          e.diabetesScreening?.glucoseMgDl != null
            ? (e.diabetesScreening.glucoseType === "FASTING" &&
                e.diabetesScreening.glucoseMgDl >= 126) ||
              (e.diabetesScreening.glucoseType === "RANDOM" &&
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
    [clinicId, getToken]
  );

  const loadAll = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const [d, r, f] = await Promise.all([
        canDrafts ? fetchQueue("DRAFT") : [],
        canReview ? fetchQueue("PRECEPTOR") : [],
        canFinalize ? fetchQueue("DOCTOR_READY") : [],
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
    { field: "patientCode", headerName: "Patient Code", width: 130 },
    { field: "patientName", headerName: "Patient Name", flex: 1 },
    {
      field: "createdAt",
      headerName: "Created",
      width: 160,
      valueFormatter: (v) =>
        v ? new Date(v as string).toLocaleString() : "",
    },
    {
      field: "bpStage",
      headerName: "BP",
      width: 100,
      renderCell: (params) =>
        params.value ? (
          <Badge variant="warning">{String(params.value)}</Badge>
        ) : null,
    },
    {
      field: "glucoseFlag",
      headerName: "DM Flag",
      width: 90,
      renderCell: (params) =>
        params.value ? (
          <Badge variant="destructive">Flag</Badge>
        ) : null,
    },
  ];

  const handleRowClick = (params: { id: unknown }) => {
    router.push(`/encounters/${String(params.id)}`);
  };

  const getRows = () => {
    if (activeTab === "drafts") return drafts;
    if (activeTab === "review") return review;
    return finalize;
  };

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="ENCOUNTER.READ">
        <div className="p-4">
          <p className="text-muted-foreground">
            Select a clinic to view queues.
          </p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="ENCOUNTER.READ">
    <div className="space-y-4">
      <h1 className="text-2xl font-bold font-heading">Queues</h1>
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {canDrafts && <TabsTrigger value="drafts">Drafts</TabsTrigger>}
          {canReview && <TabsTrigger value="review">Needs Review</TabsTrigger>}
          {canFinalize && (
            <TabsTrigger value="finalize">Ready to Finalize</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="drafts" className="mt-4">
          <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
            <DataGrid
              rows={drafts}
              columns={columns}
              loading={loading}
              onRowClick={handleRowClick}
              pageSizeOptions={[10, 25]}
              disableRowSelectionOnClick
              sx={{ ...dataGridSx, cursor: "pointer" }}
            />
          </Box>
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
            <DataGrid
              rows={review}
              columns={columns}
              loading={loading}
              onRowClick={handleRowClick}
              pageSizeOptions={[10, 25]}
              disableRowSelectionOnClick
              sx={{ ...dataGridSx, cursor: "pointer" }}
            />
          </Box>
        </TabsContent>
        <TabsContent value="finalize" className="mt-4">
          <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
            <DataGrid
              rows={finalize}
              columns={columns}
              loading={loading}
              onRowClick={handleRowClick}
              pageSizeOptions={[10, 25]}
              disableRowSelectionOnClick
              sx={{ ...dataGridSx, cursor: "pointer" }}
            />
          </Box>
        </TabsContent>
      </Tabs>
    </div>
    </RouteGuard>
  );
}
