'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { ApiError, apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormActions } from '@/components/ui/form-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InvitationNotFound, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
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
  const pendingInvites = useMemo(() => {
    const onboarding = bootstrap?.onboarding;
    return onboarding?.state === 'PATIENT_CLAIM_REQUIRED' ? onboarding.pendingInvites : [];
  }, [bootstrap]);
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
      Outside both shells on purpose: a claimant holds no clinic and no roles. OnboardingFrame
      supplies the landmark, skip link and way out those shells would have.
    */
    <OnboardingFrame
      journey="patient"
      current={success ? 'record' : 'claim'}
      title="Claim your existing patient record"
      lede={
        /*
          Two ledes, because the reader is in one of two situations. Someone who has just set a
          password needs to be told this is the last step, not handed a fresh-looking form.
        */
        arrivedFromAccountSetup
          ? 'Your account is ready. One last step: confirm the patient code and date of birth on your clinic card, and your record opens.'
          : 'We found a clinic invitation for this account. Confirm the patient code and date of birth on your clinic card so your portal opens the same chart staff already use.'
      }
    >
      {arrivedFromAccountSetup && !success ? (
        <InlineNotice tone="success">
          <span className="font-medium">Password saved.</span> You are signed in. Confirm the
          details below to finish linking your record.
        </InlineNotice>
      ) : null}

      {/*
        The loading branch has to come first. Without it `pendingInvites` is [] while bootstrap is
        still in flight, so the page told a patient who does have an invitation that none exists.
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
        <InvitationNotFound
          journey="patient"
          onCheckAgain={refreshInvitations}
          checking={bootstrapCtx?.isRefreshing}
        />
      ) : (
        <section aria-labelledby="claim-invites-title" className="border-t-2 border-rule-strong">
          <h2 id="claim-invites-title" className="type-section-title pb-1 pt-4">
            {pendingInvites.length > 1 ? 'Choose your invitation' : 'Your invitation'}
          </h2>
          <fieldset>
            <legend className="sr-only">Choose the clinic invitation to claim</legend>
            {pendingInvites.map((invite) => {
              const selected = invite.id === selectedInviteId;
              const expiry = inviteExpiry(invite.expiresAt);
              return (
                /*
                  A native radio, visible, so the selection shows as a filled circle and not by
                  colour alone. The whole row is the label, which makes it the touch target.
                */
                <label
                  key={invite.id}
                  className={`flex cursor-pointer gap-3 border-t border-rule px-2 py-3 transition-colors duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                    selected ? 'bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="pendingInvite"
                    value={invite.id}
                    checked={selected}
                    onChange={() => setSelectedInviteId(invite.id)}
                    className="mt-1 h-5 w-5 shrink-0 accent-primary focus-visible:outline-none"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="block font-semibold text-foreground">
                      {invite.patientName}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {invite.clinicName}. Patient code on file:{' '}
                      <span className="font-medium tabular-nums text-foreground">
                        {invite.patientCode}
                      </span>
                    </span>
                    {invite.email || invite.phoneE164 ? (
                      <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {invite.email ? <span>Email match: {invite.email}</span> : null}
                        {invite.phoneE164 ? <span>Phone match: {invite.phoneE164}</span> : null}
                      </span>
                    ) : null}
                    {/*
                      Expired invitations never reach this list, so every countdown shown here is
                      still claimable. The email may be long closed; this is the reminder.
                    */}
                    {expiry ? (
                      <span
                        className={`block text-xs ${
                          expiry.tone === 'neutral'
                            ? 'text-muted-foreground'
                            : 'font-medium text-warning-ink'
                        }`}
                      >
                        {expiry.label}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </section>
      )}

      {selectedInvite ? (
        <section aria-labelledby="claim-verify-title" className="border-t-2 border-rule-strong">
          <div className="space-y-1 pb-3 pt-4">
            <h2 id="claim-verify-title" className="type-section-title">
              Verify your record
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Enter the exact patient code and date of birth recorded in clinic for{' '}
              {selectedInvite.patientName}.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
                autoComplete="bday"
                value={dob}
                onChange={(event) => setDob(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 space-y-4">
            {error ? (
              <InlineNotice tone="error">
                <span className="block font-medium">{error.message}</span>
                {/* The next step, on its own line: the only part of a refusal a patient can act on. */}
                {error.recoveryAction ? (
                  <span className="mt-1 block text-xs leading-5">{error.recoveryAction}</span>
                ) : null}
              </InlineNotice>
            ) : null}
            {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}
            <FormActions>
              {/*
                Outside the invite branch's list on purpose, and a refetch, not a page reload,
                which threw away the session check to re-fetch a single object.
              */}
              <Button
                variant="outline"
                onClick={refreshInvitations}
                disabled={bootstrapCtx?.isRefreshing}
              >
                {bootstrapCtx?.isRefreshing ? 'Refreshing…' : 'Refresh invitations'}
              </Button>
              <Button
                onClick={() => void handleSubmit()}
                disabled={!selectedInviteId || !patientCode || !dob || submitting}
              >
                {submitting ? 'Claiming…' : 'Claim patient record'}
              </Button>
            </FormActions>
          </div>
        </section>
      ) : null}

      <p className="border-t border-rule pt-4 text-xs leading-5 text-muted-foreground">
        Your portal opens the same record your clinic already uses. If the details do not match,
        clinic staff can relink access from your patient chart.
      </p>
    </OnboardingFrame>
  );
}
