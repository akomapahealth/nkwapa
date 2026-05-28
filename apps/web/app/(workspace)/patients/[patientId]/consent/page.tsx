'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { CONSENT_TEXT_V1_EN } from '@/lib/consent-text';
import { db } from '@/lib/db';
import { enqueueOutboxMutation, SYNC_OPERATION } from '@/lib/outbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

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

export default function ConsentPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.patientId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const recordedByUserId = bootstrap?.userId ?? '';

  const [attested, setAttested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attested) {
      setError('You must attest that the patient has been informed and has granted consent.');
      return;
    }
    if (!clinicId || !getToken) return;
    setLoading(true);
    setError(null);

    const consentId = generateId();
    const grantedAt = new Date().toISOString();

    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/consents`,
        {
          method: 'POST',
          body: JSON.stringify({
            consentType: 'RESEARCH_DEIDENTIFIED',
            consentTextSnapshot: CONSENT_TEXT_V1_EN,
            consentVersion: 'v1-en',
          }),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (res.ok) {
        router.push(`/patients/${patientId}`);
        return;
      }
      const errText = await res.text();
      setError(errText || 'Failed to record consent');
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
        consentType: 'RESEARCH_DEIDENTIFIED',
        status: 'GRANTED',
        consentVersion: 'v1-en',
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
        entityType: 'patient_consent',
        entityId: consentId,
        operation: SYNC_OPERATION.UPSERT,
        payloadJson: {
          patientId,
          clinicId,
          consentType: 'RESEARCH_DEIDENTIFIED',
          status: 'GRANTED',
          consentVersion: 'v1-en',
          consentTextSnapshot: CONSENT_TEXT_V1_EN,
          grantedAt,
          revokedAt: null,
          recordedByUserId: recordedByUserId || undefined,
        },
      });
      router.push(`/patients/${patientId}`);
      return;
    } catch (offlineErr) {
      setError(offlineErr instanceof Error ? offlineErr.message : 'Failed to save consent offline');
    }

    setLoading(false);
  };

  if (!clinicId) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Select a clinic to record consent.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" asChild>
        <Link href={`/patients/${patientId}`}>← Back to Patient</Link>
      </Button>

      <h1 className="text-2xl font-bold font-heading">Record Research Consent</h1>

      <div className="rounded-lg border bg-muted/30 p-4 whitespace-pre-wrap text-sm leading-relaxed">
        {CONSENT_TEXT_V1_EN}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="flex items-start gap-2">
          <Checkbox
            id="attested"
            checked={attested}
            onCheckedChange={(v) => setAttested(v === true)}
          />
          <Label
            htmlFor="attested"
            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            I attest that the patient has been informed and has granted consent.
          </Label>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={loading || !attested}>
            {loading ? 'Recording…' : 'Record Consent'}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/patients/${patientId}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
