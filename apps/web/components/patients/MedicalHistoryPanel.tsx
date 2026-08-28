'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleOff, History, Pencil, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { db } from '@/lib/db';
import {
  buildMedicalHistoryOutboxPayload,
  enqueueOutboxMutation,
  SYNC_OPERATION,
} from '@/lib/outbox';
import { readApiError } from '@/lib/ops';
import {
  MEDICAL_HISTORY_CATEGORIES,
  MEDICAL_HISTORY_STATUSES,
  medicalHistoryLabel,
  sortMedicalHistory,
  type AllergySummary,
  type MedicalHistoryCategory,
  type MedicalHistoryRecord,
  type MedicalHistoryRevision,
  type MedicalHistoryStatus,
} from '@/lib/medical-history';
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

const emptyAllergySummary: AllergySummary = {
  state: 'NOT_RECORDED',
  activeAllergies: [],
};

const categoryLabels: Record<MedicalHistoryCategory, string> = {
  CONDITION: 'Condition',
  ALLERGY: 'Allergy / adverse reaction',
  SURGERY_PROCEDURE: 'Surgery / procedure',
  FAMILY_HISTORY: 'Family history',
  SOCIAL_HISTORY: 'Social history',
};

const statusPresentations: Record<
  MedicalHistoryStatus,
  { label: string; icon: typeof CheckCircle2; variant: 'finalized' | 'warning' | 'outline' }
> = {
  ACTIVE: { label: 'Active', icon: CheckCircle2, variant: 'finalized' },
  RESOLVED: { label: 'Resolved', icon: CircleOff, variant: 'outline' },
  INACTIVE: { label: 'Inactive', icon: CircleOff, variant: 'outline' },
  HISTORICAL: { label: 'Historical', icon: History, variant: 'warning' },
  ENTERED_IN_ERROR: { label: 'Entered in error', icon: AlertTriangle, variant: 'outline' },
};

type FormState = {
  category: MedicalHistoryCategory;
  status: MedicalHistoryStatus;
  onsetDate: string;
  occurrenceDate: string;
  resolvedDate: string;
  notes: string;
  kind: 'ALLERGY' | 'NO_KNOWN_ALLERGIES';
  conditionName: string;
  substance: string;
  reaction: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'UNKNOWN';
  procedureName: string;
  relationship: string;
  familyCondition: string;
  socialType: 'TOBACCO' | 'ALCOHOL' | 'SUBSTANCE_USE' | 'OCCUPATION' | 'LIVING_SITUATION' | 'OTHER';
  description: string;
};

const initialForm: FormState = {
  category: 'CONDITION',
  status: 'ACTIVE',
  onsetDate: '',
  occurrenceDate: '',
  resolvedDate: '',
  notes: '',
  kind: 'ALLERGY',
  conditionName: '',
  substance: '',
  reaction: '',
  severity: 'UNKNOWN',
  procedureName: '',
  relationship: '',
  familyCondition: '',
  socialType: 'TOBACCO',
  description: '',
};

function value(details: Record<string, unknown>, key: string) {
  return typeof details[key] === 'string' ? String(details[key]) : '';
}

function toDateInput(date: string | null | undefined) {
  return date ? date.slice(0, 10) : '';
}

export function MedicalHistoryPanel({
  clinicId,
  patientId,
  userId,
  canWrite,
}: {
  clinicId: string;
  patientId: string;
  userId: string;
  canWrite: boolean;
}) {
  const getToken = useAuth();
  const [records, setRecords] = useState<MedicalHistoryRecord[]>([]);
  const [allergySummary, setAllergySummary] = useState<AllergySummary>(emptyAllergySummary);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MedicalHistoryRecord | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [revisionRecord, setRevisionRecord] = useState<MedicalHistoryRecord | null>(null);
  const [revisions, setRevisions] = useState<MedicalHistoryRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);

  const loadLocal = useCallback(async () => {
    const localRecords = await db.medical_history_records
      .where('patientId')
      .equals(patientId)
      .filter((record) => record.clinicId === clinicId)
      .toArray();
    const joined = (
      await Promise.all(
        localRecords.map(async (record) => {
          if (!record.currentRevisionId) return null;
          const revision = await db.medical_history_revisions.get(record.currentRevisionId);
          if (!revision) return null;
          return {
            ...record,
            currentRevisionId: record.currentRevisionId,
            currentRevision: revision,
            createdAt: record.createdAt ?? revision.createdAt ?? new Date().toISOString(),
            updatedAt: record.updatedAt ?? revision.createdAt ?? new Date().toISOString(),
          } as MedicalHistoryRecord;
        }),
      )
    ).filter((record): record is MedicalHistoryRecord => record !== null);
    setRecords(sortMedicalHistory(joined));
    setAllergySummary(thisLocalAllergySummary(joined));
    setOffline(true);
  }, [clinicId, patientId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams();
      if (categoryFilter !== 'ALL') search.set('category', categoryFilter);
      if (statusFilter !== 'ALL') search.set('status', statusFilter);
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/medical-history?${search.toString()}`,
        { getToken, activeClinicId: clinicId },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      const payload = (await response.json()) as {
        records: MedicalHistoryRecord[];
        allergySummary: AllergySummary;
      };
      setRecords(sortMedicalHistory(payload.records));
      setAllergySummary(payload.allergySummary);
      setOffline(false);
    } catch (loadError) {
      try {
        await loadLocal();
      } catch {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load history.');
      }
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, clinicId, getToken, loadLocal, patientId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          (categoryFilter === 'ALL' || record.category === categoryFilter) &&
          (statusFilter === 'ALL' || record.currentRevision.status === statusFilter),
      ),
    [categoryFilter, records, statusFilter],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm);
    setError(null);
    setEditorOpen(true);
  };

  const openEdit = (record: MedicalHistoryRecord) => {
    const details = record.currentRevision.details;
    setEditing(record);
    setForm({
      ...initialForm,
      category: record.category,
      status: record.currentRevision.status,
      onsetDate: toDateInput(record.currentRevision.onsetDate),
      occurrenceDate: toDateInput(record.currentRevision.occurrenceDate),
      resolvedDate: toDateInput(record.currentRevision.resolvedDate),
      notes: record.currentRevision.notes ?? '',
      kind: details.kind === 'NO_KNOWN_ALLERGIES' ? 'NO_KNOWN_ALLERGIES' : 'ALLERGY',
      conditionName: value(details, 'conditionName'),
      substance: value(details, 'substance'),
      reaction: value(details, 'reaction'),
      severity: (value(details, 'severity') as FormState['severity']) || 'UNKNOWN',
      procedureName: value(details, 'procedureName'),
      relationship: value(details, 'relationship'),
      familyCondition: value(details, 'familyCondition'),
      socialType: (value(details, 'socialType') as FormState['socialType']) || 'TOBACCO',
      description: value(details, 'description'),
    });
    setError(null);
    setEditorOpen(true);
  };

  const detailsForForm = (): Record<string, unknown> => {
    switch (form.category) {
      case 'CONDITION':
        return { conditionName: form.conditionName };
      case 'ALLERGY':
        return form.kind === 'NO_KNOWN_ALLERGIES'
          ? { kind: form.kind, severity: 'UNKNOWN' }
          : {
              kind: form.kind,
              substance: form.substance,
              reaction: form.reaction || undefined,
              severity: form.severity,
            };
      case 'SURGERY_PROCEDURE':
        return { procedureName: form.procedureName };
      case 'FAMILY_HISTORY':
        return { relationship: form.relationship, familyCondition: form.familyCondition };
      case 'SOCIAL_HISTORY':
        return { socialType: form.socialType, description: form.description };
    }
  };

  const saveOffline = async (
    recordId: string,
    revisionId: string,
    payload: Record<string, unknown>,
  ) => {
    const now = new Date().toISOString();
    const priorRevisionNumber = editing?.currentRevision.revisionNumber ?? 0;
    await db.transaction(
      'rw',
      [db.medical_history_records, db.medical_history_revisions, db.outbox],
      async () => {
        await db.medical_history_revisions.put({
          id: revisionId,
          recordId,
          revisionNumber: priorRevisionNumber + 1,
          status: form.status,
          onsetDate: form.onsetDate || undefined,
          occurrenceDate: form.occurrenceDate || undefined,
          resolvedDate: form.resolvedDate || undefined,
          detailsSchemaVersion: 1,
          details: detailsForForm(),
          notes: form.notes || undefined,
          authoredByUserId: userId,
          createdAt: now,
        });
        await db.medical_history_records.put({
          id: recordId,
          clinicId,
          patientId,
          category: form.category,
          currentRevisionId: revisionId,
          createdAt: editing?.createdAt ?? now,
          updatedAt: now,
        });
        await enqueueOutboxMutation(db, {
          clinicId,
          entityType: 'medical_history_revision',
          entityId: recordId,
          operation: SYNC_OPERATION.UPSERT,
          payloadJson: payload,
        });
      },
    );
    await loadLocal();
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const recordId = editing?.id ?? crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const payload = buildMedicalHistoryOutboxPayload({
      patientId,
      revisionId,
      category: editing ? undefined : form.category,
      expectedCurrentRevisionId: editing?.currentRevisionId,
      status: form.status,
      onsetDate: form.onsetDate || undefined,
      occurrenceDate: form.occurrenceDate || undefined,
      resolvedDate: form.resolvedDate || undefined,
      details: detailsForForm(),
      notes: form.notes || undefined,
    });
    const apiSnapshot = { ...payload };
    delete apiSnapshot.patientId;
    delete apiSnapshot.category;
    try {
      const endpoint = editing
        ? `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/medical-history/${encodeURIComponent(recordId)}/revisions`
        : `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/medical-history`;
      const response = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(
          editing ? apiSnapshot : { ...apiSnapshot, recordId, category: form.category },
        ),
        getToken,
        activeClinicId: clinicId,
      });
      if (!response.ok) {
        const message = await readApiError(response);
        if (response.status === 409) {
          await load();
          throw new Error(`${message} The latest revision has been reloaded.`);
        }
        throw new Error(message);
      }
      setEditorOpen(false);
      await load();
    } catch (saveError) {
      if (!navigator.onLine || saveError instanceof TypeError) {
        await saveOffline(recordId, revisionId, payload);
        setEditorOpen(false);
      } else {
        setError(saveError instanceof Error ? saveError.message : 'Unable to save history.');
      }
    } finally {
      setSaving(false);
    }
  };

  const openRevisions = async (record: MedicalHistoryRecord) => {
    setRevisionRecord(record);
    setRevisionsLoading(true);
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/medical-history/${encodeURIComponent(record.id)}/revisions`,
        { getToken, activeClinicId: clinicId },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      setRevisions((await response.json()) as MedicalHistoryRevision[]);
    } catch {
      setRevisions(
        (await db.medical_history_revisions.where('recordId').equals(record.id).toArray()).sort(
          (a, b) => b.revisionNumber - a.revisionNumber,
        ) as MedicalHistoryRevision[],
      );
    } finally {
      setRevisionsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <AllergySummaryBanner summary={allergySummary} />
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Longitudinal medical history</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Active information appears first. Prior revisions remain recoverable.
              </p>
            </div>
            {canWrite ? (
              <Button onClick={openCreate} className="rounded-lg">
                <Plus className="h-4 w-4" />
                Add history
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2" aria-label="Medical history filters">
            <div className="space-y-2">
              <Label htmlFor="medical-history-category-filter">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger id="medical-history-category-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {MEDICAL_HISTORY_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {categoryLabels[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="medical-history-status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="medical-history-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {MEDICAL_HISTORY_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusPresentations[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {offline ? (
            <ChartSectionOffline description="Showing history saved on this device. Pending changes sync automatically once you reconnect." />
          ) : null}
          {error ? (
            <ChartSectionError
              title="Unable to load medical history"
              description={error}
              onRetry={() => void load()}
            />
          ) : null}
          {loading ? (
            <ChartSectionLoading label="medical history" />
          ) : visibleRecords.length === 0 ? (
            <ChartSectionEmpty
              icon={History}
              title="No matching history records"
              description="This is an explicit empty state, not a record of no known conditions or allergies."
            />
          ) : (
            <ul className="space-y-3">
              {visibleRecords.map((record) => {
                const presentation = statusPresentations[record.currentRevision.status];
                const StatusIcon = presentation.icon;
                return (
                  <li key={record.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{medicalHistoryLabel(record)}</h3>
                          <Badge variant={presentation.variant} className="gap-1">
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {presentation.label}
                          </Badge>
                          <Badge variant="outline">{categoryLabels[record.category]}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Updated {new Date(record.updatedAt).toLocaleDateString()} · Revision{' '}
                          {record.currentRevision.revisionNumber}
                          {record.currentRevision.authoredBy?.displayName
                            ? ` · ${record.currentRevision.authoredBy.displayName}`
                            : ''}
                        </p>
                        {record.currentRevision.notes ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm">
                            {record.currentRevision.notes}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => void openRevisions(record)}
                        >
                          <History className="h-4 w-4" />
                          Revisions
                        </Button>
                        {canWrite && record.currentRevision.status !== 'ENTERED_IN_ERROR' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => openEdit(record)}
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
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Revise history record' : 'Add history record'}</DialogTitle>
            <DialogDescription>
              Saving creates a new auditable revision. Earlier clinical values remain available.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              id="history-category"
              label="Category"
              value={form.category}
              disabled={Boolean(editing)}
              onChange={(category) =>
                setForm(() => ({
                  ...initialForm,
                  category: category as MedicalHistoryCategory,
                }))
              }
              options={MEDICAL_HISTORY_CATEGORIES.map((category) => ({
                value: category,
                label: categoryLabels[category],
              }))}
            />
            <FormSelect
              id="history-status"
              label="Status"
              value={form.status}
              onChange={(status) =>
                setForm((current) => ({
                  ...current,
                  status: status as MedicalHistoryStatus,
                }))
              }
              options={MEDICAL_HISTORY_STATUSES.map((status) => ({
                value: status,
                label: statusPresentations[status].label,
              }))}
            />
            <CategoryFields form={form} setForm={setForm} />
            <DateField
              id="history-onset-date"
              label="Onset date"
              value={form.onsetDate}
              onChange={(onsetDate) => setForm((current) => ({ ...current, onsetDate }))}
            />
            <DateField
              id="history-occurrence-date"
              label="Occurrence date"
              value={form.occurrenceDate}
              onChange={(occurrenceDate) => setForm((current) => ({ ...current, occurrenceDate }))}
            />
            <DateField
              id="history-resolved-date"
              label="Resolved date"
              value={form.resolvedDate}
              onChange={(resolvedDate) => setForm((current) => ({ ...current, resolvedDate }))}
            />
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="history-notes">Clinical notes</Label>
              <Textarea
                id="history-notes"
                value={form.notes}
                maxLength={4000}
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
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save revision' : 'Add record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(revisionRecord)}
        onOpenChange={(open) => !open && setRevisionRecord(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Revision history</DialogTitle>
            <DialogDescription>
              {revisionRecord ? medicalHistoryLabel(revisionRecord) : ''}
            </DialogDescription>
          </DialogHeader>
          {revisionsLoading ? (
            <p className="text-sm text-muted-foreground">Loading revisions…</p>
          ) : (
            <ol className="space-y-3">
              {revisions.map((revision) => (
                <li key={revision.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">Revision {revision.revisionNumber}</span>
                    <Badge variant={statusPresentations[revision.status].variant}>
                      {statusPresentations[revision.status].label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {new Date(revision.createdAt).toLocaleString()}
                    {revision.authoredBy?.displayName
                      ? ` · ${revision.authoredBy.displayName}`
                      : ''}
                  </p>
                  {revision.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm">{revision.notes}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function thisLocalAllergySummary(records: MedicalHistoryRecord[]): AllergySummary {
  const allergyRecords = records.filter(
    (record) =>
      record.category === 'ALLERGY' && record.currentRevision.status !== 'ENTERED_IN_ERROR',
  );
  const active = allergyRecords.filter((record) => record.currentRevision.status === 'ACTIVE');
  const activeAllergies = active
    .filter((record) => record.currentRevision.details.kind === 'ALLERGY')
    .map((record) => ({
      recordId: record.id,
      revisionId: record.currentRevision.id,
      substance: value(record.currentRevision.details, 'substance'),
      reaction: value(record.currentRevision.details, 'reaction'),
      severity: value(record.currentRevision.details, 'severity') || 'UNKNOWN',
    }));
  const hasNka = active.some(
    (record) => record.currentRevision.details.kind === 'NO_KNOWN_ALLERGIES',
  );
  return {
    state:
      activeAllergies.length > 0
        ? 'ACTIVE_ALLERGIES'
        : hasNka
          ? 'NO_KNOWN_ALLERGIES'
          : allergyRecords.length > 0
            ? 'HISTORICAL_ONLY'
            : 'NOT_RECORDED',
    activeAllergies,
  };
}

function FormSelect({
  id,
  label,
  value: selectedValue,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={selectedValue} onValueChange={onChange} disabled={disabled}>
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

function TextField({
  id,
  label,
  fieldValue,
  onChange,
  required,
}: {
  id: string;
  label: string;
  fieldValue: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={fieldValue}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function DateField({
  id,
  label,
  value: dateValue,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={dateValue}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function CategoryFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  if (form.category === 'CONDITION') {
    return (
      <TextField
        id="history-condition-name"
        label="Condition"
        fieldValue={form.conditionName}
        required
        onChange={(conditionName) => setForm((current) => ({ ...current, conditionName }))}
      />
    );
  }
  if (form.category === 'ALLERGY') {
    return (
      <>
        <FormSelect
          id="history-allergy-kind"
          label="Allergy state"
          value={form.kind}
          onChange={(kind) =>
            setForm((current) => ({ ...current, kind: kind as FormState['kind'] }))
          }
          options={[
            { value: 'ALLERGY', label: 'Allergy / adverse reaction' },
            { value: 'NO_KNOWN_ALLERGIES', label: 'No known allergies' },
          ]}
        />
        {form.kind === 'ALLERGY' ? (
          <>
            <TextField
              id="history-allergy-substance"
              label="Substance"
              fieldValue={form.substance}
              required
              onChange={(substance) => setForm((current) => ({ ...current, substance }))}
            />
            <TextField
              id="history-allergy-reaction"
              label="Reaction (if known)"
              fieldValue={form.reaction}
              onChange={(reaction) => setForm((current) => ({ ...current, reaction }))}
            />
            <FormSelect
              id="history-allergy-severity"
              label="Severity"
              value={form.severity}
              onChange={(severity) =>
                setForm((current) => ({
                  ...current,
                  severity: severity as FormState['severity'],
                }))
              }
              options={['UNKNOWN', 'MILD', 'MODERATE', 'SEVERE'].map((severity) => ({
                value: severity,
                label: severity.charAt(0) + severity.slice(1).toLowerCase(),
              }))}
            />
          </>
        ) : null}
      </>
    );
  }
  if (form.category === 'SURGERY_PROCEDURE') {
    return (
      <TextField
        id="history-procedure-name"
        label="Surgery or procedure"
        fieldValue={form.procedureName}
        required
        onChange={(procedureName) => setForm((current) => ({ ...current, procedureName }))}
      />
    );
  }
  if (form.category === 'FAMILY_HISTORY') {
    return (
      <>
        <TextField
          id="history-family-relationship"
          label="Relationship"
          fieldValue={form.relationship}
          required
          onChange={(relationship) => setForm((current) => ({ ...current, relationship }))}
        />
        <TextField
          id="history-family-condition"
          label="Condition"
          fieldValue={form.familyCondition}
          required
          onChange={(familyCondition) => setForm((current) => ({ ...current, familyCondition }))}
        />
      </>
    );
  }
  return (
    <>
      <FormSelect
        id="history-social-type"
        label="Social history type"
        value={form.socialType}
        onChange={(socialType) =>
          setForm((current) => ({
            ...current,
            socialType: socialType as FormState['socialType'],
          }))
        }
        options={[
          'TOBACCO',
          'ALCOHOL',
          'SUBSTANCE_USE',
          'OCCUPATION',
          'LIVING_SITUATION',
          'OTHER',
        ].map((type) => ({ value: type, label: type.replaceAll('_', ' ') }))}
      />
      <TextField
        id="history-social-description"
        label="Relevant details"
        fieldValue={form.description}
        required
        onChange={(description) => setForm((current) => ({ ...current, description }))}
      />
    </>
  );
}
