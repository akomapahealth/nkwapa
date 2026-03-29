"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Box } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Search, Stethoscope, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBootstrap } from "@/lib/bootstrap-context";
import { apiFetch } from "@/lib/api";
import { AppMetricCard } from "@/components/app-shell/AppMetricCard";
import { AppPageHeader } from "@/components/app-shell/AppPageHeader";
import { getOpsDestination, hasPermission, readApiError } from "@/lib/ops";
import { RouteGuard } from "@/components/RouteGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyStateCard, InlineNotice } from "@/components/ops/OpsShared";
import { dataGridSx } from "@/lib/datagrid-theme";

interface PatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null;
  nationalIdLast4?: string | null;
}

export default function ClinicPatientsPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canCreateOpsCheckIn = hasPermission(perms, "OPS.CHECKIN.CREATE");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!clinicId || !getToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/search?q=${encodeURIComponent(q)}`,
        { getToken, activeClinicId: clinicId }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setResults((await response.json()) as PatientSummary[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken, q]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void search();
    }, q.trim() ? 300 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [q, search]);

  const handleCheckIn = async (patient: PatientSummary) => {
    if (!clinicId || !getToken) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/checkins`,
        {
          method: "POST",
          body: JSON.stringify({ patientId: patient.id }),
          getToken,
          activeClinicId: clinicId,
        }
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const destination = getOpsDestination(perms);
      setSuccess(
        destination
          ? `${patient.firstName} ${patient.lastName} is now on the clinic board.`
          : `${patient.firstName} ${patient.lastName} has been checked in successfully.`
      );

      if (destination === "/today") {
        router.prefetch("/today");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  };

  const columns: GridColDef[] = [
    { field: "patientCode", headerName: "Patient Code", width: 140 },
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      valueGetter: (_, row) => `${row.firstName} ${row.lastName}`.trim(),
    },
    {
      field: "phoneE164",
      headerName: "Phone",
      width: 150,
      valueFormatter: (value) =>
        value ? String(value).replace(/(.{4}).*(.{4})/, "$1***$2") : "",
    },
    {
      field: "nationalIdLast4",
      headerName: "ID Last 4",
      width: 100,
      valueFormatter: (value) => (value ? `...${value}` : ""),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 180,
      sortable: false,
      renderCell: (params) => (
        <div className="flex gap-2">
          <Link
            href={`/clinics/${clinicId}/patients/${params.row.id}`}
            className="text-sm text-primary hover:underline"
          >
            View
          </Link>
          {canCreateOpsCheckIn ? (
            <button
              type="button"
              onClick={() => void handleCheckIn(params.row as PatientSummary)}
              disabled={loading}
              className="text-sm text-emerald-700 hover:underline disabled:opacity-50"
            >
              Check-in
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const rows = results.map((patient) => ({ ...patient, id: patient.id }));

  return (
    <RouteGuard requiredPermission="PATIENT.SEARCH">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinic patient registry"
          title="Patient Search"
          description="Search this clinic’s patient records quickly, open detailed charts, and move patients into today’s workflow without leaving the page."
          actions={
            <Button asChild>
              <Link href={`/clinics/${clinicId}/patients/new`}>
                <UserPlus className="h-4 w-4" />
                New Patient
              </Link>
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <AppMetricCard
            title="Visible results"
            value={rows.length}
            icon={Users}
            detail="Patients currently shown for your clinic search."
          />
          <AppMetricCard
            title="Search mode"
            value={q.trim() ? "Focused" : "Browsing"}
            icon={Search}
            detail={
              q.trim()
                ? "Results are filtered by the active query."
                : "Search by name, code, phone, or national ID."
            }
          />
          <AppMetricCard
            title="OPS handoff"
            value={canCreateOpsCheckIn ? "Enabled" : "Read only"}
            icon={Stethoscope}
            detail="Check-in shortcuts appear here when your role can add patients to the clinic board."
          />
        </div>

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl">Search patients</CardTitle>
            <CardDescription>
              Results update as you type and stay scoped to the active clinic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search by name, patient code, phone, or national ID last 4"
              className="w-full md:max-w-xl"
            />
          </CardContent>
        </Card>

        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        {success ? (
          <InlineNotice tone="success">
            <span>{success}</span>
            {getOpsDestination(perms) ? (
              <>
                {" "}
                <Link
                  href={getOpsDestination(perms)!}
                  className="font-medium underline underline-offset-4"
                >
                  Open OPS view
                </Link>
              </>
            ) : null}
          </InlineNotice>
        ) : null}

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl">Patient results</CardTitle>
            <CardDescription>
              Open records directly or start the next step in care from the same surface.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!loading && q.trim() && rows.length === 0 ? (
              <EmptyStateCard
                title="No patients found"
                description="Try a broader search term or confirm the patient has already been registered in this clinic."
              />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {rows.map((row) => (
                    <article
                      key={row.id}
                      className="rounded-3xl border border-border/80 bg-background/80 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            {row.firstName} {row.lastName}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {row.patientCode}
                          </p>
                        </div>
                        {row.nationalIdLast4 ? (
                          <span className="text-xs text-muted-foreground">
                            ...{row.nationalIdLast4}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {row.phoneE164 || "No phone on file"}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline" className="rounded-2xl">
                          <Link href={`/clinics/${clinicId}/patients/${row.id}`}>View record</Link>
                        </Button>
                        {canCreateOpsCheckIn ? (
                          <Button
                            size="sm"
                            onClick={() => void handleCheckIn(row)}
                            disabled={loading}
                            className="rounded-2xl"
                          >
                            Check-in
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden md:block">
                  <Box sx={{ width: "100%" }}>
                    <DataGrid
                      autoHeight
                      disableColumnMenu
                      disableRowSelectionOnClick
                      rows={rows}
                      columns={columns}
                      loading={loading}
                      getRowHeight={() => 64}
                      pageSizeOptions={[5, 10, 25]}
                      initialState={{
                        pagination: { paginationModel: { pageSize: 10, page: 0 } },
                      }}
                      sx={dataGridSx}
                    />
                  </Box>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
