"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { AppMetricCard } from "@/components/app-shell/AppMetricCard";
import { AppPageHeader } from "@/components/app-shell/AppPageHeader";
import { getOpsDestination, hasPermission, readApiError } from "@/lib/ops";
import { RouteGuard } from "@/components/RouteGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard, InlineNotice } from "@/components/ops/OpsShared";

interface PatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null;
  nationalIdLast4?: string | null;
}

export default function PatientsPage() {
  const router = useRouter();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canCreateOpsCheckIn = hasPermission(perms, "OPS.CHECKIN.CREATE");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!clinicId || !getToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/search?q=${encodeURIComponent(q)}`,
        { getToken }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as PatientSummary[];
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, q, getToken]);

  useEffect(() => {
    const t = setTimeout(() => {
      search();
    }, q.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, search]);

  const handleCheckIn = async (patient: PatientSummary) => {
    if (!clinicId || !getToken) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/checkins`,
        {
          method: "POST",
          body: JSON.stringify({ patientId: patient.id }),
          getToken,
          activeClinicId: clinicId,
        }
      );
      if (!res.ok) throw new Error(await readApiError(res));

      const destination = getOpsDestination(perms);
      setSuccess(
        destination
          ? `${patient.firstName} ${patient.lastName} is now on the clinic board.`
          : `${patient.firstName} ${patient.lastName} has been checked in successfully.`
      );

      if (destination === "/today") {
        router.prefetch("/today");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const columns: GridColDef[] = [
    { field: "patientCode", headerName: "Patient Code", width: 130 },
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      valueGetter: (_, row) => `${row.firstName} ${row.lastName}`.trim(),
    },
    {
      field: "phoneE164",
      headerName: "Phone",
      width: 140,
      valueFormatter: (v) =>
        v ? String(v).replace(/(.{4}).*(.{4})/, "$1***$2") : "",
    },
    {
      field: "nationalIdLast4",
      headerName: "ID Last 4",
      width: 90,
      valueFormatter: (v) => (v ? `…${v}` : ""),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 180,
      sortable: false,
      renderCell: (params) => (
        <div className="flex gap-2">
          <Link
            href={`/patients/${params.row.id}`}
            className="text-primary hover:underline text-sm"
          >
            View
          </Link>
          {canCreateOpsCheckIn ? (
            <button
              type="button"
              onClick={() => handleCheckIn(params.row as PatientSummary)}
              disabled={loading}
              className="text-sm text-green-700 hover:underline disabled:opacity-50"
            >
              Check-in
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const rows = results.map((p) => ({ ...p, id: p.id }));

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="PATIENT.SEARCH">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to search patients.</p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="PATIENT.SEARCH">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Patient registry"
          title="Patients"
          description="Search patient records quickly, open detail views, and hand off to clinic operations from a cleaner, responsive workspace."
          actions={
            <Button asChild>
              <Link href="/patients/new">
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
            detail="Patients currently shown for the active search."
          />
          <AppMetricCard
            title="Search mode"
            value={q.trim() ? "Focused" : "Browsing"}
            icon={Search}
            detail={
              q.trim()
                ? "Results are filtered by your current query."
                : "Enter a patient name, code, phone, or ID."
            }
          />
          <AppMetricCard
            title="OPS handoff"
            value={canCreateOpsCheckIn ? "Enabled" : "Read only"}
            icon={UserPlus}
            detail="Check-in shortcuts appear when your role can add patients to OPS."
          />
        </div>

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl">Search patients</CardTitle>
            <CardDescription>
              Search by name, patient code, phone, or national ID fragment. Results update as you type.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
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
                <Link href={getOpsDestination(perms)!} className="font-medium underline underline-offset-4">
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
              Open a patient record directly or check them into the active clinic workflow when permitted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!loading && q.trim() && results.length === 0 ? (
              <EmptyStateCard
                title="No patients found"
                description="Try a broader search term or confirm the patient is registered in the active clinic."
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
                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => router.push(`/patients/${row.id}`)}
                        >
                          View
                        </Button>
                        {canCreateOpsCheckIn ? (
                          <Button
                            className="flex-1"
                            disabled={loading}
                            onClick={() => handleCheckIn(row)}
                          >
                            Check-in
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <Box sx={{ height: 460, width: "100%" }} className="hidden overflow-x-auto md:block">
                  <DataGrid
                    rows={rows}
                    columns={columns}
                    loading={loading}
                    pageSizeOptions={[10, 25]}
                    onRowClick={(params) => router.push(`/patients/${params.id}`)}
                    sx={{ ...dataGridSx, cursor: "pointer" }}
                  />
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
