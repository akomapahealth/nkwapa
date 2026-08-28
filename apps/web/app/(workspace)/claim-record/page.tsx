'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CircleAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { InlineNotice } from '@/components/ops/OpsShared';

export default function ClaimRecordPage() {
  const router = useRouter();
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const pendingInvites = useMemo(() => bootstrap?.onboarding?.pendingInvites ?? [], [bootstrap]);
  const [selectedInviteId, setSelectedInviteId] = useState<string>('');
  const [patientCode, setPatientCode] = useState('');
  const [dob, setDob] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedInviteId && pendingInvites.length > 0) {
      setSelectedInviteId(pendingInvites[0].id);
    }
  }, [pendingInvites, selectedInviteId]);

  const selectedInvite = useMemo(
    () => pendingInvites.find((invite) => invite.id === selectedInviteId) ?? null,
    [pendingInvites, selectedInviteId],
  );

  const handleSubmit = async () => {
    if (!selectedInviteId || !getToken) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch('/patients/me/claim-record', {
        method: 'POST',
        body: JSON.stringify({
          inviteId: selectedInviteId,
          patientCode,
          dob,
        }),
        getToken,
        skipClinicHeader: true,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setSuccess('Patient record claimed successfully. Loading your portal…');
      await bootstrapCtx?.refetch();
      router.replace('/portal');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-clinical-grid px-4 py-10 md:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Card className="overflow-hidden rounded-[32px] border-border/70 bg-card/95 shadow-2xl shadow-black/5">
          <CardContent className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="relative overflow-hidden px-6 py-8 md:px-10 md:py-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_35%),radial-gradient(circle_at_bottom_right,hsl(var(--secondary)/0.12),transparent_32%)]" />
              <div className="relative space-y-6">
                <div className="space-y-3">
                  <p className="text-eyebrow text-primary">Patient onboarding</p>
                  <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                      Claim your existing patient record
                    </h1>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                      We found a clinic invitation for this account. Confirm the patient code and
                      date of birth on your clinic card so your portal opens the same chart staff
                      already use.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-background p-4">
                    <BadgeCheck className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-sm font-medium text-foreground">One chart, one code</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Your portal links to the same patient record created in clinic.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-sm font-medium text-foreground">Verified access</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      We verify both the staged contact and your patient record details before
                      linking.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <CircleAlert className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-sm font-medium text-foreground">Need help?</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      If the details do not match, clinic staff can relink access from your patient
                      chart.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="border-t border-border/70 bg-background/70 px-6 py-8 md:px-8 lg:border-l lg:border-t-0">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-2xl">Available invitations</CardTitle>
                <CardDescription>
                  Choose the clinic invitation that matches your patient card, then verify your
                  details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 px-0 pb-0">
                {pendingInvites.length === 0 ? (
                  <InlineNotice tone="info">
                    No pending patient invitation was found for this account. Ask clinic staff to
                    create or refresh your portal invite from the patient record.
                  </InlineNotice>
                ) : (
                  <div className="space-y-3">
                    {pendingInvites.map((invite) => {
                      const selected = invite.id === selectedInviteId;
                      return (
                        <button
                          key={invite.id}
                          type="button"
                          onClick={() => setSelectedInviteId(invite.id)}
                          className={`w-full rounded-lg border p-4 text-left transition-all ${
                            selected
                              ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                              : 'border-border/70 bg-card hover:border-primary/40'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">{invite.patientName}</p>
                            <Badge variant="secondary" className="rounded-full">
                              {invite.clinicName}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Patient code on file:{' '}
                            <span className="font-medium text-foreground">
                              {invite.patientCode}
                            </span>
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {invite.email ? <span>Email match: {invite.email}</span> : null}
                            {invite.phoneE164 ? <span>Phone match: {invite.phoneE164}</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedInvite ? (
                  <div className="space-y-4 rounded-lg border border-border/70 bg-card p-5">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Verify your record</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Enter the exact patient code and date of birth recorded in clinic for{' '}
                        {selectedInvite.patientName}.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <Input
                        value={patientCode}
                        onChange={(event) => setPatientCode(event.target.value)}
                        placeholder="Patient code"
                      />
                      <Input
                        type="date"
                        value={dob}
                        onChange={(event) => setDob(event.target.value)}
                      />
                    </div>
                    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
                    {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button
                        onClick={() => void handleSubmit()}
                        disabled={!selectedInviteId || !patientCode || !dob || submitting}
                      >
                        {submitting ? 'Claiming…' : 'Claim patient record'}
                      </Button>
                      <Button variant="outline" onClick={() => window.location.reload()}>
                        Refresh invitations
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
