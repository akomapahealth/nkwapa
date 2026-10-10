'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { mapServerFieldErrors, mayQueueAfterFailure } from '@/lib/prescription-save';
import { db } from '@/lib/db';
import { enqueueOutboxMutation, SYNC_OPERATION } from '@/lib/outbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  requiresPrescriptionAllergyAcknowledgement,
  type AllergySummaryState,
} from '@/lib/medical-history';
import { FieldError, FieldLabel, fieldErrorProps, focusFirstInvalid } from '@/components/ui/field';
import { InlineNotice } from '@/components/ops/OpsShared';

interface Drug {
  id: string;
  name: string;
  genericName?: string;
  category: string;
}

interface PrescriptionFormProps {
  clinicId: string;
  encounterId: string;
  userId: string;
  onSaved?: () => void;
  allergyState?: AllergySummaryState;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function PrescriptionForm({
  clinicId,
  encounterId,
  userId,
  onSaved,
  allergyState,
}: PrescriptionFormProps) {
  const getToken = useAuth();
  const [drugQuery, setDrugQuery] = useState('');
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [quantity, setQuantity] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [allergyAcknowledged, setAllergyAcknowledged] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /** Screen order, so focus lands on the first problem the reader would reach, not the first the
      validator happened to record. */
  const FIELD_ORDER = [
    'prescription-drug-search',
    'prescription-dosage',
    'prescription-frequency',
    'prescription-quantity',
    'prescription-allergy-acknowledgement',
  ];
  /** Server field names to the input that shows them. Anything unmapped stays in the banner. */
  const SERVER_FIELD_TO_INPUT: Record<string, string> = {
    drugId: 'prescription-drug-search',
    dosage: 'prescription-dosage',
    frequency: 'prescription-frequency',
    duration: 'prescription-duration',
    quantity: 'prescription-quantity',
    instructions: 'prescription-instructions',
    allergyReviewed: 'prescription-allergy-acknowledgement',
  };

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (drugQuery.length < 2) {
      setDrugs([]);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/drugs?q=${encodeURIComponent(drugQuery)}`,
          { getToken, activeClinicId: clinicId },
        );
        if (res.ok) {
          setDrugs((await res.json()) as Drug[]);
        }
      } catch {
        // Ignore errors during search
      }
    }, 300);
  }, [drugQuery, clinicId, getToken]);

  /*
    Validation runs on submit and then re-runs per field as it is corrected.

    Before this the form had no validation at all: the three required fields were expressed only
    as a disabled Save button, so a prescriber facing a button that would not press had nothing
    telling them which of four conditions was unmet. The button is enabled now and the form
    explains itself.
  */
  const validate = () => {
    const next: Record<string, string> = {};
    if (!selectedDrug) next['prescription-drug-search'] = 'Choose a drug from the clinic catalog.';
    if (!dosage.trim()) next['prescription-dosage'] = 'Enter a dose, including its unit.';
    if (!frequency.trim()) next['prescription-frequency'] = 'Enter how often the patient takes it.';
    if (quantity && !(Number.parseInt(quantity, 10) > 0)) {
      next['prescription-quantity'] = 'Quantity must be a whole number of one or more.';
    }
    if (requiresPrescriptionAllergyAcknowledgement(allergyState) && !allergyAcknowledged) {
      next['prescription-allergy-acknowledgement'] =
        'Confirm you reviewed the allergy status before prescribing.';
    }
    return next;
  };

  const clearFieldError = (id: string) =>
    setFieldErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });

  const handleSave = async () => {
    const acknowledgementRequired = requiresPrescriptionAllergyAcknowledgement(allergyState);
    const problems = validate();
    setFieldErrors(problems);
    if (Object.keys(problems).length) {
      focusFirstInvalid(problems, FIELD_ORDER);
      return;
    }
    // validate() has already refused an empty drug; this restates it for the type system.
    if (!selectedDrug) return;
    setSaving(true);
    setNotice(null);

    const body = {
      drugId: selectedDrug.id,
      dosage,
      frequency,
      duration: duration || undefined,
      quantity: quantity ? parseInt(quantity, 10) : undefined,
      instructions: instructions || undefined,
      allergyReviewed: acknowledgementRequired ? allergyAcknowledged : undefined,
    };

    /*
      Only a request that never reached the server may fall through to the outbox.

      This used to be one try/catch around the whole exchange, so a refusal and a dropped
      connection were indistinguishable: both queued the prescription, reset the form and
      reported a save. A prescriber was told a refused prescription was recorded, and the
      queued copy could only ever collect the same refusal on replay. Scoping the try to
      the call itself makes that structurally impossible rather than merely handled --
      apiFetch returns a Response whenever the server answered at all, and raises only when
      nothing came back.
    */
    try {
      let res: Response;
      try {
        res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/prescriptions`,
          {
            method: 'POST',
            body: JSON.stringify(body),
            getToken,
            activeClinicId: clinicId,
          },
        );
      } catch (err) {
        // The only path to the outbox. Nothing below this line may reach it.
        await queueOffline(err);
        return;
      }

      if (!res.ok) {
        const refusal = await readApiError(res);
        const mapped = mapServerFieldErrors(refusal.fieldErrors, SERVER_FIELD_TO_INPUT);
        if (Object.keys(mapped).length) {
          setFieldErrors(mapped);
          focusFirstInvalid(mapped, FIELD_ORDER);
        }
        setNotice({
          tone: 'error',
          text: getErrorMessage(refusal, 'The prescription was not saved.'),
        });
        return;
      }

      resetForm();
      setNotice({ tone: 'success', text: 'Prescription saved and synced.' });
      onSaved?.();
    } catch (err) {
      // Reading or handling the response itself failed. The server answered, so this is
      // still not an offline case and is reported rather than queued.
      setNotice({ tone: 'error', text: getErrorMessage(err, 'The prescription was not saved.') });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Queue a prescription the server never saw.
   *
   * Reached only when apiFetch raised, which it does for a dropped connection or a timeout
   * and never for a response the server actually sent. A refusal must not arrive here.
   */
  async function queueOffline(cause: unknown) {
    if (!mayQueueAfterFailure(cause)) {
      // A raised error carrying a status came from the server, so it is a refusal and is
      // not ours to queue.
      setNotice({ tone: 'error', text: getErrorMessage(cause, 'The prescription was not saved.') });
      return;
    }
    if (!selectedDrug) return;

    try {
      const prescriptionId = generateId();
      const now = new Date().toISOString();
      await db.prescriptions.put({
        id: prescriptionId,
        clinicId,
        encounterId,
        drugId: selectedDrug.id,
        dosage,
        frequency,
        duration: duration || undefined,
        quantity: quantity ? parseInt(quantity, 10) : undefined,
        instructions: instructions || undefined,
        prescribedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: 'prescription',
        entityId: prescriptionId,
        operation: SYNC_OPERATION.UPSERT,
        payloadJson: {
          encounterId,
          drugId: selectedDrug.id,
          dosage,
          frequency,
          duration: duration || null,
          quantity: quantity ? parseInt(quantity, 10) : null,
          instructions: instructions || null,
          allergyReviewed: requiresPrescriptionAllergyAcknowledgement(allergyState)
            ? allergyAcknowledged
            : undefined,
          prescribedByUserId: userId,
        },
      });
      resetForm();
      setNotice({
        tone: 'success',
        text: 'Prescription saved on this device and pending sync.',
      });
      onSaved?.();
    } catch (offlineErr) {
      setNotice({ tone: 'error', text: getErrorMessage(offlineErr, 'Failed to save') });
    }
  }

  function resetForm() {
    setSelectedDrug(null);
    setDrugQuery('');
    setDosage('');
    setFrequency('');
    setDuration('');
    setQuantity('');
    setInstructions('');
    setAllergyAcknowledged(false);
    setFieldErrors({});
  }

  const acknowledgementRequired = requiresPrescriptionAllergyAcknowledgement(allergyState);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4 sm:p-5">
      <h3 className="text-base font-semibold">Add prescription</h3>
      {notice ? <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice> : null}

      <div className="space-y-2">
        <FieldLabel htmlFor="prescription-drug-search" required>
          Drug
        </FieldLabel>
        {selectedDrug ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{selectedDrug.name}</span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDrug(null)}>
              Change
            </Button>
          </div>
        ) : (
          <div>
            <Input
              id="prescription-drug-search"
              placeholder="Search drugs..."
              value={drugQuery}
              onChange={(e) => setDrugQuery(e.target.value)}
              {...fieldErrorProps(
                'prescription-drug-search',
                fieldErrors['prescription-drug-search'],
              )}
            />
            {drugs.length > 0 && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                {drugs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setSelectedDrug(d);
                        setDrugQuery('');
                        setDrugs([]);
                        clearFieldError('prescription-drug-search');
                      }}
                    >
                      {d.name}{' '}
                      {d.genericName && (
                        <span className="text-muted-foreground">({d.genericName})</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/*
          The drug is the one required field whose error had nowhere to go.

          `validate()` has always produced "Choose a drug from the clinic catalog.", and the three
          fields below have always rendered theirs, but this one was never displayed and the input
          never carried `aria-invalid`. Pressing the button with no drug chosen therefore did
          nothing visible: `focusFirstInvalid` moved the cursor here and said nothing, and a screen
          reader announced nothing at all. It is also the field most easily missed, because it is
          the only one that needs a search and a click rather than typing.

          Outside the conditional above, so it survives the input being replaced by the chosen
          drug's name.
        */}
        <FieldError
          id="prescription-drug-search"
          message={fieldErrors['prescription-drug-search']}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="prescription-dosage" required>
            Dosage (with unit, e.g. mg)
          </FieldLabel>
          <Input
            id="prescription-dosage"
            value={dosage}
            onChange={(e) => {
              setDosage(e.target.value);
              clearFieldError('prescription-dosage');
            }}
            placeholder="10 mg"
            required
            {...fieldErrorProps('prescription-dosage', fieldErrors['prescription-dosage'])}
          />
          <FieldError id="prescription-dosage" message={fieldErrors['prescription-dosage']} />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="prescription-frequency" required>
            Frequency (doses per day)
          </FieldLabel>
          <Input
            id="prescription-frequency"
            value={frequency}
            onChange={(e) => {
              setFrequency(e.target.value);
              clearFieldError('prescription-frequency');
            }}
            placeholder="twice daily"
            required
            {...fieldErrorProps('prescription-frequency', fieldErrors['prescription-frequency'])}
          />
          <FieldError id="prescription-frequency" message={fieldErrors['prescription-frequency']} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prescription-duration">Duration (days)</Label>
          <Input
            id="prescription-duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="30 days"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prescription-quantity">Quantity (units dispensed)</Label>
          <Input
            id="prescription-quantity"
            type="number"
            inputMode="numeric"
            min="1"
            value={quantity}
            placeholder="30"
            onChange={(e) => {
              setQuantity(e.target.value);
              clearFieldError('prescription-quantity');
            }}
            {...fieldErrorProps('prescription-quantity', fieldErrors['prescription-quantity'])}
          />
          <FieldError id="prescription-quantity" message={fieldErrors['prescription-quantity']} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="prescription-instructions">Instructions</Label>
        <Textarea
          id="prescription-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Additional instructions..."
        />
      </div>
      {acknowledgementRequired ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/10 p-3">
          <Checkbox
            id="prescription-allergy-acknowledgement"
            checked={allergyAcknowledged}
            onCheckedChange={(checked) => setAllergyAcknowledged(checked === true)}
            className="mt-0.5 h-5 w-5"
          />
          <Label
            htmlFor="prescription-allergy-acknowledgement"
            className="cursor-pointer text-sm leading-5"
          >
            I reviewed the patient&apos;s allergy status before prescribing.
          </Label>
        </div>
      ) : null}
      <FieldError
        id="prescription-allergy-acknowledgement"
        message={fieldErrors['prescription-allergy-acknowledgement']}
      />
      {/* Only `saving` disables this. A control that refuses to work without saying why is
          worse than one that explains the problem when pressed. */}
      <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Add prescription'}
      </Button>
    </div>
  );
}
