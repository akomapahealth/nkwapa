"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useBootstrap } from "@/lib/bootstrap-context";
import { apiFetch } from "@/lib/api";
import { getOpsDestination, hasPermission, readApiError } from "@/lib/ops";
import { RouteGuard } from "@/components/RouteGuard";
import { db } from "@/lib/db";
import { enqueueOutboxMutation } from "@/lib/outbox";
import { SYNC_OPERATION } from "@/lib/outbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft, Stethoscope, FileCheck } from "lucide-react";
import { PatientTrendsPanel } from "@/components/patients/PatientTrendsPanel";

interface ConsentStatusItem {
  consentType: string;
  status: string;
  grantedAt?: string;
}

interface PatientWithEncounters {
  patient: {
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    dob?: string | null;
    sex: string;
    phoneE164?: string | null;
    nationalIdLast4?: string | null;
  };
  recentEncounters: Array<{
    id: string;
    status: string;
    clinicId: string;
    patientId: string;
    createdAt: string;
  }>;
  consentStatus?: ConsentStatusItem[];
}

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.patientId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canRecordConsent = perms.includes("*") || perms.includes("CONSENT.RECORD");
  const canCreateOpsCheckIn = hasPermission(perms, "OPS.CHECKIN.CREATE");
  const opsDestination = getOpsDestination(perms);

  const [data, setData] = useState<PatientWithEncounters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchPatient = useCallback(async () => {
    if (!clinicId || !getToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/patients/${encodeURIComponent(patientId)}?clinicId=${encodeURIComponent(clinicId)}`,
        { getToken, activeClinicId: clinicId }
      );
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as PatientWithEncounters;
      setData(json);
    } catch {
      try {
        const patient = await db.patients.get(patientId);
        const allConsents = await db.patient_consents
          .where("patientId")
          .equals(patientId)
          .toArray();
        const consents = allConsents
          .filter((c) => c.clinicId === clinicId)
          .sort(
            (a, b) =>
              new Date(b.updatedAt ?? 0).getTime() -
              new Date(a.updatedAt ?? 0).getTime()
          );
        const byType = new Map<string, { consentType: string; status: string; grantedAt?: string }>();
        for (let i = consents.length - 1; i >= 0; i--) {
          const c = consents[i];
          if (!byType.has(c.consentType ?? "")) {
            byType.set(c.consentType ?? "", {
              consentType: c.consentType ?? "",
              status: c.status ?? "REVOKED",
              grantedAt: c.grantedAt,
            });
          }
        }
        const consentStatus = Array.from(byType.values());
        if (patient) {
          const localEncounters = await db.encounters
            .where("patientId")
            .equals(patientId)
            .toArray();
          const sorted = localEncounters.sort(
            (a, b) =>
              new Date(b.updatedAt ?? 0).getTime() -
              new Date(a.updatedAt ?? 0).getTime()
          );
          const recentEncounters = sorted.slice(0, 10).map((e) => ({
            id: e.id,
            status: e.status ?? "DRAFT",
            clinicId: e.clinicId,
            patientId: e.patientId,
            createdAt: e.createdAt ?? new Date().toISOString(),
          }));
          setData({
            patient: {
              id: patient.id,
              patientCode: patient.patientCode,
              firstName: patient.firstName,
              lastName: patient.lastName,
              dob: patient.dob ?? null,
              sex: patient.sex ?? "UNKNOWN",
              phoneE164: patient.phoneE164 ?? null,
              nationalIdLast4: patient.nationalIdLast4 ?? null,
            },
            recentEncounters,
            consentStatus,
          });
        } else {
          setData(null);
        }
      } catch (localErr) {
        setError(localErr instanceof Error ? localErr.message : "Failed to load patient");
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [patientId, clinicId, getToken]);

  useEffect(() => {
    if (clinicId) fetchPatient();
  }, [fetchPatient, clinicId]);

  const researchConsent = data?.consentStatus?.find(
    (c) => c.consentType === "RESEARCH_DEIDENTIFIED"
  );
  const hasGrantedResearchConsent = researchConsent?.status === "GRANTED";

  const handleRevoke = async () => {
    if (!clinicId || !hasGrantedResearchConsent) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/consents/revoke`,
        {
          method: "POST",
          body: JSON.stringify({ consentType: "RESEARCH_DEIDENTIFIED" }),
          getToken,
          activeClinicId: clinicId,
        }
      );
      if (!res.ok) throw new Error(await res.text());
      await fetchPatient();
    } catch {
      try {
        const consents = await db.patient_consents
          .where("patientId")
          .equals(patientId)
          .filter((c) => c.clinicId === clinicId && c.status === "GRANTED")
          .toArray();
        const consent = consents[0];
        if (consent) {
          const revokedAt = new Date().toISOString();
          await db.patient_consents.put({
            ...consent,
            status: "REVOKED",
            revokedAt,
            updatedAt: revokedAt,
          });
          await enqueueOutboxMutation(db, {
            clinicId,
            entityType: "patient_consent",
            entityId: consent.id,
            operation: SYNC_OPERATION.UPSERT,
            payloadJson: {
              patientId,
              clinicId,
              consentType: "RESEARCH_DEIDENTIFIED",
              status: "REVOKED",
              consentVersion: "v1-en",
              consentTextSnapshot: consent.consentTextSnapshot ?? "",
              grantedAt: consent.grantedAt,
              revokedAt,
              recordedByUserId: consent.recordedByUserId,
            },
          });
          await fetchPatient();
        }
      } catch (revokeErr) {
        setError(
          revokeErr instanceof Error ? revokeErr.message : "Failed to revoke consent"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!clinicId || !getToken) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/checkins`,
        {
          method: "POST",
          body: JSON.stringify({ patientId }),
          getToken,
          activeClinicId: clinicId,
        }
      );
      if (!res.ok) throw new Error(await readApiError(res));
      setSuccess(
        opsDestination
          ? "Patient added to the clinic board successfully."
          : "Patient checked in successfully."
      );
      if (opsDestination === "/today") {
        router.prefetch("/today");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!clinicId) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Select a clinic to view patient.</p>
      </div>
    );
  }

  if (loading && !data)
    return (
      <RouteGuard requiredPermission="PATIENT.READ">
        <div className="flex items-center justify-center p-8">Loading…</div>
      </RouteGuard>
    );
  if (error && !data)
    return (
      <RouteGuard requiredPermission="PATIENT.READ">
        <div className="space-y-4">
          <p className="text-destructive">{error}</p>
          <Button asChild variant="outline">
            <Link href="/patients">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Patients
            </Link>
          </Button>
        </div>
      </RouteGuard>
    );
  if (!data)
    return (
      <RouteGuard requiredPermission="PATIENT.READ">
        <div className="space-y-4">
          <p>Patient not found.</p>
          <Button asChild variant="outline">
            <Link href="/patients">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Patients
            </Link>
          </Button>
        </div>
      </RouteGuard>
    );

  const { patient, recentEncounters } = data;

  return (
    <RouteGuard requiredPermission="PATIENT.READ">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/patients">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Patients
          </Link>
        </Button>
        {canCreateOpsCheckIn ? (
          <Button onClick={() => void handleCheckIn()} disabled={loading}>
            <Stethoscope className="mr-2 h-4 w-4" />
            Check In Patient
          </Button>
        ) : null}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span>{success}</span>
          {opsDestination ? (
            <>
              {" "}
              <Link href={opsDestination} className="font-medium underline underline-offset-4">
                Open OPS view
              </Link>
            </>
          ) : null}
        </div>
      )}

      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold font-heading">
            {patient.firstName} {patient.lastName}
          </h1>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span className="font-mono font-medium">{patient.patientCode}</span>
            {patient.phoneE164 && <span>{patient.phoneE164}</span>}
            {patient.nationalIdLast4 && <span>…{patient.nationalIdLast4}</span>}
            {hasGrantedResearchConsent && (
              <Badge variant="finalized">Consent Granted</Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="encounters">Encounters</TabsTrigger>
          {canRecordConsent && <TabsTrigger value="consent">Consent</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Patient Details</h2>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                <span className="font-medium">Patient Code:</span>{" "}
                <span className="font-mono">{patient.patientCode}</span>
              </p>
              {patient.phoneE164 && (
                <p>
                  <span className="font-medium">Phone:</span> {patient.phoneE164}
                </p>
              )}
              {patient.dob && (
                <p>
                  <span className="font-medium">DOB:</span>{" "}
                  {new Date(patient.dob).toLocaleDateString()}
                </p>
              )}
              <p>
                <span className="font-medium">Sex:</span> {patient.sex}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="trends">
          <PatientTrendsPanel patientId={patientId} clinicId={clinicId} />
        </TabsContent>
        <TabsContent value="encounters">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Recent Encounters</h2>
            </CardHeader>
            <CardContent>
              {recentEncounters.length === 0 ? (
                <p className="text-muted-foreground">No encounters yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recentEncounters.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/encounters/${e.id}`}
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent touch-target"
                      >
                        <span>
                          {new Date(e.createdAt).toLocaleDateString()}
                        </span>
                        <Badge
                          variant={
                            e.status === "FINALIZED"
                              ? "finalized"
                              : e.status === "IN_REVIEW"
                                ? "review"
                                : "draft"
                          }
                        >
                          {e.status}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {canRecordConsent && (
        <TabsContent value="consent">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Research Consent</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {hasGrantedResearchConsent
                  ? "Research consent: Granted"
                  : researchConsent?.status === "REVOKED"
                    ? "Research consent: Revoked"
                    : "Research consent: Not granted"}
              </p>
              <div className="flex gap-2">
                {hasGrantedResearchConsent ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRevoke}
                    disabled={loading}
                  >
                    Revoke Consent
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link href={`/patients/${patientId}/consent`}>
                      <FileCheck className="mr-2 h-4 w-4" />
                      Record Consent
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      )}
      </Tabs>
    </div>
    </RouteGuard>
  );
}
