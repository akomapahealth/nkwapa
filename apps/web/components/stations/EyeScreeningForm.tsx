'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye as EyeIcon } from 'lucide-react';
import {
  EXTERNAL_EYE_STRUCTURES,
  EYES,
  EYE_LABELS,
  EYE_STRUCTURE_LABELS,
  INTERNAL_EYE_STRUCTURES,
  VISION_LOSS_CAUSES,
  VISION_LOSS_CAUSE_LABELS,
  VISUAL_ACUITY_LABELS,
  VISUAL_ACUITY_VALUES,
  type Eye,
  type EyeFindingResult,
  type EyeStructure,
  type VisionLossCause,
  type VisualAcuity,
} from '@nkwapa/db/eye-screening';
import { useAuth } from '@/lib/auth-context';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { apiFetch } from '@/lib/api';
import { readApiError } from '@/lib/ops';
import {
  emptyEyeForm,
  eyeFormFromRecord,
  eyePayloadFromForm,
  eyeScreeningPath,
  findingKey,
  type AcuityField,
  type EyeFormState,
  type EyeScreeningRecord,
} from '@/lib/eye-screening';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineNotice } from '@/components/ops/OpsShared';
import { cn } from '@/lib/utils';

/** Radix Select cannot hold an empty value, so "not taken" has a value of its own. */
const NOT_TAKEN = 'NOT_TAKEN';

/** Right eye first, then left, then both: the order the eye team tests in. */
const ACUITY_ROWS: Array<{
  label: string;
  unaided: AcuityField;
  aided: AcuityField;
  pinhole: AcuityField | null;
}> = [
  { label: 'Right eye (OD)', unaided: 'vaOdUnaided', aided: 'vaOdAided', pinhole: 'vaOdPinhole' },
  { label: 'Left eye (OS)', unaided: 'vaOsUnaided', aided: 'vaOsAided', pinhole: 'vaOsPinhole' },
  { label: 'Both eyes (OU)', unaided: 'vaOuUnaided', aided: 'vaOuAided', pinhole: null },
];

const RESULT_OPTIONS: Array<{ value: EyeFindingResult; label: string }> = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'ABNORMAL', label: 'Abnormal' },
  { value: 'NOT_ASSESSED', label: 'Not assessed' },
];

/**
 * The Eye station (UCC eye team): a brief history when the patient has an eye complaint, visual
 * acuity, the penlight examination of the front of the eye, and ophthalmoscopy of the inside.
 *
 * Online only, like counselling; see EyeScreeningService.
 */
export function EyeScreeningForm({
  clinicId,
  encounterId,
  canEdit,
  onSaved,
  onLoaded,
}: {
  clinicId: string;
  encounterId: string;
  canEdit: boolean;
  onSaved?: (record: EyeScreeningRecord) => void;
  onLoaded?: (record: EyeScreeningRecord | null) => void;
}) {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const [record, setRecord] = useState<EyeScreeningRecord | null>(null);
  const [form, setForm] = useState<EyeFormState>(emptyEyeForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const path = eyeScreeningPath(clinicId, encounterId);

  const load = useCallback(async () => {
    if (!getToken || !isOnline) {
      setLoading(false);
      return;
    }
    try {
      const response = await apiFetch(path, { getToken, activeClinicId: clinicId });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as { record: EyeScreeningRecord | null };
      setRecord(body.record);
      setForm(eyeFormFromRecord(body.record));
      onLoaded?.(body.record);
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [getToken, isOnline, path, clinicId, onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = canEdit && isOnline;

  async function save() {
    if (!getToken) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await apiFetch(path, {
        method: 'PUT',
        getToken,
        activeClinicId: clinicId,
        body: JSON.stringify(eyePayloadFromForm(form, record?.version)),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as { record: EyeScreeningRecord };
      setRecord(body.record);
      setForm(eyeFormFromRecord(body.record));
      setStatus({ tone: 'success', text: 'Eye examination saved.' });
      onSaved?.(body.record);
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  const update = (patch: Partial<EyeFormState>) => setForm((current) => ({ ...current, ...patch }));

  const setFinding = (eye: Eye, structure: EyeStructure, result: EyeFindingResult | null) =>
    setForm((current) => {
      const findings = { ...current.findings };
      const key = findingKey(eye, structure);
      if (result) findings[key] = { result, note: findings[key]?.note ?? '' };
      else delete findings[key];
      return { ...current, findings };
    });

  const setFindingNote = (eye: Eye, structure: EyeStructure, note: string) =>
    setForm((current) => {
      const key = findingKey(eye, structure);
      const cell = current.findings[key];
      if (!cell) return current;
      return { ...current, findings: { ...current.findings, [key]: { ...cell, note } } };
    });

  /** Mark every unrecorded structure in a section normal, for the common all-clear case. */
  const markRestNormal = (structures: readonly EyeStructure[]) =>
    setForm((current) => {
      const findings = { ...current.findings };
      for (const eye of EYES) {
        for (const structure of structures) {
          const key = findingKey(eye, structure);
          if (!findings[key]) findings[key] = { result: 'NORMAL', note: '' };
        }
      }
      return { ...current, findings };
    });

  const acuitySelect = (field: AcuityField, label: string) => (
    <Select
      value={form[field] || NOT_TAKEN}
      onValueChange={(value) =>
        update({ [field]: value === NOT_TAKEN ? '' : (value as VisualAcuity) })
      }
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NOT_TAKEN}>Not taken</SelectItem>
        {VISUAL_ACUITY_VALUES.map((value) => (
          <SelectItem key={value} value={value}>
            {VISUAL_ACUITY_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const findingsTable = (title: string, structures: readonly EyeStructure[]) => (
    <section className="space-y-3" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => markRestNormal(structures)}
          >
            Mark the rest normal
          </Button>
        ) : null}
      </div>
      <div className="divide-y rounded-lg border">
        {structures.map((structure) => (
          <div key={structure} className="space-y-2 p-3">
            <p className="text-sm font-medium">{EYE_STRUCTURE_LABELS[structure]}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {EYES.map((eye) => {
                const cell = form.findings[findingKey(eye, structure)];
                const groupLabel = `${EYE_STRUCTURE_LABELS[structure]}, ${EYE_LABELS[eye]}`;
                return (
                  <div key={eye} className="space-y-2">
                    <p className="text-xs text-muted-foreground">{EYE_LABELS[eye]}</p>
                    <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-1">
                      {RESULT_OPTIONS.map((option) => {
                        const selected = cell?.result === option.value;
                        return (
                          <Button
                            key={option.value}
                            type="button"
                            size="sm"
                            variant={selected ? 'default' : 'outline'}
                            aria-pressed={selected}
                            className={cn(
                              selected &&
                                option.value === 'ABNORMAL' &&
                                'bg-warning text-warning-foreground hover:bg-warning/90',
                            )}
                            onClick={() =>
                              setFinding(eye, structure, selected ? null : option.value)
                            }
                          >
                            {option.label}
                          </Button>
                        );
                      })}
                    </div>
                    {cell?.result === 'ABNORMAL' ? (
                      <Input
                        aria-label={`What was seen: ${groupLabel}`}
                        placeholder="What was seen"
                        maxLength={500}
                        value={cell.note}
                        onChange={(event) => setFindingNote(eye, structure, event.target.value)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <EyeIcon className="h-5 w-5 text-primary" aria-hidden="true" />
          Eye examination
        </CardTitle>
        <CardDescription>
          {record
            ? `Last saved by ${record.author.displayName}.`
            : 'Visual acuity, then the penlight examination, then ophthalmoscopy.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isOnline ? (
          <InlineNotice tone="warning" live={false}>
            The eye examination needs a connection to load and save.
          </InlineNotice>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <fieldset disabled={!editable} className="space-y-6">
            <section className="space-y-3 rounded-lg border p-3" aria-label="Eye history">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  id="hasEyeComplaint"
                  checked={form.hasEyeComplaint}
                  onCheckedChange={(checked) => update({ hasEyeComplaint: checked === true })}
                />
                <Label htmlFor="hasEyeComplaint">The patient has an eye complaint</Label>
              </div>
              {form.hasEyeComplaint ? (
                <Textarea
                  aria-label="Brief eye history"
                  placeholder="What they notice, which eye, since when. This goes to whoever they are referred to."
                  rows={3}
                  maxLength={2000}
                  value={form.complaintHistory}
                  onChange={(event) => update({ complaintHistory: event.target.value })}
                />
              ) : null}
              <div className="flex items-center gap-2 text-sm">
                <Checkbox
                  id="wearsCorrection"
                  checked={form.wearsCorrection}
                  onCheckedChange={(checked) => update({ wearsCorrection: checked === true })}
                />
                <Label htmlFor="wearsCorrection">Wears glasses or contact lenses</Label>
              </div>
            </section>

            <section className="space-y-3" aria-label="Visual acuity">
              <div>
                <h3 className="text-base font-semibold">Visual acuity</h3>
                <p className="text-sm text-muted-foreground">
                  Snellen chart at 6 m. Test the right eye, then the left, then both.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pb-2 font-normal">Eye</th>
                      <th className="pb-2 font-normal">Unaided</th>
                      <th className="pb-2 font-normal">With correction</th>
                      <th className="pb-2 font-normal">Pinhole</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ACUITY_ROWS.map((row) => (
                      <tr key={row.label}>
                        <th scope="row" className="py-1 pr-3 text-left font-medium">
                          {row.label}
                        </th>
                        <td className="py-1 pr-2">
                          {acuitySelect(row.unaided, `${row.label}, unaided`)}
                        </td>
                        <td className="py-1 pr-2">
                          {acuitySelect(row.aided, `${row.label}, with correction`)}
                        </td>
                        <td className="py-1">
                          {row.pinhole ? (
                            acuitySelect(row.pinhole, `${row.label}, pinhole`)
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {findingsTable('Penlight examination (externals)', EXTERNAL_EYE_STRUCTURES)}

            {findingsTable('Ophthalmoscopy (internals)', INTERNAL_EYE_STRUCTURES)}
            <div className="grid gap-3 sm:grid-cols-2">
              {(['OD', 'OS'] as const).map((eye) => {
                const field = eye === 'OD' ? 'cupDiscRatioOd' : 'cupDiscRatioOs';
                return (
                  <div key={eye} className="space-y-1">
                    <Label htmlFor={field}>Cup-to-disc ratio, {EYE_LABELS[eye]}</Label>
                    <Input
                      id={field}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={1}
                      step={0.05}
                      placeholder="e.g. 0.3"
                      value={form[field]}
                      onChange={(event) => update({ [field]: event.target.value })}
                    />
                  </div>
                );
              })}
            </div>

            <section className="space-y-3 rounded-lg border p-3" aria-label="Impression">
              <h3 className="text-base font-semibold">Impression</h3>
              <div className="space-y-1">
                <Label htmlFor="visionLossCause">If vision is reduced, it looks</Label>
                <Select
                  value={form.visionLossCause || NOT_TAKEN}
                  onValueChange={(value) =>
                    update({
                      visionLossCause: value === NOT_TAKEN ? '' : (value as VisionLossCause),
                    })
                  }
                >
                  <SelectTrigger id="visionLossCause">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOT_TAKEN}>Vision not reduced</SelectItem>
                    {VISION_LOSS_CAUSES.map((cause) => (
                      <SelectItem key={cause} value={cause}>
                        {VISION_LOSS_CAUSE_LABELS[cause]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                Signs in the eye of a systemic condition suggest the patient may be prediabetic or
                hypertensive, or has had diabetes or hypertension for a long time.
              </p>
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="diabeticSignsSeen"
                    checked={form.diabeticSignsSeen}
                    onCheckedChange={(checked) => update({ diabeticSignsSeen: checked === true })}
                  />
                  <Label htmlFor="diabeticSignsSeen">Signs of diabetes seen</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hypertensiveSignsSeen"
                    checked={form.hypertensiveSignsSeen}
                    onCheckedChange={(checked) =>
                      update({ hypertensiveSignsSeen: checked === true })
                    }
                  />
                  <Label htmlFor="hypertensiveSignsSeen">Signs of hypertension seen</Label>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  id="eyeReferralRecommended"
                  checked={form.referralRecommended}
                  onCheckedChange={(checked) => update({ referralRecommended: checked === true })}
                />
                <Label htmlFor="eyeReferralRecommended">Refer to an eye specialist</Label>
              </div>
              {form.referralRecommended ? (
                <Textarea
                  aria-label="Referral note"
                  placeholder="What the specialist should look at"
                  rows={2}
                  maxLength={2000}
                  value={form.referralNote}
                  onChange={(event) => update({ referralNote: event.target.value })}
                />
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="eyeNotes">Other notes</Label>
                <Textarea
                  id="eyeNotes"
                  rows={2}
                  maxLength={5000}
                  value={form.notes}
                  onChange={(event) => update({ notes: event.target.value })}
                />
              </div>
            </section>
          </fieldset>
        )}
        {status ? <InlineNotice tone={status.tone}>{status.text}</InlineNotice> : null}
        {editable && !loading ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save eye examination'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
