"use client";

import { useCallback, useEffect, useState } from "react";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RouteGuard } from "@/components/RouteGuard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Box } from "@mui/material";

interface AuditRow {
  id: string;
  createdAt: string;
  actorDisplayName: string;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
}

export default function AuditPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [entityType, setEntityType] = useState("");
  const [requestId, setRequestId] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = useCallback(
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
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (action) params.set("action", action);
        if (actor) params.set("actor", actor);
        if (entityType) params.set("entityType", entityType);
        if (requestId) params.set("requestId", requestId);
        if (cursor) params.set("cursor", cursor);
        params.set("limit", "50");
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/audit?${params.toString()}`,
          { getToken }
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          items: AuditRow[];
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
    [clinicId, getToken, from, to, action, actor, entityType, requestId]
  );

  useEffect(() => {
    if (clinicId) fetchAudit();
  }, [fetchAudit, clinicId]);

  const columns: GridColDef[] = [
    {
      field: "createdAt",
      headerName: "Time",
      width: 180,
      valueFormatter: (v) =>
        v ? new Date(v as string).toLocaleString() : "",
    },
    {
      field: "actorDisplayName",
      headerName: "Actor",
      width: 150,
    },
    { field: "action", headerName: "Action", width: 200 },
    { field: "entityType", headerName: "Entity", width: 120 },
    { field: "entityId", headerName: "Entity ID", width: 280 },
    { field: "requestId", headerName: "Request ID", width: 120 },
  ];

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="AUDIT.READ">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to view audit.</p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="AUDIT.READ">
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <div className="flex flex-wrap gap-4">
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
        <div className="space-y-2">
          <Label htmlFor="action">Action</Label>
          <Input
            id="action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. ENCOUNTER.CREATE"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="actor">Actor (user ID)</Label>
          <Input
            id="actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Filter by actor"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entityType">Entity type</Label>
          <Input
            id="entityType"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            placeholder="e.g. Encounter"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="requestId">Request ID</Label>
          <Input
            id="requestId"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            placeholder="Filter by request ID"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => fetchAudit()}
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
      <Box sx={{ height: 500, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          pageSizeOptions={[25, 50, 100]}
        />
      </Box>
      {nextCursor && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => fetchAudit(nextCursor, true)}
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
