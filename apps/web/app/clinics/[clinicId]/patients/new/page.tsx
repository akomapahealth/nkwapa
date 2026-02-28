"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RouteGuard } from "@/components/RouteGuard";
import { PhoneInput } from "@/components/PhoneInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CreatePatientBody {
  firstName: string;
  lastName: string;
  dob?: string;
  sex?: "MALE" | "FEMALE" | "OTHER" | "UNKNOWN";
  phoneE164?: string;
  email?: string;
  nationalIdType: "VOTER_ID" | "NATIONAL_ID" | "PASSPORT" | "OTHER";
  nationalId: string;
}

interface ExistingPatient {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  nationalIdLast4: string | null;
}

export default function NewPatientPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const getToken = useAuth();

  const [form, setForm] = useState<CreatePatientBody>({
    firstName: "",
    lastName: "",
    dob: "",
    sex: "UNKNOWN",
    phoneE164: "",
    email: "",
    nationalIdType: "OTHER",
    nationalId: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictPatient, setConflictPatient] = useState<ExistingPatient | null>(
    null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setConflictPatient(null);
    try {
      const body: CreatePatientBody = {
        ...form,
        dob: form.dob || undefined,
        phoneE164: form.phoneE164 || undefined,
        email: form.email || undefined,
      };
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients`,
        {
          method: "POST",
          body: JSON.stringify(body),
          getToken,
        }
      );
      if (res.status === 409) {
        const json = (await res.json()) as {
          existingPatient?: ExistingPatient;
          message?: string;
        };
        setConflictPatient(json.existingPatient ?? null);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const patient = (await res.json()) as { id: string };
      router.push(`/clinics/${clinicId}/patients/${patient.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <RouteGuard requiredPermission="PATIENT.CREATE">
    <main style={{ padding: "2rem", fontFamily: "system-ui", maxWidth: 500 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href={`/clinics/${clinicId}/patients`}
          style={{ color: "#0066cc", textDecoration: "none" }}
        >
          ← Back to Patient Search
        </Link>
      </div>
      <h1>New Patient</h1>
      <form onSubmit={handleSubmit}>
        {error && !conflictPatient && (
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
        <Dialog
          open={!!conflictPatient}
          onOpenChange={(open) => {
            if (!open) setConflictPatient(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Patient already exists</DialogTitle>
              <DialogDescription>
                A patient with this national ID already exists in the system.
              </DialogDescription>
            </DialogHeader>
            {conflictPatient && (
              <div className="rounded-md border p-4 text-sm">
                <p className="font-medium">
                  {conflictPatient.firstName} {conflictPatient.lastName}
                </p>
                <p className="text-muted-foreground font-mono">
                  {conflictPatient.patientCode}
                </p>
                {conflictPatient.nationalIdLast4 && (
                  <p className="text-muted-foreground">
                    ID …{conflictPatient.nationalIdLast4}
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConflictPatient(null)}
              >
                Search again
              </Button>
              {conflictPatient && (
                <Button asChild>
                  <Link href={`/clinics/${clinicId}/patients/${conflictPatient.id}`}>
                    Open existing patient
                  </Link>
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <label>
            First name *
            <input
              required
              value={form.firstName}
              onChange={(e) =>
                setForm((f) => ({ ...f, firstName: e.target.value }))
              }
              style={{ display: "block", width: "100%", padding: "0.5rem" }}
            />
          </label>
          <label>
            Last name *
            <input
              required
              value={form.lastName}
              onChange={(e) =>
                setForm((f) => ({ ...f, lastName: e.target.value }))
              }
              style={{ display: "block", width: "100%", padding: "0.5rem" }}
            />
          </label>
          <label>
            DOB
            <input
              type="date"
              value={form.dob}
              onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
              style={{ display: "block", width: "100%", padding: "0.5rem" }}
            />
          </label>
          <label>
            Sex
            <select
              value={form.sex}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  sex: e.target.value as CreatePatientBody["sex"],
                }))
              }
              style={{ display: "block", width: "100%", padding: "0.5rem" }}
            >
              <option value="UNKNOWN">Unknown</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Phone (Ghana)
            <PhoneInput
              value={form.phoneE164}
              onChange={(v) => setForm((f) => ({ ...f, phoneE164: v }))}
              placeholder="024 123 4567"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              style={{ display: "block", width: "100%", padding: "0.5rem" }}
            />
          </label>
          <label>
            National ID type
            <select
              value={form.nationalIdType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  nationalIdType: e.target
                    .value as CreatePatientBody["nationalIdType"],
                }))
              }
              style={{ display: "block", width: "100%", padding: "0.5rem" }}
            >
              <option value="OTHER">Other</option>
              <option value="VOTER_ID">Voter ID</option>
              <option value="NATIONAL_ID">National ID</option>
              <option value="PASSPORT">Passport</option>
            </select>
          </label>
          <label>
            National ID *
            <input
              required
              value={form.nationalId}
              onChange={(e) =>
                setForm((f) => ({ ...f, nationalId: e.target.value }))
              }
              style={{ display: "block", width: "100%", padding: "0.5rem" }}
            />
          </label>
        </div>
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "0.5rem 1rem",
              background: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating…" : "Create Patient"}
          </button>
          <Link
            href={`/clinics/${clinicId}/patients`}
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
    </RouteGuard>
  );
}
