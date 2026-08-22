'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  CircleSlash2,
  History,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { db } from '@/lib/db';
import {
  buildMedicationReconciliationOutboxPayload,
  buildMedicationRevisionOutboxPayload,
  buildPharmacyPreferenceOutboxPayload,
  buildPharmacyRevisionOutboxPayload,
  enqueueOutboxMutation,
  SYNC_OPERATION,
} from '@/lib/outbox';
import { readApiError } from '@/lib/ops';
import type { AllergySummary } from '@/lib/medical-history';
import {
  MEDICATION_SOURCE_TYPES,
  MEDICATION_STATUSES,
  medicationListState,
  pharmacyAddress,
  sortMedicationRecords,
  type MedicationRecord,
  type MedicationReconciliationView,
  type MedicationRevision,
  type MedicationSourceType,
  type MedicationStatus,
  type PharmacyRecord,
  type PharmacyRevision,
  type ReconciliationEvent,
} from '@/lib/medication-reconciliation';
import { AllergySummaryBanner } from './AllergySummaryBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ChartSectionEmpty,
  ChartSectionError,
  ChartSectionLoading,
  ChartSectionOffline,
} from '@/components/patients/chart/ChartSectionState';

const unavailableAllergies: AllergySummary = { state: 'UNAVAILABLE', activeAllergies: [] };

const sourceLabels: Record<MedicationSourceType, string> = {
  PATIENT_REPORTED: 'Patient reported',
  CAREGIVER_REPORTED: 'Caregiver reported',
  CLINIC_RECORD: 'Clinic record',
  EXTERNAL_DOCUMENT: 'External document',
  MEDICATION_CONTAINER: 'Medication container',
  OTHER: 'Other source',
};

const statusPresentation = {
  CURRENT: { label: 'Current', variant: 'finalized' as const },
  PAST: { label: 'Past', variant: 'secondary' as const },
  STOPPED: { label: 'Stopped', variant: 'warning' as const },
};

type MedicationForm = {
  medicationName: string;
  drugId: string;
  strength: string;
  dose: string;
  doseUnit: string;
  route: string;
  frequency: string;
  duration: string;
  startDate: string;
  endDate: string;
  indication: string;
  status: MedicationStatus;
  notes: string;
  sourceEncounterId: string;
  sourceType: MedicationSourceType;
};

type PharmacyForm = {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  addressText: string;
  notes: string;
};

const emptyMedicationForm: MedicationForm = {
  medicationName: '',
  drugId: '',
  strength: '',
  dose: '',
  doseUnit: '',
  route: '',
  frequency: '',
  duration: '',
  startDate: '',
  endDate: '',
  indication: '',
  status: 'CURRENT',
  notes: '',
  sourceEncounterId: '',
  sourceType: 'PATIENT_REPORTED',
};

const emptyPharmacyForm: PharmacyForm = {
  name: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
  countryCode: 'GH',
  addressText: '',
  notes: '',
};

type DrugSearchResult = { id: string; name: string; genericName?: string | null };
type PrescriptionContext = {
  id: string;
  dosage: string;
  frequency: string;
  duration?: string | null;
  createdAt: string;
  drug?: { name: string; genericName?: string | null };
  encounter?: { id: string; createdAt: string };
  prescribedBy?: { displayName: string };
};

function generateId() {
  return crypto.randomUUID();
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toOnlineMutationPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => key !== 'patientId' && key !== 'action' && key !== 'pharmacyRecordId',
    ),
  );
}

export function MedicationReconciliationPanel({
  clinicId,
  patientId,
  userId,
  canWrite,
  canReadPrescriptions,
}: {
  clinicId: string;
  patientId: string;
  userId: string;
  canWrite: boolean;
  canReadPrescriptions: boolean;
}) {
  const getToken = useAuth();
  const [view, setView] = useState<MedicationReconciliationView>({
    medications: [],
    pharmacies: [],
    latestReconciliation: null,
  });
  const [allergies, setAllergies] = useState<AllergySummary>(unavailableAllergies);
  const [prescriptions, setPrescriptions] = useState<PrescriptionContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [medicationOpen, setMedicationOpen] = useState(false);
  const [editingMedication, setEditingMedication] = useState<MedicationRecord | null>(null);
  const [medicationForm, setMedicationForm] = useState<MedicationForm>(emptyMedicationForm);
  const [pharmacyOpen, setPharmacyOpen] = useState(false);
  const [editingPharmacy, setEditingPharmacy] = useState<PharmacyRecord | null>(null);
  const [pharmacyForm, setPharmacyForm] = useState<PharmacyForm>(emptyPharmacyForm);
  const [drugQuery, setDrugQuery] = useState('');
  const [drugResults, setDrugResults] = useState<DrugSearchResult[]>([]);
  const [historyTitle, setHistoryTitle] = useState('');
  const [historyItems, setHistoryItems] = useState<Array<MedicationRevision | PharmacyRevision>>(
    [],
  );

  const endpoint = `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/medication-reconciliation`;

  const loadOffline = useCallback(async () => {
    const [records, revisions, events, pharmacyRecords, pharmacyRevisions, preferences] =
      await Promise.all([
        db.patient_medication_records.where('patientId').equals(patientId).toArray(),
        db.patient_medication_revisions.toArray(),
        db.medication_reconciliation_events.where('patientId').equals(patientId).toArray(),
        db.patient_pharmacy_records.where('patientId').equals(patientId).toArray(),
        db.patient_pharmacy_revisions.toArray(),
        db.patient_pharmacy_preferences.where('patientId').equals(patientId).toArray(),
      ]);
    const medications = records
      .filter((record) => record.clinicId === clinicId && record.currentRevisionId)
      .map((record) => {
        const currentRevision = revisions.find((item) => item.id === record.currentRevisionId);
        if (!currentRevision) return null;
        return { ...record, currentRevision } as MedicationRecord;
      })
      .filter((record): record is MedicationRecord => record !== null);
    const pharmacies = pharmacyRecords
      .filter((record) => record.clinicId === clinicId && record.currentRevisionId)
      .map((record) => {
        const currentRevision = pharmacyRevisions.find(
          (item) => item.id === record.currentRevisionId,
        );
        if (!currentRevision) return null;
        return {
          ...record,
          currentRevision,
          preferences: preferences.filter((item) => item.pharmacyRecordId === record.id),
        } as PharmacyRecord;
      })
      .filter((record): record is PharmacyRecord => record !== null);
    const latestReconciliation = events
      .filter((event) => event.clinicId === clinicId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    setView({
      medications: sortMedicationRecords(medications),
      pharmacies,
      latestReconciliation: (latestReconciliation as ReconciliationEvent | undefined) ?? null,
    });
  }, [clinicId, patientId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(endpoint, { getToken, activeClinicId: clinicId });
      if (!response.ok) throw new Error(await readApiError(response));
      const payload = (await response.json()) as MedicationReconciliationView;
      setView({ ...payload, medications: sortMedicationRecords(payload.medications) });
      setOffline(false);
    } catch (loadError) {
      try {
        await loadOffline();
        setOffline(true);
      } catch {
        setError(loadError instanceof Error ? loadError.message : 'Medication history unavailable');
      }
    } finally {
      setLoading(false);
    }
  }, [clinicId, endpoint, getToken, loadOffline]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/allergy-summary`,
          { getToken, activeClinicId: clinicId },
        );
        setAllergies(
          response.ok ? ((await response.json()) as AllergySummary) : unavailableAllergies,
        );
      } catch {
        setAllergies(unavailableAllergies);
      }
    })();
  }, [clinicId, getToken, patientId]);

  useEffect(() => {
    if (!canReadPrescriptions) return;
    void (async () => {
      try {
        const response = await apiFetch(`${endpoint}/prescription-history`, {
          getToken,
          activeClinicId: clinicId,
        });
        if (response.ok) setPrescriptions((await response.json()) as PrescriptionContext[]);
      } catch {
        const cached = await db.prescriptions.where('clinicId').equals(clinicId).toArray();
        const encounters = await db.encounters.where('patientId').equals(patientId).toArray();
        const encounterIds = new Set(encounters.map((item) => item.id));
        setPrescriptions(
          cached
            .filter((item) => encounterIds.has(item.encounterId))
            .map((item) => ({
              id: item.id,
              dosage: item.dosage ?? '',
              frequency: item.frequency ?? '',
              duration: item.duration,
              createdAt: item.createdAt ?? '',
              drug: { name: `Catalog drug ${item.drugId.slice(0, 8)}` },
              encounter: { id: item.encounterId, createdAt: item.createdAt ?? '' },
            })),
        );
      }
    })();
  }, [canReadPrescriptions, clinicId, endpoint, getToken, patientId]);

  useEffect(() => {
    if (!medicationOpen || drugQuery.trim().length < 2) {
      setDrugResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await apiFetch(
            `/clinics/${encodeURIComponent(clinicId)}/drugs?q=${encodeURIComponent(drugQuery)}`,
            { getToken, activeClinicId: clinicId },
          );
          if (response.ok) setDrugResults((await response.json()) as DrugSearchResult[]);
        } catch {
          setDrugResults([]);
        }
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [clinicId, drugQuery, getToken, medicationOpen]);

  const current = useMemo(
    () => view.medications.filter((item) => item.currentRevision.status === 'CURRENT'),
    [view.medications],
  );
  const historical = useMemo(
    () => view.medications.filter((item) => item.currentRevision.status !== 'CURRENT'),
    [view.medications],
  );
  const listState = medicationListState(view.medications, view.latestReconciliation);
  const activePreference = view.pharmacies
    .flatMap((item) => item.preferences)
    .find((item) => !item.effectiveTo);

  function openMedication(record?: MedicationRecord) {
    setEditingMedication(record ?? null);
    const revision = record?.currentRevision;
    setMedicationForm(
      revision
        ? {
            medicationName: revision.medicationName,
            drugId: revision.drugId ?? '',
            strength: revision.strength ?? '',
            dose: revision.dose ?? '',
            doseUnit: revision.doseUnit ?? '',
            route: revision.route ?? '',
            frequency: revision.frequency ?? '',
            duration: revision.duration ?? '',
            startDate: revision.startDate?.slice(0, 10) ?? '',
            endDate: revision.endDate?.slice(0, 10) ?? '',
            indication: revision.indication ?? '',
            status: revision.status,
            notes: revision.notes ?? '',
            sourceEncounterId: revision.sourceEncounterId ?? '',
            sourceType: revision.sourceType,
          }
        : emptyMedicationForm,
    );
    setDrugQuery('');
    setMedicationOpen(true);
  }

  async function saveMedication() {
    if (!medicationForm.medicationName.trim()) {
      setError('Medication name is required.');
      return;
    }
    if (medicationForm.status === 'CURRENT' && medicationForm.endDate) {
      setError('Current medications cannot have an end date.');
      return;
    }
    setSaving(true);
    setError(null);
    const recordId = editingMedication?.id ?? generateId();
    const revisionId = generateId();
    const payload = buildMedicationRevisionOutboxPayload({
      patientId,
      revisionId,
      expectedCurrentRevisionId: editingMedication?.currentRevisionId,
      medicationName: medicationForm.medicationName.trim(),
      drugId: optional(medicationForm.drugId),
      strength: optional(medicationForm.strength),
      dose: optional(medicationForm.dose),
      doseUnit: optional(medicationForm.doseUnit),
      route: optional(medicationForm.route),
      frequency: optional(medicationForm.frequency),
      duration: optional(medicationForm.duration),
      startDate: optional(medicationForm.startDate),
      endDate: optional(medicationForm.endDate),
      indication: optional(medicationForm.indication),
      status: medicationForm.status,
      notes: optional(medicationForm.notes),
      sourceEncounterId: optional(medicationForm.sourceEncounterId),
      sourceType: medicationForm.sourceType,
    });
    const url = editingMedication
      ? `${endpoint}/medications/${encodeURIComponent(recordId)}/revisions`
      : `${endpoint}/medications`;
    try {
      const response = await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify({
          ...toOnlineMutationPayload(payload),
          ...(!editingMedication ? { recordId } : {}),
        }),
        getToken,
        activeClinicId: clinicId,
      });
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      setMedicationOpen(false);
      setNotice(editingMedication ? 'Medication revision saved.' : 'Medication recorded.');
      await load();
    } catch {
      const now = new Date().toISOString();
      const previous = editingMedication?.currentRevision;
      await db.transaction(
        'rw',
        [db.patient_medication_records, db.patient_medication_revisions, db.outbox],
        async () => {
          await db.patient_medication_revisions.put({
            id: revisionId,
            recordId,
            revisionNumber: (previous?.revisionNumber ?? 0) + 1,
            medicationName: medicationForm.medicationName.trim(),
            drugId: optional(medicationForm.drugId),
            strength: optional(medicationForm.strength),
            dose: optional(medicationForm.dose),
            doseUnit: optional(medicationForm.doseUnit),
            route: optional(medicationForm.route),
            frequency: optional(medicationForm.frequency),
            duration: optional(medicationForm.duration),
            startDate: optional(medicationForm.startDate),
            endDate: optional(medicationForm.endDate),
            indication: optional(medicationForm.indication),
            status: medicationForm.status,
            notes: optional(medicationForm.notes),
            sourceEncounterId: optional(medicationForm.sourceEncounterId),
            sourceType: medicationForm.sourceType,
            authoredByUserId: userId,
            createdAt: now,
          });
          await db.patient_medication_records.put({
            id: recordId,
            clinicId,
            patientId,
            currentRevisionId: revisionId,
            recordedByUserId: editingMedication?.recordedByUserId ?? userId,
            createdAt: editingMedication?.createdAt ?? now,
            updatedAt: now,
          });
          await enqueueOutboxMutation(db, {
            clinicId,
            entityType: 'patient_medication_revision',
            entityId: recordId,
            operation: SYNC_OPERATION.UPSERT,
            payloadJson: payload,
          });
        },
      );
      setMedicationOpen(false);
      setOffline(true);
      setNotice('Medication saved on this device and queued for sync.');
      await loadOffline();
    } finally {
      setSaving(false);
    }
  }

  async function reconcileList() {
    setSaving(true);
    setError(null);
    const eventId = generateId();
    const items = current.map((record) => ({
      recordId: record.id,
      expectedCurrentRevisionId: record.currentRevisionId,
      newRevisionId: generateId(),
    }));
    const outcome = current.length ? 'CURRENT_LIST_REVIEWED' : 'NO_KNOWN_CURRENT_MEDICATIONS';
    const payload = buildMedicationReconciliationOutboxPayload({ patientId, outcome, items });
    try {
      const response = await apiFetch(`${endpoint}/reconciliations`, {
        method: 'POST',
        body: JSON.stringify({ ...toOnlineMutationPayload(payload), eventId }),
        getToken,
        activeClinicId: clinicId,
      });
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      setNotice(
        current.length
          ? 'Current medication list reconciled.'
          : 'No known current medications recorded.',
      );
      await load();
    } catch {
      const now = new Date().toISOString();
      await db.transaction(
        'rw',
        [
          db.patient_medication_records,
          db.patient_medication_revisions,
          db.medication_reconciliation_events,
          db.outbox,
        ],
        async () => {
          for (const item of items) {
            const record = current.find((candidate) => candidate.id === item.recordId)!;
            await db.patient_medication_revisions.put({
              ...record.currentRevision,
              id: item.newRevisionId,
              revisionNumber: record.currentRevision.revisionNumber + 1,
              authoredByUserId: userId,
              reconciledByUserId: userId,
              lastReconciledAt: now,
              createdAt: now,
            });
            await db.patient_medication_records.update(record.id, {
              currentRevisionId: item.newRevisionId,
              updatedAt: now,
            });
          }
          await db.medication_reconciliation_events.put({
            id: eventId,
            clinicId,
            patientId,
            outcome,
            reconciledByUserId: userId,
            createdAt: now,
          });
          await enqueueOutboxMutation(db, {
            clinicId,
            entityType: 'medication_reconciliation',
            entityId: eventId,
            operation: SYNC_OPERATION.UPSERT,
            payloadJson: payload,
          });
        },
      );
      setOffline(true);
      setNotice('Reconciliation saved on this device and queued for sync.');
      await loadOffline();
    } finally {
      setSaving(false);
    }
  }

  function openPharmacy(record?: PharmacyRecord) {
    setEditingPharmacy(record ?? null);
    const revision = record?.currentRevision;
    setPharmacyForm(
      revision
        ? {
            name: revision.name,
            phone: revision.phoneE164 ?? '',
            addressLine1: revision.addressLine1 ?? '',
            addressLine2: revision.addressLine2 ?? '',
            city: revision.city ?? '',
            region: revision.region ?? '',
            postalCode: revision.postalCode ?? '',
            countryCode: revision.countryCode ?? 'GH',
            addressText: revision.addressText ?? '',
            notes: revision.notes ?? '',
          }
        : emptyPharmacyForm,
    );
    setPharmacyOpen(true);
  }

  async function savePharmacy() {
    if (!pharmacyForm.name.trim()) {
      setError('Pharmacy name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    const recordId = editingPharmacy?.id ?? generateId();
    const revisionId = generateId();
    const payload = buildPharmacyRevisionOutboxPayload({
      patientId,
      revisionId,
      expectedCurrentRevisionId: editingPharmacy?.currentRevisionId,
      name: pharmacyForm.name.trim(),
      phone: optional(pharmacyForm.phone),
      addressLine1: optional(pharmacyForm.addressLine1),
      addressLine2: optional(pharmacyForm.addressLine2),
      city: optional(pharmacyForm.city),
      region: optional(pharmacyForm.region),
      postalCode: optional(pharmacyForm.postalCode),
      countryCode: optional(pharmacyForm.countryCode)?.toUpperCase(),
      addressText: optional(pharmacyForm.addressText),
      notes: optional(pharmacyForm.notes),
    });
    const url = editingPharmacy
      ? `${endpoint}/pharmacies/${encodeURIComponent(recordId)}/revisions`
      : `${endpoint}/pharmacies`;
    try {
      const response = await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify({
          ...toOnlineMutationPayload(payload),
          ...(!editingPharmacy ? { recordId } : {}),
        }),
        getToken,
        activeClinicId: clinicId,
      });
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      setPharmacyOpen(false);
      setNotice(editingPharmacy ? 'Pharmacy revision saved.' : 'Pharmacy recorded.');
      await load();
    } catch {
      const now = new Date().toISOString();
      await db.transaction(
        'rw',
        [db.patient_pharmacy_records, db.patient_pharmacy_revisions, db.outbox],
        async () => {
          await db.patient_pharmacy_revisions.put({
            id: revisionId,
            recordId,
            revisionNumber: (editingPharmacy?.currentRevision.revisionNumber ?? 0) + 1,
            name: pharmacyForm.name.trim(),
            phoneE164: optional(pharmacyForm.phone),
            addressLine1: optional(pharmacyForm.addressLine1),
            addressLine2: optional(pharmacyForm.addressLine2),
            city: optional(pharmacyForm.city),
            region: optional(pharmacyForm.region),
            postalCode: optional(pharmacyForm.postalCode),
            countryCode: optional(pharmacyForm.countryCode)?.toUpperCase(),
            addressText: optional(pharmacyForm.addressText),
            notes: optional(pharmacyForm.notes),
            authoredByUserId: userId,
            createdAt: now,
          });
          await db.patient_pharmacy_records.put({
            id: recordId,
            clinicId,
            patientId,
            currentRevisionId: revisionId,
            recordedByUserId: editingPharmacy?.recordedByUserId ?? userId,
            createdAt: editingPharmacy?.createdAt ?? now,
            updatedAt: now,
          });
          await enqueueOutboxMutation(db, {
            clinicId,
            entityType: 'patient_pharmacy_revision',
            entityId: recordId,
            operation: SYNC_OPERATION.UPSERT,
            payloadJson: payload,
          });
        },
      );
      setPharmacyOpen(false);
      setOffline(true);
      setNotice('Pharmacy saved on this device and queued for sync.');
      await loadOffline();
    } finally {
      setSaving(false);
    }
  }

  async function setPreferred(record: PharmacyRecord) {
    setSaving(true);
    setError(null);
    const preferenceId = generateId();
    const payload = buildPharmacyPreferenceOutboxPayload({
      patientId,
      action: 'SET',
      pharmacyRecordId: record.id,
      expectedActivePreferenceId: activePreference?.id,
    });
    try {
      const response = await apiFetch(
        `${endpoint}/pharmacies/${encodeURIComponent(record.id)}/preference`,
        {
          method: 'POST',
          body: JSON.stringify({ ...toOnlineMutationPayload(payload), preferenceId }),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      setNotice(`${record.currentRevision.name} is now preferred.`);
      await load();
    } catch {
      const now = new Date().toISOString();
      await db.transaction('rw', [db.patient_pharmacy_preferences, db.outbox], async () => {
        if (activePreference)
          await db.patient_pharmacy_preferences.update(activePreference.id, {
            effectiveTo: now,
            endedByUserId: userId,
            updatedAt: now,
          });
        await db.patient_pharmacy_preferences.put({
          id: preferenceId,
          clinicId,
          patientId,
          pharmacyRecordId: record.id,
          effectiveFrom: now,
          setByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
        await enqueueOutboxMutation(db, {
          clinicId,
          entityType: 'patient_pharmacy_preference',
          entityId: preferenceId,
          operation: SYNC_OPERATION.UPSERT,
          payloadJson: payload,
        });
      });
      setOffline(true);
      setNotice('Preferred pharmacy change queued for sync.');
      await loadOffline();
    } finally {
      setSaving(false);
    }
  }

  async function endPreferred() {
    if (!activePreference) return;
    setSaving(true);
    setError(null);
    const payload = buildPharmacyPreferenceOutboxPayload({
      patientId,
      action: 'END',
      expectedActivePreferenceId: activePreference.id,
    });
    try {
      const response = await apiFetch(`${endpoint}/pharmacy-preference/end`, {
        method: 'POST',
        body: JSON.stringify(toOnlineMutationPayload(payload)),
        getToken,
        activeClinicId: clinicId,
      });
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      setNotice('Preferred pharmacy period ended.');
      await load();
    } catch {
      const now = new Date().toISOString();
      await db.transaction('rw', [db.patient_pharmacy_preferences, db.outbox], async () => {
        await db.patient_pharmacy_preferences.update(activePreference.id, {
          effectiveTo: now,
          endedByUserId: userId,
          updatedAt: now,
        });
        await enqueueOutboxMutation(db, {
          clinicId,
          entityType: 'patient_pharmacy_preference',
          entityId: activePreference.id,
          operation: SYNC_OPERATION.UPSERT,
          payloadJson: payload,
        });
      });
      setOffline(true);
      setNotice('Preference end queued for sync.');
      await loadOffline();
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(
    kind: 'medication' | 'pharmacy',
    record: MedicationRecord | PharmacyRecord,
  ) {
    setHistoryTitle(
      kind === 'medication'
        ? (record as MedicationRecord).currentRevision.medicationName
        : (record as PharmacyRecord).currentRevision.name,
    );
    try {
      const response = await apiFetch(
        `${endpoint}/${kind === 'medication' ? 'medications' : 'pharmacies'}/${encodeURIComponent(record.id)}/revisions`,
        { getToken, activeClinicId: clinicId },
      );
      if (!response.ok) throw new Error();
      setHistoryItems((await response.json()) as Array<MedicationRevision | PharmacyRevision>);
    } catch {
      setHistoryItems(
        kind === 'medication'
          ? ((await db.patient_medication_revisions
              .where('recordId')
              .equals(record.id)
              .reverse()
              .sortBy('revisionNumber')) as MedicationRevision[])
          : ((await db.patient_pharmacy_revisions
              .where('recordId')
              .equals(record.id)
              .reverse()
              .sortBy('revisionNumber')) as PharmacyRevision[]),
      );
    }
  }

  return (
    <div className="space-y-5">
      <AllergySummaryBanner summary={allergies} compact />
      {offline ? (
        <ChartSectionOffline description="Showing medications saved on this device. Pending changes sync automatically once you reconnect." />
      ) : null}
      {notice ? (
        <StatusMessage icon={CheckCircle2} tone="success">
          {notice}
        </StatusMessage>
      ) : null}
      {error ? (
        <ChartSectionError
          title="Unable to load medications"
          description={error}
          onRetry={() => void load()}
        />
      ) : null}

      <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Current medications</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Patient-reported history, kept separate from prescriptions and orders.
              </p>
            </div>
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => void reconcileList()}
                  disabled={saving}
                >
                  <RefreshCw className="h-4 w-4" />
                  {current.length ? 'Reconcile list' : 'Record no known medications'}
                </Button>
                <Button className="rounded-2xl" onClick={() => openMedication()}>
                  <Plus className="h-4 w-4" />
                  Add medication
                </Button>
              </div>
            ) : null}
          </div>
          {view.latestReconciliation ? (
            <p className="text-sm text-muted-foreground">
              <ShieldCheck className="mr-1 inline h-4 w-4" />
              Last reconciled {new Date(view.latestReconciliation.createdAt).toLocaleString()}
              {view.latestReconciliation.reconciledBy?.displayName
                ? ` by ${view.latestReconciliation.reconciledBy.displayName}`
                : ''}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {loading ? (
            <ChartSectionLoading label="medications" />
          ) : current.length ? (
            <MedicationList
              records={current}
              canWrite={canWrite}
              onEdit={openMedication}
              onHistory={(record) => void openHistory('medication', record)}
            />
          ) : (
            <MedicationEmpty state={listState} />
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
        <CardHeader>
          <h2 className="text-lg font-semibold">Past and stopped medications</h2>
          <p className="text-sm text-muted-foreground">
            Historical entries remain visible and auditable.
          </p>
        </CardHeader>
        <CardContent>
          {historical.length ? (
            <MedicationList
              records={historical}
              canWrite={canWrite}
              onEdit={openMedication}
              onHistory={(record) => void openHistory('medication', record)}
            />
          ) : (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No past or stopped medications recorded.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Pharmacy preference and history</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One pharmacy can be actively preferred; prior preferences remain in history.
            </p>
          </div>
          {canWrite ? (
            <Button className="rounded-2xl" onClick={() => openPharmacy()}>
              <Plus className="h-4 w-4" />
              Add pharmacy
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {view.pharmacies.length ? (
            <ul className="space-y-3">
              {view.pharmacies.map((record) => {
                const preferred = activePreference?.pharmacyRecordId === record.id;
                return (
                  <li
                    key={record.id}
                    className="rounded-3xl border border-border/80 bg-background/70 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{record.currentRevision.name}</h3>
                          {preferred ? <Badge variant="finalized">Preferred</Badge> : null}
                        </div>
                        {record.currentRevision.phoneE164 ? (
                          <p className="mt-2 text-sm">{record.currentRevision.phoneE164}</p>
                        ) : null}
                        <p className="mt-1 text-sm text-muted-foreground">
                          {pharmacyAddress(record.currentRevision) || 'Address not recorded'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-2xl"
                          onClick={() => void openHistory('pharmacy', record)}
                        >
                          <History className="h-4 w-4" />
                          History
                        </Button>
                        {canWrite ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-2xl"
                              onClick={() => openPharmacy(record)}
                            >
                              <Pencil className="h-4 w-4" />
                              Revise
                            </Button>
                            {!preferred ? (
                              <Button
                                size="sm"
                                className="rounded-2xl"
                                disabled={saving}
                                onClick={() => void setPreferred(record)}
                              >
                                Make preferred
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-2xl"
                                disabled={saving}
                                onClick={() => void endPreferred()}
                              >
                                End preference
                              </Button>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                    {record.preferences.length ? (
                      <ol className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                        {record.preferences.map((preference) => (
                          <li key={preference.id}>
                            Preferred {new Date(preference.effectiveFrom).toLocaleDateString()} –{' '}
                            {preference.effectiveTo
                              ? new Date(preference.effectiveTo).toLocaleDateString()
                              : 'present'}
                            {preference.setBy?.displayName
                              ? ` · Set by ${preference.setBy.displayName}`
                              : ''}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-3xl border border-dashed p-8 text-center">
              <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">No pharmacy history recorded</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a pharmacy without affecting medication orders or dispensing.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
        <CardHeader>
          <h2 className="text-lg font-semibold">Linked prescription history</h2>
          <p className="text-sm text-muted-foreground">
            Read-only encounter orders shown only as context.
          </p>
        </CardHeader>
        <CardContent>
          {!canReadPrescriptions ? (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              <ShieldCheck className="mr-2 inline h-4 w-4" />
              Prescription context requires PRESCRIPTION.READ. Reported medications above remain
              available.
            </div>
          ) : prescriptions.length ? (
            <ul className="space-y-3">
              {prescriptions.map((item) => (
                <li key={item.id} className="rounded-2xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.drug?.name ?? 'Catalog medication'}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.dosage} · {item.frequency}
                        {item.duration ? ` · ${item.duration}` : ''}
                      </p>
                    </div>
                    {item.encounter ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/encounters/${item.encounter.id}`}>
                          <Link2 className="h-4 w-4" />
                          Encounter
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Ordered {new Date(item.createdAt).toLocaleString()}
                    {item.prescribedBy?.displayName ? ` by ${item.prescribedBy.displayName}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No linked prescriptions found.
            </p>
          )}
        </CardContent>
      </Card>

      <MedicationDialog
        open={medicationOpen}
        onOpenChange={setMedicationOpen}
        editing={Boolean(editingMedication)}
        form={medicationForm}
        setForm={setMedicationForm}
        saving={saving}
        drugQuery={drugQuery}
        setDrugQuery={setDrugQuery}
        drugResults={drugResults}
        error={error}
        onSelectDrug={(drug) => {
          setMedicationForm((currentForm) => ({
            ...currentForm,
            drugId: drug.id,
            medicationName: currentForm.medicationName || drug.name,
          }));
          setDrugQuery(drug.name);
          setDrugResults([]);
        }}
        onSave={() => void saveMedication()}
      />
      <PharmacyDialog
        open={pharmacyOpen}
        onOpenChange={setPharmacyOpen}
        editing={Boolean(editingPharmacy)}
        form={pharmacyForm}
        setForm={setPharmacyForm}
        saving={saving}
        error={error}
        onSave={() => void savePharmacy()}
      />
      <Dialog open={historyItems.length > 0} onOpenChange={(open) => !open && setHistoryItems([])}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Revision history</DialogTitle>
            <DialogDescription>{historyTitle}</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3">
            {historyItems.map((item) => (
              <li key={item.id} className="rounded-2xl border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Revision {item.revisionNumber}</span>
                  {'status' in item ? (
                    <Badge variant={statusPresentation[item.status].variant}>
                      {statusPresentation[item.status].label}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                  {item.authoredBy?.displayName ? ` · ${item.authoredBy.displayName}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MedicationList({
  records,
  canWrite,
  onEdit,
  onHistory,
}: {
  records: MedicationRecord[];
  canWrite: boolean;
  onEdit: (record: MedicationRecord) => void;
  onHistory: (record: MedicationRecord) => void;
}) {
  return (
    <ul className="space-y-3">
      {records.map((record) => {
        const revision = record.currentRevision;
        const status = statusPresentation[revision.status];
        return (
          <li key={record.id} className="rounded-3xl border border-border/80 bg-background/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{revision.medicationName}</h3>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {revision.drug ? (
                    <Badge variant="outline">Catalog linked</Badge>
                  ) : (
                    <Badge variant="outline">External / uncatalogued</Badge>
                  )}
                </div>
                <p className="mt-2 text-sm">
                  {[
                    revision.strength,
                    revision.dose &&
                      `${revision.dose}${revision.doseUnit ? ` ${revision.doseUnit}` : ''}`,
                    revision.route,
                    revision.frequency,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Dose details not recorded'}
                </p>
                {revision.indication ? (
                  <p className="mt-1 text-sm text-muted-foreground">For {revision.indication}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {sourceLabels[revision.sourceType]} · Recorded by{' '}
                  {record.recordedBy?.displayName ?? record.recordedByUserId}
                  {revision.sourceEncounterId ? (
                    <>
                      {' '}
                      ·{' '}
                      <Link
                        className="underline underline-offset-2"
                        href={`/encounters/${revision.sourceEncounterId}`}
                      >
                        Source visit
                      </Link>
                    </>
                  ) : (
                    ''
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {revision.lastReconciledAt
                    ? `Last reconciled ${new Date(revision.lastReconciledAt).toLocaleString()}${revision.reconciledBy?.displayName ? ` by ${revision.reconciledBy.displayName}` : ''}`
                    : 'Not yet reconciled'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-2xl"
                  onClick={() => onHistory(record)}
                >
                  <History className="h-4 w-4" />
                  History
                </Button>
                {canWrite ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-2xl"
                    onClick={() => onEdit(record)}
                  >
                    <Pencil className="h-4 w-4" />
                    Revise
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MedicationEmpty({ state }: { state: ReturnType<typeof medicationListState> }) {
  // Three distinct clinical meanings that must not be confused with one another: an attested
  // "none", a chart with only past medications, and a chart nobody has filled in.
  const noKnown = state === 'NO_KNOWN_CURRENT_MEDICATIONS';
  return (
    <ChartSectionEmpty
      icon={noKnown ? CheckCircle2 : state === 'HISTORICAL_ONLY' ? History : CircleSlash2}
      title={
        noKnown
          ? 'No known current medications'
          : state === 'HISTORICAL_ONLY'
            ? 'No current medications'
            : 'No medications recorded'
      }
      description={
        noKnown
          ? 'A staff member explicitly reconciled this state.'
          : state === 'HISTORICAL_ONLY'
            ? 'Past or stopped medications remain available below.'
            : 'This empty chart is not a clinical claim of no known medications.'
      }
    />
  );
}

function StatusMessage({
  icon: Icon,
  tone = 'warning',
  children,
}: {
  icon: typeof WifiOff;
  tone?: 'warning' | 'success';
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === 'success'
          ? 'rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300'
          : 'rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-300'
      }
    >
      <Icon className="mr-2 inline h-4 w-4" />
      {children}
    </div>
  );
}

function MedicationDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  saving,
  drugQuery,
  setDrugQuery,
  drugResults,
  error,
  onSelectDrug,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: MedicationForm;
  setForm: React.Dispatch<React.SetStateAction<MedicationForm>>;
  saving: boolean;
  drugQuery: string;
  setDrugQuery: (value: string) => void;
  drugResults: DrugSearchResult[];
  error: string | null;
  onSelectDrug: (drug: DrugSearchResult) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Revise reported medication' : 'Add reported medication'}
          </DialogTitle>
          <DialogDescription>
            Saving creates an auditable clinical revision. It never creates a prescription or Drug
            catalog entry.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="medication-name"
            label="Medication name *"
            value={form.medicationName}
            onChange={(value) => setForm((current) => ({ ...current, medicationName: value }))}
          />
          <div className="relative space-y-2">
            <Label htmlFor="medication-drug-search">Link clinic Drug (optional)</Label>
            <Input
              id="medication-drug-search"
              value={drugQuery}
              onChange={(event) => {
                setDrugQuery(event.target.value);
                if (!event.target.value) setForm((current) => ({ ...current, drugId: '' }));
              }}
              placeholder="Search without adding to catalog"
              autoComplete="off"
            />
            {drugResults.length ? (
              <ul
                role="listbox"
                className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
              >
                {drugResults.map((drug) => (
                  <li key={drug.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={form.drugId === drug.id}
                      className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onSelectDrug(drug)}
                    >
                      {drug.name}
                      {drug.genericName ? (
                        <span className="block text-xs text-muted-foreground">
                          {drug.genericName}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <Field
            id="medication-strength"
            label="Strength"
            value={form.strength}
            onChange={(value) => setForm((current) => ({ ...current, strength: value }))}
          />
          <Field
            id="medication-dose"
            label="Dose"
            value={form.dose}
            onChange={(value) => setForm((current) => ({ ...current, dose: value }))}
          />
          <Field
            id="medication-dose-unit"
            label="Dose unit"
            value={form.doseUnit}
            onChange={(value) => setForm((current) => ({ ...current, doseUnit: value }))}
          />
          <Field
            id="medication-route"
            label="Route"
            value={form.route}
            onChange={(value) => setForm((current) => ({ ...current, route: value }))}
          />
          <Field
            id="medication-frequency"
            label="Frequency"
            value={form.frequency}
            onChange={(value) => setForm((current) => ({ ...current, frequency: value }))}
          />
          <Field
            id="medication-duration"
            label="Duration"
            value={form.duration}
            onChange={(value) => setForm((current) => ({ ...current, duration: value }))}
          />
          <Field
            id="medication-indication"
            label="Indication"
            value={form.indication}
            onChange={(value) => setForm((current) => ({ ...current, indication: value }))}
          />
          <SelectField
            id="medication-status"
            label="Status"
            value={form.status}
            options={MEDICATION_STATUSES.map((value) => ({
              value,
              label: statusPresentation[value].label,
            }))}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                status: value as MedicationStatus,
                endDate: value === 'CURRENT' ? '' : current.endDate,
              }))
            }
          />
          <Field
            id="medication-start-date"
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={(value) => setForm((current) => ({ ...current, startDate: value }))}
          />
          <Field
            id="medication-end-date"
            label="End date"
            type="date"
            disabled={form.status === 'CURRENT'}
            value={form.endDate}
            onChange={(value) => setForm((current) => ({ ...current, endDate: value }))}
          />
          <SelectField
            id="medication-source"
            label="Source type"
            value={form.sourceType}
            options={MEDICATION_SOURCE_TYPES.map((value) => ({
              value,
              label: sourceLabels[value],
            }))}
            onChange={(value) =>
              setForm((current) => ({ ...current, sourceType: value as MedicationSourceType }))
            }
          />
          <Field
            id="medication-source-encounter"
            label="Source encounter ID"
            value={form.sourceEncounterId}
            onChange={(value) => setForm((current) => ({ ...current, sourceEncounterId: value }))}
          />
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="medication-notes">Notes</Label>
            <Textarea
              id="medication-notes"
              maxLength={4000}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : editing ? 'Save revision' : 'Add medication'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PharmacyDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  saving,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: PharmacyForm;
  setForm: React.Dispatch<React.SetStateAction<PharmacyForm>>;
  saving: boolean;
  error: string | null;
  onSave: () => void;
}) {
  const fields: Array<[keyof PharmacyForm, string]> = [
    ['name', 'Pharmacy name *'],
    ['phone', 'Phone'],
    ['addressLine1', 'Address line 1'],
    ['addressLine2', 'Address line 2'],
    ['city', 'City'],
    ['region', 'Region'],
    ['postalCode', 'Postal code'],
    ['countryCode', 'Country code'],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Revise pharmacy' : 'Add pharmacy'}</DialogTitle>
          <DialogDescription>
            Pharmacy revisions and preference periods remain auditable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(([key, label]) => (
            <Field
              key={key}
              id={`pharmacy-${key}`}
              label={label}
              value={form[key]}
              onChange={(value) => setForm((current) => ({ ...current, [key]: value }))}
            />
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pharmacy-address-text">Address text</Label>
            <Textarea
              id="pharmacy-address-text"
              value={form.addressText}
              onChange={(event) =>
                setForm((current) => ({ ...current, addressText: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pharmacy-notes">Notes</Label>
            <Textarea
              id="pharmacy-notes"
              maxLength={4000}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : editing ? 'Save revision' : 'Add pharmacy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
