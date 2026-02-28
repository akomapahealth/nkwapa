"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RouteGuard } from "@/components/RouteGuard";
import { PhoneInput } from "@/components/PhoneInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const router = useRouter();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;

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
  const [conflictPatient, setConflictPatient] = useState<ExistingPatient | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !getToken) return;
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
      router.push(`/patients/${patient.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="PATIENT.CREATE">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to create a patient.</p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="PATIENT.CREATE">
    <div className="space-y-6 max-w-lg">
      <div>
        <Button variant="ghost" asChild>
          <Link href="/patients">← Back to Patients</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-bold">New Patient</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && !conflictPatient && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Dialog
          open={!!conflictPatient}
          onOpenChange={(open) => {
            if (!open) {
              setConflictPatient(null);
            }
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
                onClick={() => {
                  setConflictPatient(null);
                }}
              >
                Search again
              </Button>
              {conflictPatient && (
                <Button asChild>
                  <Link href={`/patients/${conflictPatient.id}`}>
                    Open existing patient
                  </Link>
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name *</Label>
              <Input
                id="firstName"
                required
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name *</Label>
              <Input
                id="lastName"
                required
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dob">DOB</Label>
            <Input
              id="dob"
              type="date"
              value={form.dob}
              onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Sex</Label>
            <Select
              value={form.sex}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, sex: v as CreatePatientBody["sex"] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UNKNOWN">Unknown</SelectItem>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Phone (Ghana)</Label>
            <PhoneInput
              value={form.phoneE164}
              onChange={(v) => setForm((f) => ({ ...f, phoneE164: v }))}
              placeholder="024 123 4567"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>National ID type</Label>
            <Select
              value={form.nationalIdType}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  nationalIdType: v as CreatePatientBody["nationalIdType"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OTHER">Other</SelectItem>
                <SelectItem value="VOTER_ID">Voter ID</SelectItem>
                <SelectItem value="NATIONAL_ID">National ID</SelectItem>
                <SelectItem value="PASSPORT">Passport</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nationalId">National ID *</Label>
            <Input
              id="nationalId"
              required
              value={form.nationalId}
              onChange={(e) =>
                setForm((f) => ({ ...f, nationalId: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create Patient"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/patients">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
    </RouteGuard>
  );
}
