'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import { CONSENT_TEXT_V1_EN } from '@/lib/consent-text';
import { db } from '@/lib/db';
import { enqueueOutboxMutation, SYNC_OPERATION } from '@/lib/outbox';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { InlineNotice } from '@/components/ops/OpsShared';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export default function ClinicConsentPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const patientId = params.patientId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;

  const [attested, setAttested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordedByUserId = bootstrap?.userId ?? '';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!attested) {
      setError('You must attest that the patient has been informed and has granted consent.');
      return;
    }

    if (!clinicId || !getToken) {
      return;
    }

    setLoading(true);
    setError(null);

    const consentId = generateId();
    const grantedAt = new Date().toISOString();

    try {
      const response = await apiFetch(
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

      if (response.ok) {
        router.push(`/clinics/${clinicId}/patients/${patientId}`);
        return;
      }

      const errorText = await response.text();
      setError(errorText || 'Failed to record consent');
      setLoading(false);
      return;
    } catch {
      // Network error; fall through to offline save.
    }

    try {
      await db.patient_consents.put({
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
      });

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

      router.push(`/clinics/${clinicId}/patients/${patientId}`);
      return;
    } catch (offlineError) {
      setError(
        offlineError instanceof Error ? offlineError.message : 'Failed to save consent offline',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="w-fit rounded-2xl">
        <Link href={`/clinics/${clinicId}/patients/${patientId}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to Patient
        </Link>
      </Button>

      <AppPageHeader
        eyebrow="Research consent"
        title="Record Research Consent"
        description="Document informed consent for de-identified research participation with an auditable, clinic-scoped workflow."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AppMetricCard
          title="Consent type"
          value="De-identified"
          icon={ShieldCheck}
          detail="This flow records approval for de-identified research use only."
        />
        <AppMetricCard
          title="Workflow"
          value="Attested"
          icon={UserCheck}
          detail="A staff attestation is required before consent can be recorded."
        />
        <AppMetricCard
          title="Document"
          value="v1-en"
          icon={FileText}
          detail="The current English consent text is captured with the audit record."
        />
      </div>

      <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
        <CardHeader>
          <CardTitle className="text-xl">Consent text</CardTitle>
          <CardDescription>
            Review the current consent language exactly as it will be stored with the record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-3xl border border-border/80 bg-muted/35 p-5 text-sm leading-7 text-foreground whitespace-pre-wrap">
            {CONSENT_TEXT_V1_EN}
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-3xl rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
        <CardHeader>
          <CardTitle className="text-xl">Confirm and record</CardTitle>
          <CardDescription>
            Confirm that the patient was informed and granted consent before saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

            <div className="flex items-start gap-3 rounded-3xl border border-border/80 bg-background/75 p-4">
              <Checkbox
                id="clinicConsentAttested"
                checked={attested}
                onCheckedChange={(checked) => setAttested(checked === true)}
                className="mt-1"
              />
              <div className="space-y-2">
                <Label
                  htmlFor="clinicConsentAttested"
                  className="cursor-pointer text-sm font-medium text-foreground"
                >
                  I attest that the patient has been informed and has granted consent.
                </Label>
                <p className="text-sm text-muted-foreground">
                  This confirmation is stored as part of the research consent audit trail.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading || !attested} className="rounded-2xl">
                {loading ? 'Recording...' : 'Record Consent'}
              </Button>
              <Button variant="outline" asChild className="rounded-2xl">
                <Link href={`/clinics/${clinicId}/patients/${patientId}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
