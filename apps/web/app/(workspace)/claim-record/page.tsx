'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CircleAlert, MailQuestion, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/ops/OpsShared';

/*
  There is deliberately no RouteGuard here.

  This page serves a user who has an invitation but no linked patient record yet, so they may
  hold no clinic membership and no PATIENT role at all -- a permission guard would refuse
  precisely the people the page exists for. The API agrees: POST /patients/me/claim-record is
  behind JwtAuthGuard only. Protection is authentication plus SyncWithAuth, which redirects any
  authenticated user without a pending claim away from this route once bootstrap resolves.
*/
export default function ClaimRecordPage() {
  const router = useRouter();
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isLoading = bootstrapCtx?.isLoading ?? true;
  const bootstrapError = bootstrapCtx?.error ?? null;
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
        // readApiError rather than response.text(): the raw body can be an HTML error page or a
        // JSON envelope, and both used to land on screen verbatim.
        throw await readApiError(response);
      }

      setSuccess('Patient record claimed successfully. Loading your portal…');
      await bootstrapCtx?.refetch();
      router.replace('/portal');
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          'We could not claim this record. Check the patient code and date of birth against your clinic card.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const refreshInvitations = () => {
    void bootstrapCtx?.refetch();
  };

  return (
    <div className="bg-clinical-grid min-h-screen px-4 py-10 md:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Card className="overflow-hidden rounded-xl border-border bg-card shadow-sm">
          <CardContent className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="relative overflow-hidden px-6 py-8 md:px-10 md:py-10">
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
                {/*
                  The loading branch has to come first. Without it `pendingInvites` is [] while
                  bootstrap is still in flight, so the page told a patient who does have an
                  invitation that no invitation exists -- the one message guaranteed to make them
                  stop and call the clinic.
                */}
                {isLoading ? (
                  <div role="status" aria-live="polite" aria-busy="true">
                    <span className="sr-only">Looking for your clinic invitation</span>
                    <SectionSkeleton lines={3} />
                  </div>
                ) : bootstrapError ? (
                  <InlineErrorState
                    title="We couldn't check for your invitation"
                    description={bootstrapError}
                    onRetry={() => bootstrapCtx?.retry()}
                    retryLabel="Check again"
                  />
                ) : pendingInvites.length === 0 ? (
                  <EmptyState
                    icon={MailQuestion}
                    title="No pending invitation found"
                    description="This account has no patient invitation waiting. Ask clinic staff to create or refresh your portal invite from your patient record, then check again."
                    action={
                      <Button variant="outline" onClick={refreshInvitations}>
                        Check again
                      </Button>
                    }
                  />
                ) : (
                  <fieldset className="space-y-3">
                    <legend className="sr-only">Choose the clinic invitation to claim</legend>
                    {pendingInvites.map((invite) => {
                      const selected = invite.id === selectedInviteId;
                      return (
                        /*
                          A native radio, visually hidden, rather than a styled <button>. The
                          buttons carried the selection in colour alone, so a screen reader
                          announced four identical unlabelled controls. This gets correct
                          single-select semantics and arrow-key navigation for free.
                        */
                        <label
                          key={invite.id}
                          className={`block w-full cursor-pointer rounded-lg border p-4 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ${
                            selected
                              ? 'border-primary bg-primary/5'
                              : 'border-border/70 bg-card hover:border-primary/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name="pendingInvite"
                            value={invite.id}
                            checked={selected}
                            onChange={() => setSelectedInviteId(invite.id)}
                            className="sr-only"
                          />
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
                        </label>
                      );
                    })}
                  </fieldset>
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
                      {/* Both fields were placeholder-only, and the date field had no
                          accessible name at all. */}
                      <div className="space-y-1.5">
                        <Label htmlFor="claim-patient-code">Patient code</Label>
                        <Input
                          id="claim-patient-code"
                          value={patientCode}
                          onChange={(event) => setPatientCode(event.target.value)}
                          placeholder={selectedInvite.patientCode}
                          aria-describedby="claim-patient-code-hint"
                          autoComplete="off"
                        />
                        <p id="claim-patient-code-hint" className="text-xs text-muted-foreground">
                          Printed on your clinic card, above your name.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="claim-dob">Date of birth</Label>
                        <Input
                          id="claim-dob"
                          type="date"
                          value={dob}
                          onChange={(event) => setDob(event.target.value)}
                        />
                      </div>
                    </div>
                    {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
                    {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}
                    <Button
                      onClick={() => void handleSubmit()}
                      disabled={!selectedInviteId || !patientCode || !dob || submitting}
                    >
                      {submitting ? 'Claiming…' : 'Claim patient record'}
                    </Button>
                  </div>
                ) : null}

                {/*
                  Outside the invite branch on purpose. This sat inside it, so the one case that
                  needs a refresh -- no invitations showing yet -- was the one case with no way
                  to ask for one. It also called window.location.reload(), which threw away the
                  session check and every warm route to re-fetch a single object.
                */}
                {!isLoading && pendingInvites.length > 0 ? (
                  <Button
                    variant="outline"
                    onClick={refreshInvitations}
                    disabled={bootstrapCtx?.isRefreshing}
                  >
                    {bootstrapCtx?.isRefreshing ? 'Refreshing…' : 'Refresh invitations'}
                  </Button>
                ) : null}
              </CardContent>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
