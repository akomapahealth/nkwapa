"use client";

import { useCallback, useEffect, useState } from "react";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RouteGuard } from "@/components/RouteGuard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";
import { dataGridSx } from "@/lib/datagrid-theme";

interface ReminderRow {
  id: string;
  clinicId: string;
  patientId: string;
  encounterId: string | null;
  channel: string;
  toAddress: string;
  templateKey: string;
  scheduledAt: string;
  sentAt: string | null;
  status: string;
  providerMessageId: string | null;
  failureReason: string | null;
  createdAt: string;
}

export default function RemindersPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;

  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReminders = useCallback(
    async (cursor?: string, append = false) => {
      if (!clinicId || !getToken) return;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (cursor) params.set("cursor", cursor);
        params.set("limit", "50");
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/reminders?${params.toString()}`,
          { getToken }
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          items: ReminderRow[];
          nextCursor: string | null;
        };
        if (append) {
          setRows((prev) => [...prev, ...data.items]);
        } else {
          setRows(data.items);
        }
        setNextCursor(data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (!append) setRows([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [clinicId, getToken, status, from, to]
  );

  useEffect(() => {
    if (clinicId) fetchReminders();
  }, [fetchReminders, clinicId]);

  const columns: GridColDef[] = [
    {
      field: "createdAt",
      headerName: "Created",
      width: 160,
      valueFormatter: (v) =>
        v ? new Date(v as string).toLocaleString() : "",
    },
    {
      field: "scheduledAt",
      headerName: "Scheduled",
      width: 160,
      valueFormatter: (v) =>
        v ? new Date(v as string).toLocaleString() : "",
    },
    {
      field: "status",
      headerName: "Status",
      width: 100,
      renderCell: (params) => (
        <Badge
          variant={
            params.value === "SENT"
              ? "finalized"
              : params.value === "FAILED"
                ? "destructive"
                : "draft"
          }
        >
          {String(params.value)}
        </Badge>
      ),
    },
    { field: "templateKey", headerName: "Template", width: 180 },
    {
      field: "toAddress",
      headerName: "To",
      width: 140,
      valueFormatter: (v) =>
        v && String(v).length > 8
          ? `${String(v).slice(0, 4)}***${String(v).slice(-4)}`
          : String(v),
    },
    { field: "failureReason", headerName: "Failure", width: 150 },
  ];

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="REMINDER.READ">
        <div className="p-4">
          <p className="text-muted-foreground">
            Select a clinic to view reminders.
          </p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="REMINDER.READ">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold font-heading">Reminders</h1>
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-9 w-[140px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">All</option>
              <option value="QUEUED">Queued</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => fetchReminders()}
              disabled={loading}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Apply"}
            </button>
          </div>
        </div>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Box sx={{ height: 500, width: "100%" }} className="overflow-x-auto">
          <DataGrid
            rows={rows}
            columns={columns}
            loading={loading}
            pageSizeOptions={[25, 50]}
            sx={dataGridSx}
          />
        </Box>
        {nextCursor && (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={() => fetchReminders(nextCursor, true)}
              disabled={loadingMore}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </RouteGuard>
  );
}
