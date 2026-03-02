"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RouteGuard } from "@/components/RouteGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";

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

  const [q, setQ] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleCheckIn = async (patientId: string) => {
    if (!clinicId || !getToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters`,
        {
          method: "POST",
          body: JSON.stringify({ patientId }),
          getToken,
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const encounter = (await res.json()) as { id: string };
      router.push(`/encounters/${encounter.id}`);
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
          <button
            type="button"
            onClick={() => handleCheckIn(params.row.id)}
            disabled={loading}
            className="text-sm text-green-600 hover:underline disabled:opacity-50"
          >
            Check-in
          </button>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-heading">Patients</h1>
        <Button asChild>
          <Link href="/patients/new">New Patient</Link>
        </Button>
      </div>
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, patient code, phone, or national ID last 4"
        className="w-full md:max-w-md"
      />
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          pageSizeOptions={[10, 25]}
          onRowClick={(params) => router.push(`/patients/${params.id}`)}
          sx={{ ...dataGridSx, cursor: "pointer" }}
        />
      </Box>
      {!loading && q.trim() && results.length === 0 && (
        <p className="text-muted-foreground">No patients found.</p>
      )}
    </div>
    </RouteGuard>
  );
}
