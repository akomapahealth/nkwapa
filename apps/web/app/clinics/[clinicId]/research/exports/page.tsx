"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

interface ResearchExportItem {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  fileFormat: string | null;
  recordCount: number | null;
  rejectionReason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  requestedBy?: { id: string; displayName: string };
  approvedBy?: { id: string; displayName: string } | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#fff3e0", text: "#e65100" },
  APPROVED: { bg: "#e3f2fd", text: "#1565c0" },
  REJECTED: { bg: "#ffebee", text: "#c62828" },
  COMPLETED: { bg: "#e8f5e9", text: "#2e7d32" },
};

export default function ResearchExportsPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const getToken = useAuth();

  const [exports, setExports] = useState<ResearchExportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchExports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports`,
        { getToken }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { items: ResearchExportItem[]; nextCursor: string | null };
      setExports(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken]);

  useEffect(() => {
    fetchExports();
  }, [fetchExports]);

  const handleRequest = async (format: "csv" | "json") => {
    setActionLoading("request");
    setError(null);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports`,
        {
          method: "POST",
          body: JSON.stringify({ fileFormat: format }),
          getToken,
        }
      );
      if (!res.ok) throw new Error(await res.text());
      await fetchExports();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (exportId: string, action: "approve" | "reject" | "execute") => {
    setActionLoading(exportId);
    setError(null);
    try {
      const body = action === "reject" ? JSON.stringify({ reason: prompt("Rejection reason:") || "No reason given" }) : undefined;
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports/${exportId}/${action}`,
        {
          method: "POST",
          body,
          getToken,
        }
      );
      if (!res.ok) throw new Error(await res.text());
      await fetchExports();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = async (exportId: string, fileFormat: string | null) => {
    setActionLoading(exportId);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports/${exportId}/download`,
        { getToken }
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `research-export-${exportId}.${fileFormat ?? "csv"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui", maxWidth: 900 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/"
          style={{ color: "#0066cc", textDecoration: "none", marginRight: "1rem" }}
        >
          &larr; Home
        </Link>
      </div>

      <h1>Research Exports</h1>

      <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => handleRequest("csv")}
          disabled={actionLoading === "request"}
          style={{
            padding: "0.5rem 1rem",
            background: "#1976d2",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: actionLoading === "request" ? "not-allowed" : "pointer",
          }}
        >
          Request CSV Export
        </button>
        <button
          onClick={() => handleRequest("json")}
          disabled={actionLoading === "request"}
          style={{
            padding: "0.5rem 1rem",
            background: "#7b1fa2",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: actionLoading === "request" ? "not-allowed" : "pointer",
          }}
        >
          Request JSON Export
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "0.5rem",
            background: "#ffebee",
            color: "#c62828",
            marginBottom: "1rem",
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      {loading && <p style={{ color: "#666" }}>Loading...</p>}

      {!loading && exports.length === 0 && (
        <p style={{ color: "#666" }}>No exports yet. Request one above.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {exports.map((exp) => {
          const colors = STATUS_COLORS[exp.status] ?? { bg: "#f5f5f5", text: "#333" };
          return (
            <div
              key={exp.id}
              style={{
                padding: "1rem",
                border: "1px solid #e0e0e0",
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.15rem 0.5rem",
                      borderRadius: 4,
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      background: colors.bg,
                      color: colors.text,
                    }}
                  >
                    {exp.status}
                  </span>
                  <span
                    style={{ marginLeft: "0.75rem", fontSize: "0.85rem", color: "#666" }}
                  >
                    {exp.fileFormat?.toUpperCase() ?? "CSV"} &middot;{" "}
                    {new Date(exp.requestedAt).toLocaleDateString()}
                  </span>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#999" }}>
                  {exp.id.slice(0, 8)}...
                </span>
              </div>

              <div style={{ fontSize: "0.85rem", color: "#555", marginBottom: "0.5rem" }}>
                Requested by: {exp.requestedBy?.displayName ?? "Unknown"}
                {exp.approvedBy && <> &middot; Approved by: {exp.approvedBy.displayName}</>}
                {exp.recordCount != null && <> &middot; {exp.recordCount} records</>}
              </div>

              {exp.rejectionReason && (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "#c62828",
                    marginBottom: "0.5rem",
                  }}
                >
                  Reason: {exp.rejectionReason}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem" }}>
                {exp.status === "PENDING" && (
                  <>
                    <button
                      onClick={() => handleAction(exp.id, "approve")}
                      disabled={actionLoading === exp.id}
                      style={{
                        padding: "0.25rem 0.5rem",
                        background: "#2e7d32",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(exp.id, "reject")}
                      disabled={actionLoading === exp.id}
                      style={{
                        padding: "0.25rem 0.5rem",
                        background: "#c62828",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      Reject
                    </button>
                  </>
                )}
                {exp.status === "APPROVED" && (
                  <button
                    onClick={() => handleAction(exp.id, "execute")}
                    disabled={actionLoading === exp.id}
                    style={{
                      padding: "0.25rem 0.5rem",
                      background: "#1565c0",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    Generate Dataset
                  </button>
                )}
                {exp.status === "COMPLETED" && (
                  <button
                    onClick={() => handleDownload(exp.id, exp.fileFormat)}
                    disabled={actionLoading === exp.id}
                    style={{
                      padding: "0.25rem 0.5rem",
                      background: "#2e7d32",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    Download
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
