'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, MailQuestion } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { ApiError, apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/ops/OpsShared';
import { describeInviteExpiry } from '@/lib/portal-invite';
import { AUTH_CONTINUE_PARAM } from '@/lib/auth-routing';

/**
 * A refusal split into what happened and what to do about it.
 *
 * The API now sends both. Concatenating them into one sentence, which is what `getErrorMessage`
 * does, buries the only part the patient can act on at the end of a line they have already
 * decided is bad news.
 */
interface ClaimFailure {
  message: string;
  recoveryAction: string | null;
}

function toClaimFailure(error: unknown): ClaimFailure {
  if (error instanceof ApiError) {
    return { message: error.message, recoveryAction: error.recoveryAction };
  }
  return {
    message: getErrorMessage(
      error,
      'We could not claim this record. Check the patient code and date of birth against your clinic card.',
    ),
    recoveryAction: null,
  };
}

/** Null when there is no expiry to report, so the caller renders nothing at all. */
function inviteExpiry(expiresAt: string | null) {
  if (!expiresAt) return null;
  const described = describeInviteExpiry(expiresAt);
  return described.label === 'No expiry set' ? null : described;
}

/*
  Where the patient is in a journey that spans two systems.

  Setting a password happens in Keycloak and claiming the record happens here, so a patient
  arriving on this page has already done something they cannot see any record of. Showing
  the completed step is what makes this read as the last stage of one process rather than a
  second, unexplained form.
*/
const CLAIM_STEPS = [
  { label: 'Account created', detail: 'Your password is set' },
  { label: 'Confirm your details', detail: 'Patient code and date of birth' },
  { label: 'Open your record', detail: 'Your care summary and appointments' },
] as const;

function ClaimProgress({ currentStep }: { currentStep: number }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-3" aria-label="Setting up your patient access">
      {CLAIM_STEPS.map((step, index) => {
        const isComplete = index < currentStep;
        const isCurrent = index === currentStep;
        return (
          <li
            key={step.label}
            className={`rounded-lg border p-4 ${
              isCurrent ? 'border-primary bg-primary/5' : 'border-border bg-background'
            }`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isComplete
                    ? 'bg-success text-background'
                    : isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {/*
                  The tick is decorative; the state is already in the text below it, so a
                  screen reader that announced both would say everything twice.
                */}
                {isComplete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <p className="text-sm font-medium text-foreground">{step.label}</p>
            </div>
            <p className="mt-1 pl-8 text-xs leading-5 text-muted-foreground">
              {isComplete ? `${step.detail} \u2014 done` : step.detail}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

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
  const searchParams = useSearchParams();
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
  const [error, setError] = useState<ClaimFailure | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /*
    Set only on the redirect Keycloak sends them back on, so it greets the patient who has
    just chosen a password and stays quiet for someone who reached this page any other way.
  */
  const arrivedFromAccountSetup = searchParams.get(AUTH_CONTINUE_PARAM) === '1';
  const currentStep = success ? 2 : 1;

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
      setError(toClaimFailure(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const refreshInvitations = () => {
    void bootstrapCtx?.refetch();
  };

  return (
    /*
      This route renders outside both shells on purpose -- a claimant holds no clinic and no roles,
      so neither AppLayout nor PortalLayout applies to it. The landmark and the skip link came with
      those shells, which left the one page a patient works through alone as the only route in the
      product with no `main` element and nothing to skip the header with. Both are restored here
      rather than by wrapping the page in a shell it does not belong in.
    */
    <div className="bg-clinical-grid min-h-screen px-4 py-10 md:px-6">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to main content
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-5xl flex-col gap-6 focus-visible:outline-none"
      >
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
                    {/*
                      Two ledes, because the reader is in one of two situations. Someone who
                      has just set a password needs to be told this is the last step, not
                      handed a fresh-looking form with no acknowledgement of what they did.
                    */}
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                      {arrivedFromAccountSetup
                        ? 'Your account is ready. One last step: confirm the patient code and date of birth on your clinic card, and your record opens.'
                        : 'We found a clinic invitation for this account. Confirm the patient code and date of birth on your clinic card so your portal opens the same chart staff already use.'}
                    </p>
                  </div>
                </div>

                <ClaimProgress currentStep={currentStep} />

                <p className="text-xs leading-5 text-muted-foreground">
                  Your portal opens the same record your clinic already uses. If the details below
                  do not match, clinic staff can relink access from your patient chart.
                </p>
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
                {arrivedFromAccountSetup && !success ? (
                  <InlineNotice tone="success">
                    <span className="font-medium">Password saved.</span> You are signed in. Confirm
                    the details below to finish linking your record.
                  </InlineNotice>
                ) : null}

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
                  /*
                    An invitation is matched against the email address Keycloak has
                    confirmed, so the commonest reason for landing here is a verification
                    step that was never finished -- not a missing invitation. Sending every
                    such patient to ring the clinic is what made this a dead end.
                  */
                  <EmptyState
                    icon={MailQuestion}
                    title="No pending invitation found"
                    description="If you have just set up your account, check your inbox for a message asking you to confirm your email address. Your invitation only appears here once that is done. If you have already confirmed it, ask clinic staff to resend your invitation, then check again."
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
                          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {invite.email ? <span>Email match: {invite.email}</span> : null}
                            {invite.phoneE164 ? <span>Phone match: {invite.phoneE164}</span> : null}
                          </div>
                          {/*
                            An invitation stops working on its expiry date, and until now
                            the only place that said so was the email — which the patient
                            may no longer have open. Expired invitations never reach this
                            list, so every countdown shown here is still claimable.
                          */}
                          {inviteExpiry(invite.expiresAt) ? (
                            <p
                              className={`mt-2 text-xs ${
                                inviteExpiry(invite.expiresAt)?.tone === 'neutral'
                                  ? 'text-muted-foreground'
                                  : 'font-medium text-warning-ink'
                              }`}
                            >
                              {inviteExpiry(invite.expiresAt)?.label}
                            </p>
                          ) : null}
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
                    {error ? (
                      <InlineNotice tone="error">
                        <span className="block font-medium">{error.message}</span>
                        {/*
                          The next step, on its own line. Every refusal the API raises names one,
                          and it is the only part of a refusal a patient can act on.
                        */}
                        {error.recoveryAction ? (
                          <span className="mt-1 block text-xs leading-5">
                            {error.recoveryAction}
                          </span>
                        ) : null}
                      </InlineNotice>
                    ) : null}
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
      </main>
    </div>
  );
}
