"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useBootstrap } from "@/lib/bootstrap-context";
import { apiFetch } from "@/lib/api";
import { CONSENT_TEXT_V1_EN } from "@/lib/consent-text";
import { db } from "@/lib/db";
import { enqueueOutboxMutation } from "@/lib/outbox";
import { SYNC_OPERATION } from "@/lib/outbox";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ConsentPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const patientId = params.patientId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;

  const [attested, setAttested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attested) {
      setError("You must attest that the patient has been informed and has granted consent.");
      return;
    }
    setLoading(true);
    setError(null);

    const consentId = generateId();
    const grantedAt = new Date().toISOString();
    const recordedByUserId = bootstrap?.userId ?? "";

    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/consents`,
        {
          method: "POST",
          body: JSON.stringify({
            consentType: "RESEARCH_DEIDENTIFIED",
            consentTextSnapshot: CONSENT_TEXT_V1_EN,
            consentVersion: "v1-en",
          }),
          getToken,
          activeClinicId: clinicId,
        }
      );
      if (res.ok) {
        router.push(`/clinics/${clinicId}/patients/${patientId}`);
        return;
      }
      const errText = await res.text();
      setError(errText || "Failed to record consent");
      setLoading(false);
      return;
    } catch {
      // Network error – fall back to offline flow
    }

    try {
        const consentRecord = {
          id: consentId,
          patientId,
          clinicId,
          consentType: "RESEARCH_DEIDENTIFIED",
          status: "GRANTED",
          consentVersion: "v1-en",
          consentTextSnapshot: CONSENT_TEXT_V1_EN,
          grantedAt,
          revokedAt: undefined,
          recordedByUserId,
          witnessName: undefined,
          witnessPhoneE164: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.patient_consents.put(consentRecord);
        await enqueueOutboxMutation(db, {
          clinicId,
          entityType: "patient_consent",
          entityId: consentId,
          operation: SYNC_OPERATION.UPSERT,
          payloadJson: {
            patientId,
            clinicId,
            consentType: "RESEARCH_DEIDENTIFIED",
            status: "GRANTED",
            consentVersion: "v1-en",
            consentTextSnapshot: CONSENT_TEXT_V1_EN,
            grantedAt,
            revokedAt: null,
            recordedByUserId: recordedByUserId || undefined,
          },
        });
      router.push(`/clinics/${clinicId}/patients/${patientId}`);
      return;
    } catch (offlineErr) {
      setError(
        offlineErr instanceof Error ? offlineErr.message : "Failed to save consent offline"
      );
    }

    setLoading(false);
  };

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "system-ui",
        maxWidth: 600,
      }}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href={`/clinics/${clinicId}/patients/${patientId}`}
          style={{ color: "#0066cc", textDecoration: "none" }}
        >
          ← Back to Patient
        </Link>
      </div>

      <h1 style={{ marginBottom: "1rem" }}>Record Research Consent</h1>

      <div
        style={{
          padding: "1rem",
          background: "#f5f5f5",
          borderRadius: 8,
          marginBottom: "1.5rem",
          whiteSpace: "pre-wrap",
          fontSize: "0.95rem",
          lineHeight: 1.6,
        }}
      >
        {CONSENT_TEXT_V1_EN}
      </div>

      <form onSubmit={handleSubmit}>
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

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
            marginBottom: "1.5rem",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            style={{ marginTop: "0.25rem" }}
          />
          <span>
            I attest that the patient has been informed and has granted consent.
          </span>
        </label>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="submit"
            disabled={loading || !attested}
            style={{
              padding: "0.5rem 1rem",
              background: attested && !loading ? "#2e7d32" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: attested && !loading ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "Recording…" : "Record Consent"}
          </button>
          <Link
            href={`/clinics/${clinicId}/patients/${patientId}`}
            style={{
              padding: "0.5rem 1rem",
              display: "inline-block",
              color: "#666",
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
