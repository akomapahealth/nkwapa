'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import { getOpsDestination, hasPermission, readApiError } from '@/lib/ops';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { db } from '@/lib/db';
import { enqueueOutboxMutation } from '@/lib/outbox';
import { SYNC_OPERATION } from '@/lib/outbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  FileCheck,
  Pencil,
  ShieldCheck,
  Stethoscope,
  UserPlus,
} from 'lucide-react';
import { PatientTrendsPanel } from '@/components/patients/PatientTrendsPanel';
import { MedicalHistoryPanel } from '@/components/patients/MedicalHistoryPanel';
import { MedicationReconciliationPanel } from '@/components/patients/MedicationReconciliationPanel';
import { DiabetesHistoryPanel } from '@/components/patients/DiabetesHistoryPanel';
import { ResidentialLocationSummary } from '@/components/patients/ResidentialLocationSummary';
import { PatientClinicalNotesPanel } from '@/components/clinical-notes/PatientClinicalNotesPanel';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { EmptyStateCard, InlineNotice } from '@/components/ops/OpsShared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    email?: string | null;
    nationalIdLast4?: string | null;
    residentialLocationStatus?: string | null;
    residentialRegion?: string | null;
    residentialDistrict?: string | null;
    residentialCommunity?: string | null;
    residentialAddressNote?: string | null;
  };
  portalAccess?: {
    status: 'LINKED' | 'INVITED' | 'UNLINKED' | 'MERGED';
    linkedUserId: string | null;
    linkedKeycloakSub: string | null;
    mergedIntoPatientId: string | null;
    invites: Array<{
      id: string;
      status: string;
      email: string | null;
      phoneE164: string | null;
      createdAt: string;
      expiresAt: string | null;
    }>;
  };
  resolvedFromPatientId?: string | null;
  recentEncounters: Array<{
    id: string;
    status: string;
    clinicId: string;
    patientId: string;
    createdAt: string;
  }>;
  consentStatus?: ConsentStatusItem[];
}

interface PatientRegistryCandidate {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null;
  email?: string | null;
  nationalIdLast4?: string | null;
}

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const patientId = params.patientId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const isSystemAdmin = bootstrap?.globalRoles?.includes('SYSTEM_ADMIN') ?? false;
  const canRecordConsent = perms.includes('*') || perms.includes('CONSENT.RECORD');
  const canUpdatePatient = perms.includes('*') || perms.includes('PATIENT.UPDATE');
  const canViewSelfReports = perms.includes('*') || perms.includes('PATIENT.SELF_REPORT.READ');
  const canLinkPortal = perms.includes('*') || perms.includes('PATIENT.PORTAL.LINK');
  const canReadMedicalHistory = perms.includes('*') || perms.includes('MEDICAL_HISTORY.READ');
  const canWriteMedicalHistory = perms.includes('*') || perms.includes('MEDICAL_HISTORY.WRITE');
  const canReadMedicationReconciliation =
    perms.includes('*') || perms.includes('MEDICATION_RECONCILIATION.READ');
  const canWriteMedicationReconciliation =
    perms.includes('*') || perms.includes('MEDICATION_RECONCILIATION.WRITE');
  const canReadPrescriptions = perms.includes('*') || perms.includes('PRESCRIPTION.READ');
  const canReadDiabetes = perms.includes('*') || perms.includes('SCREENING.READ');
  const medicalHistoryEnabled = isWebFeatureEnabled('medicalHistory');
  const medicationReconciliationEnabled = isWebFeatureEnabled('medicationReconciliation');
  const clinicalNotesEnabled = isWebFeatureEnabled('clinicalNotes');
  const clinicRoles =
    bootstrap?.memberships.find((membership) => membership.clinicId === clinicId)?.roles ?? [];
  const canReadClinicalNotes =
    clinicalNotesEnabled && (clinicRoles.includes('DOCTOR') || clinicRoles.includes('VOLUNTEER'));
  const userId = bootstrap?.userId ?? '';
  const canCreateOpsCheckIn = hasPermission(perms, 'OPS.CHECKIN.CREATE');
  const opsDestination = getOpsDestination(perms);

  const [data, setData] = useState<PatientWithEncounters | null>(null);
  const [portalLinkOpen, setPortalLinkOpen] = useState(false);
  const [portalLinkUserId, setPortalLinkUserId] = useState('');
  const [portalLinkSearch, setPortalLinkSearch] = useState('');
  const [portalLinkLoading, setPortalLinkLoading] = useState(false);
  const [portalLinkSaving, setPortalLinkSaving] = useState(false);
  const [portalLinkError, setPortalLinkError] = useState<string | null>(null);
  const [portalInviteOpen, setPortalInviteOpen] = useState(false);
  const [portalInviteEmail, setPortalInviteEmail] = useState('');
  const [portalInvitePhone, setPortalInvitePhone] = useState('');
  const [portalInviteSaving, setPortalInviteSaving] = useState(false);
  const [portalInviteError, setPortalInviteError] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState('');
  const [mergeCandidates, setMergeCandidates] = useState<PatientRegistryCandidate[]>([]);
  const [mergeCandidateId, setMergeCandidateId] = useState('');
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<
    Array<{
      id: string;
      displayName: string;
      email: string | null;
      phoneE164: string | null;
      alreadyLinked: boolean;
      isSuggestedMatch: boolean;
    }>
  >([]);
  const [selfReports, setSelfReports] = useState<
    Array<{
      id: string;
      type: string;
      systolicBp?: number;
      diastolicBp?: number;
      glucoseMgDl?: number;
      notes?: string;
      recordedAt: string;
      createdAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchSelfReports = useCallback(async () => {
    if (!getToken || !canViewSelfReports) return;
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/self-reports`,
        { getToken, activeClinicId: clinicId },
      );
      if (res.ok) {
        const json = (await res.json()) as Array<{
          id: string;
          type: string;
          systolicBp?: number;
          diastolicBp?: number;
          glucoseMgDl?: number;
          notes?: string;
          recordedAt: string;
          createdAt: string;
        }>;
        setSelfReports(json);
      }
    } catch {
      // ignore
    }
  }, [clinicId, patientId, getToken, canViewSelfReports]);

  useEffect(() => {
    if (data && canViewSelfReports) fetchSelfReports();
  }, [data, canViewSelfReports, fetchSelfReports]);

  const fetchUsersForPortalLink = useCallback(
    async (searchQuery?: string) => {
      if (!getToken) return;
      setPortalLinkLoading(true);
      try {
        const suffix = searchQuery?.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : '';
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/portal-link-candidates${suffix}`,
          {
            getToken,
            activeClinicId: clinicId,
          },
        );
        if (res.ok) {
          const json = (await res.json()) as Array<{
            id: string;
            displayName: string;
            email: string | null;
            phoneE164: string | null;
            alreadyLinked: boolean;
            isSuggestedMatch: boolean;
          }>;
          setAllUsers(json);
        } else {
          setAllUsers([]);
          setPortalLinkError(await readApiError(res));
        }
      } catch (requestError) {
        setAllUsers([]);
        setPortalLinkError(
          requestError instanceof Error ? requestError.message : String(requestError),
        );
      } finally {
        setPortalLinkLoading(false);
      }
    },
    [clinicId, getToken, patientId],
  );

  const handlePortalLinkOpen = () => {
    setPortalLinkOpen(true);
    setPortalLinkError(null);
    setPortalLinkUserId('');
    const defaultSearch = data?.patient.email ?? data?.patient.phoneE164 ?? '';
    setPortalLinkSearch(defaultSearch);
  };

  const handlePortalInviteOpen = () => {
    setPortalInviteOpen(true);
    setPortalInviteEmail(data?.patient.email ?? '');
    setPortalInvitePhone(data?.patient.phoneE164 ?? '');
    setPortalInviteError(null);
  };

  const handlePortalLinkSubmit = async () => {
    if (!portalLinkUserId || !getToken) return;
    setPortalLinkSaving(true);
    setPortalLinkError(null);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/portal-link`,
        {
          method: 'POST',
          body: JSON.stringify({ userId: portalLinkUserId }),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!res.ok) throw new Error(await readApiError(res));
      setPortalLinkOpen(false);
      fetchPatient();
    } catch (err) {
      setPortalLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setPortalLinkSaving(false);
    }
  };

  useEffect(() => {
    if (!portalLinkOpen) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => {
        void fetchUsersForPortalLink(portalLinkSearch);
      },
      portalLinkSearch.trim() ? 250 : 0,
    );

    return () => window.clearTimeout(timeoutId);
  }, [fetchUsersForPortalLink, portalLinkOpen, portalLinkSearch]);

  const handlePortalInviteSubmit = async () => {
    if (!getToken) return;
    setPortalInviteSaving(true);
    setPortalInviteError(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/portal-invite`,
        {
          method: 'POST',
          body: JSON.stringify({
            email: portalInviteEmail || undefined,
            phoneE164: portalInvitePhone || undefined,
          }),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setPortalInviteOpen(false);
      setSuccess('Portal invite created successfully.');
      fetchPatient();
    } catch (requestError) {
      setPortalInviteError(
        requestError instanceof Error ? requestError.message : String(requestError),
      );
    } finally {
      setPortalInviteSaving(false);
    }
  };

  const handlePortalInviteCancel = async (inviteId: string) => {
    if (!getToken) return;
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/portal-invite/${encodeURIComponent(inviteId)}`,
        {
          method: 'DELETE',
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setSuccess('Portal invite cancelled.');
      fetchPatient();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  };

  const fetchPatient = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/patients/${encodeURIComponent(patientId)}?clinicId=${encodeURIComponent(clinicId)}`,
        {
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as PatientWithEncounters;
      setData(json);
    } catch {
      try {
        const patient = await db.patients.get(patientId);
        const allConsents = await db.patient_consents
          .where('patientId')
          .equals(patientId)
          .toArray();
        const consents = allConsents
          .filter((c) => c.clinicId === clinicId)
          .sort(
            (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
          );
        const byType = new Map<
          string,
          { consentType: string; status: string; grantedAt?: string }
        >();
        for (let i = consents.length - 1; i >= 0; i--) {
          const c = consents[i];
          if (!byType.has(c.consentType ?? '')) {
            byType.set(c.consentType ?? '', {
              consentType: c.consentType ?? '',
              status: c.status ?? 'REVOKED',
              grantedAt: c.grantedAt,
            });
          }
        }
        const consentStatus = Array.from(byType.values());
        if (patient) {
          const localEncounters = await db.encounters
            .where('patientId')
            .equals(patientId)
            .toArray();
          const sorted = localEncounters.sort(
            (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
          );
          const recentEncounters = sorted.slice(0, 10).map((e) => ({
            id: e.id,
            status: e.status ?? 'DRAFT',
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
              sex: patient.sex ?? 'UNKNOWN',
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
        setError(localErr instanceof Error ? localErr.message : 'Failed to load patient');
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [patientId, clinicId, getToken]);

  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  useEffect(() => {
    if (data?.patient.id && data.patient.id !== patientId) {
      setSuccess('This patient record was merged. Opening the canonical chart.');
      router.replace(`/clinics/${clinicId}/patients/${data.patient.id}`);
    }
  }, [clinicId, data?.patient.id, patientId, router]);

  useEffect(() => {
    if (!mergeOpen || !getToken) {
      return;
    }

    const timeoutId = window.setTimeout(
      async () => {
        try {
          const response = await apiFetch(
            `/clinics/${encodeURIComponent(clinicId)}/patients?page=1&pageSize=8&q=${encodeURIComponent(mergeQuery)}`,
            {
              getToken,
              activeClinicId: clinicId,
            },
          );
          if (!response.ok) {
            throw new Error(await readApiError(response));
          }

          const payload = (await response.json()) as {
            items: PatientRegistryCandidate[];
          };
          setMergeCandidates(payload.items.filter((candidate) => candidate.id !== patientId));
        } catch (requestError) {
          setMergeError(
            requestError instanceof Error ? requestError.message : String(requestError),
          );
        }
      },
      mergeQuery.trim() ? 250 : 0,
    );

    return () => window.clearTimeout(timeoutId);
  }, [clinicId, getToken, mergeOpen, mergeQuery, patientId]);

  const researchConsent = data?.consentStatus?.find(
    (c) => c.consentType === 'RESEARCH_DEIDENTIFIED',
  );
  const hasGrantedResearchConsent = researchConsent?.status === 'GRANTED';

  const handleRevoke = async () => {
    if (!hasGrantedResearchConsent) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/consents/revoke`,
        {
          method: 'POST',
          body: JSON.stringify({ consentType: 'RESEARCH_DEIDENTIFIED' }),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!res.ok) throw new Error(await res.text());
      await fetchPatient();
    } catch {
      try {
        const consents = await db.patient_consents
          .where('patientId')
          .equals(patientId)
          .filter((c) => c.clinicId === clinicId && c.status === 'GRANTED')
          .toArray();
        const consent = consents[0];
        if (consent) {
          const revokedAt = new Date().toISOString();
          await db.patient_consents.put({
            ...consent,
            status: 'REVOKED',
            revokedAt,
            updatedAt: revokedAt,
          });
          await enqueueOutboxMutation(db, {
            clinicId,
            entityType: 'patient_consent',
            entityId: consent.id,
            operation: SYNC_OPERATION.UPSERT,
            payloadJson: {
              patientId,
              clinicId,
              consentType: 'RESEARCH_DEIDENTIFIED',
              status: 'REVOKED',
              consentVersion: 'v1-en',
              consentTextSnapshot: consent.consentTextSnapshot ?? '',
              grantedAt: consent.grantedAt,
              revokedAt,
              recordedByUserId: consent.recordedByUserId,
            },
          });
          await fetchPatient();
        }
      } catch (revokeErr) {
        setError(revokeErr instanceof Error ? revokeErr.message : 'Failed to revoke consent');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!getToken) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/checkins`, {
        method: 'POST',
        body: JSON.stringify({ patientId }),
        getToken,
        activeClinicId: clinicId,
      });
      if (!res.ok) throw new Error(await readApiError(res));

      setSuccess(
        opsDestination
          ? 'Patient added to the clinic board successfully.'
          : 'Patient checked in successfully.',
      );
      if (opsDestination === '/today') {
        router.prefetch('/today');
      }
    } catch (checkInErr) {
      setError(checkInErr instanceof Error ? checkInErr.message : 'Failed to check in patient');
    } finally {
      setLoading(false);
    }
  };

  const handleMergeSubmit = async () => {
    if (!getToken || !mergeCandidateId) {
      return;
    }

    setMergeSaving(true);
    setMergeError(null);

    try {
      const response = await apiFetch('/admin/patients/merge', {
        method: 'POST',
        body: JSON.stringify({
          canonicalPatientId: patientId,
          sourcePatientId: mergeCandidateId,
          portalLinkStrategy: 'CANONICAL',
          inviteStrategy: 'MERGE',
        }),
        getToken,
        skipClinicHeader: true,
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setMergeOpen(false);
      setSuccess('Duplicate patient record merged into this chart successfully.');
      fetchPatient();
    } catch (requestError) {
      setMergeError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setMergeSaving(false);
    }
  };

  if (loading && !data) return <div className="flex items-center justify-center p-8">Loading…</div>;
  if (error && !data)
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error}</p>
        <Button asChild variant="outline">
          <Link href={`/clinics/${clinicId}/patients`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to search
          </Link>
        </Button>
      </div>
    );
  if (!data)
    return (
      <div className="space-y-4">
        <p>Patient not found.</p>
        <Button asChild variant="outline">
          <Link href={`/clinics/${clinicId}/patients`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to search
          </Link>
        </Button>
      </div>
    );

  const { patient, recentEncounters } = data;
  const portalAccess = data.portalAccess ?? {
    status: 'UNLINKED' as const,
    linkedUserId: null,
    linkedKeycloakSub: null,
    mergedIntoPatientId: null,
    invites: [],
  };
  const latestInvite = portalAccess.invites[0] ?? null;

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Clinic patient chart"
        title={`${patient.firstName} ${patient.lastName}`}
        description="Review clinic-scoped demographics, encounter history, portal access, and patient-reported updates from a single chart workspace."
        badges={
          <>
            <Badge variant="outline" className="border-primary/25 bg-background/80 font-mono">
              {patient.patientCode}
            </Badge>
            {hasGrantedResearchConsent ? <Badge variant="finalized">Consent Granted</Badge> : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="ghost" className="rounded-2xl">
              <Link href={`/clinics/${clinicId}/patients`}>
                <ArrowLeft className="h-4 w-4" />
                Back to Patient Search
              </Link>
            </Button>
            {canUpdatePatient ? (
              <Button asChild variant="outline" className="rounded-2xl">
                <Link href={`/clinics/${clinicId}/patients/${patientId}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {canCreateOpsCheckIn ? (
              <Button
                onClick={() => void handleCheckIn()}
                disabled={loading}
                className="rounded-2xl"
              >
                <Stethoscope className="h-4 w-4" />
                Check In Patient
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AppMetricCard
          title="Recent encounters"
          value={recentEncounters.length}
          icon={CalendarClock}
          detail="Most recent visit records available from this chart."
        />
        <AppMetricCard
          title="Patient-reported updates"
          value={canViewSelfReports ? selfReports.length : 'Locked'}
          icon={Activity}
          detail={
            canViewSelfReports
              ? 'Portal submissions visible to your role.'
              : 'Your role does not include patient-reported data access.'
          }
        />
        <AppMetricCard
          title="Research consent"
          value={
            hasGrantedResearchConsent
              ? 'Granted'
              : researchConsent?.status === 'REVOKED'
                ? 'Revoked'
                : 'Pending'
          }
          icon={ShieldCheck}
          detail="Current de-identified research consent status for this patient."
        />
      </div>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {success ? (
        <InlineNotice tone="success">
          <span>{success}</span>
          {opsDestination ? (
            <>
              {' '}
              <Link href={opsDestination} className="font-medium underline underline-offset-4">
                Open OPS view
              </Link>
            </>
          ) : null}
        </InlineNotice>
      ) : null}

      <Tabs defaultValue="overview" className="w-full">
        <div className="max-w-full overflow-x-auto pb-1" aria-label="Patient chart sections">
          <TabsList className="min-h-11 w-max justify-start gap-2 rounded-3xl border border-border/80 bg-card/75 p-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            {canReadDiabetes ? <TabsTrigger value="diabetes">Diabetes</TabsTrigger> : null}
            <TabsTrigger value="encounters">Encounters</TabsTrigger>
            {medicalHistoryEnabled && canReadMedicalHistory ? (
              <TabsTrigger value="medical-history">Medical History</TabsTrigger>
            ) : null}
            {medicationReconciliationEnabled && canReadMedicationReconciliation ? (
              <TabsTrigger value="medications">Medications</TabsTrigger>
            ) : null}
            {canReadClinicalNotes ? (
              <TabsTrigger value="clinical-notes">Clinical Notes</TabsTrigger>
            ) : null}
            {canViewSelfReports ? (
              <TabsTrigger value="self-reports">Patient-reported</TabsTrigger>
            ) : null}
            {canRecordConsent ? <TabsTrigger value="consent">Consent</TabsTrigger> : null}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
                <CardHeader>
                  <h2 className="text-lg font-semibold">Patient details</h2>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-border/80 bg-background/75 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Patient code
                    </p>
                    <p className="mt-2 font-mono text-lg font-semibold text-foreground">
                      {patient.patientCode}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-border/80 bg-background/75 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Contact
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {patient.phoneE164 || 'No phone on file'}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-border/80 bg-background/75 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Date of birth
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {patient.dob ? new Date(patient.dob).toLocaleDateString() : 'Not recorded'}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-border/80 bg-background/75 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Sex
                    </p>
                    <p className="mt-2 text-sm text-foreground">{patient.sex}</p>
                  </div>
                  {patient.nationalIdLast4 ? (
                    <div className="rounded-3xl border border-border/80 bg-background/75 p-4 sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        National ID
                      </p>
                      <p className="mt-2 text-sm text-foreground">...{patient.nationalIdLast4}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <ResidentialLocationSummary patient={patient} />
            </div>

            <div className="space-y-4">
              {canLinkPortal ? (
                <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
                  <CardHeader>
                    <h2 className="text-lg font-semibold">Portal account</h2>
                    <p className="text-sm text-muted-foreground">
                      Link the patient to an existing app account or stage a portal invite before
                      their first login.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-3xl border border-border/80 bg-background/75 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Portal status
                          </p>
                          <p className="mt-2 text-base font-semibold text-foreground">
                            {portalAccess.status}
                          </p>
                        </div>
                        <Badge variant={portalAccess.status === 'LINKED' ? 'default' : 'outline'}>
                          {portalAccess.status}
                        </Badge>
                      </div>
                      {portalAccess.status === 'LINKED' ? (
                        <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                          <p>Portal access is already linked to this patient chart.</p>
                          {portalAccess.linkedKeycloakSub ? (
                            <p className="font-mono text-xs text-foreground/80">
                              {portalAccess.linkedKeycloakSub}
                            </p>
                          ) : null}
                        </div>
                      ) : portalAccess.status === 'INVITED' && latestInvite ? (
                        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                          <p>
                            A pending invite is staged for this patient and will be claimable on
                            first sign-in.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {latestInvite.email ? (
                              <Badge variant="secondary" className="rounded-full">
                                {latestInvite.email}
                              </Badge>
                            ) : null}
                            {latestInvite.phoneE164 ? (
                              <Badge variant="secondary" className="rounded-full">
                                {latestInvite.phoneE164}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                          No portal account is linked yet. You can stage an invite now or use the
                          manual link flow once the patient has signed in.
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePortalInviteOpen}
                        className="w-full cursor-pointer rounded-2xl"
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        {portalAccess.status === 'INVITED'
                          ? 'Reissue portal invite'
                          : 'Create portal invite'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePortalLinkOpen}
                        className="w-full cursor-pointer rounded-2xl"
                      >
                        Link existing app account
                      </Button>
                      {latestInvite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handlePortalInviteCancel(latestInvite.id)}
                          className="w-full rounded-2xl text-destructive hover:text-destructive"
                        >
                          Cancel latest invite
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {isSystemAdmin ? (
                <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
                  <CardHeader>
                    <h2 className="text-lg font-semibold">Duplicate repair</h2>
                    <p className="text-sm text-muted-foreground">
                      Merge a duplicate patient record into this canonical chart while preserving
                      clinical history.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="rounded-3xl border border-border/80 bg-background/75 p-4 text-sm text-muted-foreground">
                      Use this only when two patient rows represent the same real person in the same
                      clinic.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMergeOpen(true);
                        setMergeError(null);
                        setMergeQuery('');
                        setMergeCandidateId('');
                      }}
                      className="w-full rounded-2xl"
                    >
                      Merge duplicate into this chart
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
                <CardHeader>
                  <h2 className="text-lg font-semibold">Next steps</h2>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>Open Trends to review longitudinal readings and measurement changes.</p>
                  <p>Use Encounters to continue from prior visits or start chart review.</p>
                  {canCreateOpsCheckIn ? (
                    <p>
                      Use Check In Patient to move this chart straight into today’s clinic workflow.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <Dialog open={portalLinkOpen} onOpenChange={setPortalLinkOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Link portal account</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {portalLinkError ? (
                    <InlineNotice tone="error">{portalLinkError}</InlineNotice>
                  ) : null}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Search app account</label>
                    <Input
                      value={portalLinkSearch}
                      onChange={(event) => setPortalLinkSearch(event.target.value)}
                      placeholder="Search by email, phone, or name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Only Nkwapa app accounts that have signed in at least once can be linked here.
                      If this patient only exists in Keycloak so far, use a portal invite instead.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select user</label>
                    <Select value={portalLinkUserId} onValueChange={setPortalLinkUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose user" />
                      </SelectTrigger>
                      <SelectContent>
                        {allUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex w-full items-center justify-between gap-3">
                              <span className="truncate">
                                {user.displayName}
                                {user.email
                                  ? ` (${user.email})`
                                  : user.phoneE164
                                    ? ` (${user.phoneE164})`
                                    : ''}
                                {user.alreadyLinked ? ' · linked' : ''}
                              </span>
                              {user.isSuggestedMatch ? (
                                <Badge
                                  variant="secondary"
                                  className="rounded-full whitespace-nowrap"
                                >
                                  Suggested match
                                </Badge>
                              ) : null}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {portalLinkLoading ? (
                      <p className="text-xs text-muted-foreground">Searching app accounts...</p>
                    ) : allUsers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No matching app accounts found yet.
                      </p>
                    ) : null}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPortalLinkOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handlePortalLinkSubmit}
                    disabled={!portalLinkUserId || portalLinkSaving}
                    className="cursor-pointer"
                  >
                    {portalLinkSaving ? 'Linking...' : 'Link'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={portalInviteOpen} onOpenChange={setPortalInviteOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create portal invite</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {portalInviteError ? (
                    <InlineNotice tone="error">{portalInviteError}</InlineNotice>
                  ) : null}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      value={portalInviteEmail}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setPortalInviteEmail(event.target.value)
                      }
                      placeholder="patient@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      value={portalInvitePhone}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setPortalInvitePhone(event.target.value)
                      }
                      placeholder="+233..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPortalInviteOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handlePortalInviteSubmit}
                    disabled={portalInviteSaving}
                    className="cursor-pointer"
                  >
                    {portalInviteSaving ? 'Saving...' : 'Create invite'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Merge duplicate patient</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {mergeError ? <InlineNotice tone="error">{mergeError}</InlineNotice> : null}
                  <p className="text-sm text-muted-foreground">
                    The current chart stays canonical. Search for the duplicate patient record you
                    want to merge into {patient.patientCode}.
                  </p>
                  <Input
                    value={mergeQuery}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setMergeQuery(event.target.value)
                    }
                    placeholder="Search duplicate by name, code, phone, or alias"
                  />
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-border/80 bg-background/75 p-2">
                    {mergeCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setMergeCandidateId(candidate.id)}
                        className={`w-full rounded-2xl border p-3 text-left transition ${
                          mergeCandidateId === candidate.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border/70 bg-card hover:border-primary/40'
                        }`}
                      >
                        <p className="font-medium text-foreground">
                          {candidate.firstName} {candidate.lastName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {candidate.patientCode}
                        </p>
                      </button>
                    ))}
                    {mergeCandidates.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        Search to find another patient record in this clinic.
                      </p>
                    ) : null}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setMergeOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void handleMergeSubmit()}
                    disabled={!mergeCandidateId || mergeSaving}
                  >
                    {mergeSaving ? 'Merging...' : 'Merge duplicate'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="trends">
          <PatientTrendsPanel patientId={patientId} clinicId={clinicId} />
        </TabsContent>

        {canReadDiabetes ? (
          <TabsContent value="diabetes">
            <DiabetesHistoryPanel clinicId={clinicId} patientId={patientId} />
          </TabsContent>
        ) : null}

        <TabsContent value="encounters">
          <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
            <CardHeader>
              <h2 className="text-lg font-semibold">Recent encounters</h2>
            </CardHeader>
            <CardContent>
              {recentEncounters.length === 0 ? (
                <EmptyStateCard
                  title="No encounters yet"
                  description="This patient has not started a clinic encounter yet."
                />
              ) : (
                <ul className="space-y-2">
                  {recentEncounters.map((encounter) => (
                    <li key={encounter.id}>
                      <Link
                        href={`/clinics/${clinicId}/encounters/${encounter.id}`}
                        className="flex items-center justify-between rounded-3xl border border-border/80 bg-background/75 p-4 transition hover:-translate-y-0.5 hover:bg-accent/60"
                      >
                        <span>{new Date(encounter.createdAt).toLocaleDateString()}</span>
                        <Badge
                          variant={
                            encounter.status === 'FINALIZED'
                              ? 'default'
                              : encounter.status === 'IN_REVIEW'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {encounter.status}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {medicalHistoryEnabled && canReadMedicalHistory ? (
          <TabsContent value="medical-history">
            <MedicalHistoryPanel
              clinicId={clinicId}
              patientId={patient.id}
              userId={userId}
              canWrite={canWriteMedicalHistory}
            />
          </TabsContent>
        ) : null}

        {medicationReconciliationEnabled && canReadMedicationReconciliation ? (
          <TabsContent value="medications">
            <MedicationReconciliationPanel
              clinicId={clinicId}
              patientId={patientId}
              userId={userId}
              canWrite={canWriteMedicationReconciliation}
              canReadPrescriptions={canReadPrescriptions}
            />
          </TabsContent>
        ) : null}

        {canReadClinicalNotes ? (
          <TabsContent value="clinical-notes">
            <PatientClinicalNotesPanel clinicId={clinicId} patientId={patientId} />
          </TabsContent>
        ) : null}

        {canViewSelfReports ? (
          <TabsContent value="self-reports">
            <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
              <CardHeader>
                <h2 className="text-lg font-semibold">Patient self-reports</h2>
                <p className="text-sm text-muted-foreground">
                  Data entered by the patient via the portal
                </p>
              </CardHeader>
              <CardContent>
                {selfReports.length === 0 ? (
                  <EmptyStateCard
                    title="No patient-reported updates yet"
                    description="Portal measurements and self-reports will appear here once the patient begins submitting them."
                  />
                ) : (
                  <ul className="space-y-2">
                    {selfReports.map((report) => (
                      <li
                        key={report.id}
                        className="flex flex-col gap-1 rounded-3xl border border-border/80 bg-background/75 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{report.type.replace(/_/g, ' ')}</span>
                          <span className="text-sm text-muted-foreground">
                            {new Date(report.recordedAt).toLocaleDateString()}
                          </span>
                        </div>
                        {report.systolicBp != null || report.diastolicBp != null ? (
                          <p className="text-sm">
                            BP: {report.systolicBp ?? '—'}/{report.diastolicBp ?? '—'}
                          </p>
                        ) : null}
                        {report.glucoseMgDl != null ? (
                          <p className="text-sm">Glucose: {report.glucoseMgDl} mg/dL</p>
                        ) : null}
                        {report.notes ? (
                          <p className="text-sm text-muted-foreground">{report.notes}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {canRecordConsent ? (
          <TabsContent value="consent">
            <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
              <CardHeader>
                <h2 className="text-lg font-semibold">Research consent</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {hasGrantedResearchConsent
                    ? 'Research consent is currently granted.'
                    : researchConsent?.status === 'REVOKED'
                      ? 'Research consent has been revoked.'
                      : 'Research consent has not been recorded yet.'}
                </p>
                <div className="flex gap-2">
                  {hasGrantedResearchConsent ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRevoke}
                      disabled={loading}
                      className="rounded-2xl"
                    >
                      Revoke Consent
                    </Button>
                  ) : (
                    <Button asChild size="sm" className="rounded-2xl">
                      <Link href={`/clinics/${clinicId}/patients/${patientId}/consent`}>
                        <FileCheck className="mr-2 h-4 w-4" />
                        Record Consent
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
