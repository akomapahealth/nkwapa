"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FilePenLine, ShieldCheck, UserPlus } from "lucide-react";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { AppMetricCard } from "@/components/app-shell/AppMetricCard";
import { AppPageHeader } from "@/components/app-shell/AppPageHeader";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineNotice } from "@/components/ops/OpsShared";

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients`,
        {
          method: "POST",
          body: JSON.stringify(body),
          getToken,
        }
      );

      if (response.status === 409) {
        const payload = (await response.json()) as {
          existingPatient?: ExistingPatient;
        };
        setConflictPatient(payload.existingPatient ?? null);
        return;
      }

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const patient = (await response.json()) as { id: string };
      router.push(`/patients/${patient.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
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
      <div className="space-y-6">
        <Button variant="ghost" asChild className="w-fit rounded-2xl">
          <Link href="/patients">
            <ArrowLeft className="h-4 w-4" />
            Back to Patients
          </Link>
        </Button>

        <AppPageHeader
          eyebrow="Patient intake"
          title="Register a new patient"
          description="Capture a complete demographic record for the active clinic while checking for duplicates before the patient enters care."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <AppMetricCard
            title="Registration mode"
            value="Clinic"
            icon={UserPlus}
            detail="The patient record will be created for the active clinic."
          />
          <AppMetricCard
            title="Duplicate check"
            value="Enabled"
            icon={ShieldCheck}
            detail="National ID checks help prevent accidental duplicate patient records."
          />
          <AppMetricCard
            title="Workflow"
            value="Guided"
            icon={FilePenLine}
            detail="Complete the form once, then move directly into the patient record."
          />
        </div>

        <Card className="max-w-4xl rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl">Patient registration form</CardTitle>
            <CardDescription>
              Enter demographics, contact details, and the patient’s national ID information.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && !conflictPatient ? (
                <InlineNotice tone="error">{error}</InlineNotice>
              ) : null}

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
                      <p className="font-mono text-muted-foreground">
                        {conflictPatient.patientCode}
                      </p>
                      {conflictPatient.nationalIdLast4 && (
                        <p className="text-muted-foreground">
                          ID ...{conflictPatient.nationalIdLast4}
                        </p>
                      )}
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConflictPatient(null)}>
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name *</Label>
                    <Input
                      id="firstName"
                      required
                      value={form.firstName}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, firstName: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name *</Label>
                    <Input
                      id="lastName"
                      required
                      value={form.lastName}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, lastName: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dob">DOB</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={form.dob}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, dob: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Sex</Label>
                  <Select
                    value={form.sex}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        sex: value as CreatePatientBody["sex"],
                      }))
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
                    onChange={(value) =>
                      setForm((current) => ({ ...current, phoneE164: value }))
                    }
                    placeholder="024 123 4567"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>National ID type</Label>
                  <Select
                    value={form.nationalIdType}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        nationalIdType: value as CreatePatientBody["nationalIdType"],
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
                    onChange={(event) =>
                      setForm((current) => ({ ...current, nationalId: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading} className="rounded-2xl">
                  {loading ? "Creating..." : "Create Patient"}
                </Button>
                <Button variant="outline" asChild className="rounded-2xl">
                  <Link href="/patients">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
