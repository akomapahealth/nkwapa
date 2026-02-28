"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

interface PatientSummary {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null;
  nationalIdLast4?: string | null;
}

interface PatientWithEncounters {
  patient: PatientSummary;
  recentEncounters: Array<{ id: string; status: string }>;
}

export default function PatientsPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const getToken = useAuth();

  const [q, setQ] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
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
      router.push(`/clinics/${clinicId}/encounters/${encounter.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui", maxWidth: 800 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/"
          style={{ color: "#0066cc", textDecoration: "none", marginRight: "1rem" }}
        >
          ← Home
        </Link>
        <Link
          href={`/clinics/${clinicId}/patients/new`}
          style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            background: "#1976d2",
            color: "white",
            borderRadius: 4,
            textDecoration: "none",
          }}
        >
          New Patient
        </Link>
      </div>
      <h1>Patient Search</h1>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, patient code, phone, or national ID last 4"
        style={{
          width: "100%",
          padding: "0.5rem",
          marginBottom: "1rem",
          fontSize: "1rem",
        }}
      />
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
      {loading && <p style={{ color: "#666" }}>Loading…</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {results.map((p) => (
          <li
            key={p.id}
            style={{
              padding: "0.75rem",
              border: "1px solid #eee",
              borderRadius: 4,
              marginBottom: "0.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong>
                {p.firstName} {p.lastName}
              </strong>
              <span style={{ marginLeft: "0.5rem", color: "#666" }}>
                {p.patientCode}
              </span>
              {p.phoneE164 && (
                <span style={{ marginLeft: "0.5rem", fontSize: "0.875rem" }}>
                  {p.phoneE164.replace(/(.{4}).*(.{4})/, "$1***$2")}
                </span>
              )}
              {p.nationalIdLast4 && (
                <span style={{ marginLeft: "0.5rem", fontSize: "0.875rem" }}>
                  …{p.nationalIdLast4}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Link
                href={`/clinics/${clinicId}/patients/${p.id}`}
                style={{ color: "#0066cc", textDecoration: "none" }}
              >
                View
              </Link>
              <button
                onClick={() => handleCheckIn(p.id)}
                disabled={loading}
                style={{
                  padding: "0.25rem 0.5rem",
                  background: "#2e7d32",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Check-in
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!loading && q.trim() && results.length === 0 && (
        <p style={{ color: "#666" }}>No patients found.</p>
      )}
    </main>
  );
}
