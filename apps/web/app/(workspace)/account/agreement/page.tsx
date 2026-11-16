'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { STAFF_AGREEMENT, signatureMatchesName } from '@nkwapa/db/staff-agreement';
import { formatStaffDisplayName } from '@nkwapa/db/staff-name';
import { useKeycloak } from '@/app/KeycloakProvider';
import { ApiError, apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap, type WhoAmIResponse } from '@/lib/bootstrap-context';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError, FieldLabel, fieldErrorProps, focusField } from '@/components/ui/field';
import { FormActions } from '@/components/ui/form-actions';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/ui/toast';

const NAME_ID = 'agreement-signed-name';
const AGREE_ID = 'agreement-agreed';

const signedOn = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function AgreementText() {
  return (
    <ol className="border-y border-rule">
      {STAFF_AGREEMENT.sections.map((section, index) => (
        <li key={section.title} className="flex gap-3 border-t border-rule py-3 first:border-t-0">
          <span
            aria-hidden="true"
            className="w-5 shrink-0 text-sm tabular-nums text-muted-foreground"
          >
            {index + 1}.
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
            <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{section.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SignForm({
  bootstrap,
  onSigned,
}: {
  bootstrap: WhoAmIResponse;
  onSigned: () => Promise<void>;
}) {
  const getToken = useAuth();
  const { logout } = useKeycloak() ?? { logout: () => undefined };
  const [agreed, setAgreed] = useState(false);
  const [signedName, setSignedName] = useState('');
  const [errors, setErrors] = useState<{ agreed?: string; signedName?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const profile: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
  } = bootstrap.profile ?? {};
  const nameOnFile =
    profile.firstName && profile.lastName
      ? formatStaffDisplayName({
          firstName: profile.firstName,
          middleName: profile.middleName,
          lastName: profile.lastName,
        })
      : bootstrap.displayName;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!getToken) return;
    const next = {
      agreed: agreed ? undefined : 'Tick the box to confirm you have read and agree.',
      signedName: signatureMatchesName(signedName, profile)
        ? undefined
        : `Type your name as it appears on your account: ${nameOnFile}.`,
    };
    setErrors(next);
    setFailure(null);
    if (next.agreed) return focusField(AGREE_ID);
    if (next.signedName) return focusField(NAME_ID);
    setSaving(true);
    try {
      const response = await apiFetch('/auth/agreement', {
        method: 'POST',
        body: JSON.stringify({ version: STAFF_AGREEMENT.version, signedName, agreed: true }),
        getToken,
        skipClinicHeader: true,
      });
      if (!response.ok) throw await readApiError(response);
      showToast({
        title: 'Signed',
        description: 'Thank you. You can start work.',
        tone: 'success',
      });
      await onSigned();
    } catch (err) {
      const fieldError =
        err instanceof ApiError
          ? err.fieldErrors.find((entry) => entry.field === 'signedName')
          : null;
      if (fieldError) setErrors({ signedName: fieldError.message });
      else setFailure(getErrorMessage(err, 'Your signature could not be saved. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
      {failure ? <InlineNotice tone="error">{failure}</InlineNotice> : null}
      <div className="space-y-1">
        {/* The whole row is the target, so it is easy to hit on a phone. */}
        <label htmlFor={AGREE_ID} className="flex cursor-pointer items-start gap-3 py-2 text-sm">
          <Checkbox
            id={AGREE_ID}
            checked={agreed}
            disabled={saving}
            onCheckedChange={(value) => {
              setAgreed(value === true);
              setErrors((current) => ({ ...current, agreed: undefined }));
            }}
            className="mt-0.5 h-5 w-5"
            {...fieldErrorProps(AGREE_ID, errors.agreed)}
          />
          <span className="leading-6 text-foreground">
            I have read and understood this agreement, and I agree to follow it.
          </span>
        </label>
        <FieldError id={AGREE_ID} message={errors.agreed} />
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor={NAME_ID} required>
          Type your full name to sign
        </FieldLabel>
        <Input
          id={NAME_ID}
          value={signedName}
          disabled={saving}
          onChange={(event) => {
            setSignedName(event.target.value);
            setErrors((current) => ({ ...current, signedName: undefined }));
          }}
          autoComplete="name"
          autoCapitalize="words"
          spellCheck={false}
          maxLength={250}
          placeholder={nameOnFile}
          className="h-12 text-base md:text-base compact:max-w-sm"
          {...fieldErrorProps(NAME_ID, errors.signedName)}
        />
        <FieldError id={NAME_ID} message={errors.signedName} />
        <p className="text-xs leading-5 text-muted-foreground">
          Signing as {nameOnFile} on {signedOn(new Date().toISOString())}. Your signature is kept on
          record.
        </p>
      </div>
      <FormActions split>
        <Button type="button" variant="ghost" disabled={saving} onClick={logout}>
          I do not agree, sign me out
        </Button>
        <Button type="submit" loading={saving}>
          Sign and continue
        </Button>
      </FormActions>
      <p className="text-xs leading-5 text-muted-foreground">
        You cannot use Nkwapa without signing. If something here is unclear or you cannot agree to
        it, sign out and speak to your clinic lead.
      </p>
    </form>
  );
}

/*
  The confidentiality agreement (#330).

  Two jobs, like the name page. While whoami says AGREEMENT_REQUIRED this is a step that holds the
  account, rendered without the workspace around it; afterwards it is where the account page
  sends someone to re-read what they signed.

  No RouteGuard: it has to be reachable by exactly the people who cannot reach anything else yet.
  The API also refuses their other requests until they sign, so this page is not the boundary.
*/
export default function StaffAgreementPage() {
  const router = useRouter();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isRequired = bootstrap?.onboarding?.state === 'AGREEMENT_REQUIRED';
  const acceptedAt = bootstrap?.staffAgreement?.acceptedAt ?? null;

  if (!bootstrap) {
    return bootstrapCtx?.isLoading ? (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading your account</span>
        <SectionSkeleton lines={3} />
      </div>
    ) : (
      <InlineErrorState
        title="We couldn't load your account"
        description={bootstrapCtx?.error ?? 'Check your connection, then try again.'}
        onRetry={() => bootstrapCtx?.retry()}
        retryLabel="Try again"
      />
    );
  }

  if (isRequired) {
    return (
      <OnboardingFrame
        journey="staff"
        current="agreement"
        needsName={false}
        // Someone who has worked here before is not joining; they are being asked something new.
        eyebrow={bootstrap.welcomeTour?.completedVersion ? 'Before you continue' : undefined}
        title={STAFF_AGREEMENT.title}
        lede={STAFF_AGREEMENT.intro}
      >
        <AgreementText />
        <SignForm
          key={bootstrap.userId}
          bootstrap={bootstrap}
          onSigned={async () => {
            await bootstrapCtx?.refetch();
            router.replace('/dashboard');
          }}
        />
      </OnboardingFrame>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <AppPageHeader title={STAFF_AGREEMENT.title} description={STAFF_AGREEMENT.intro} />
      {acceptedAt ? (
        <InlineNotice tone="success" live={false}>
          You signed this agreement on {signedOn(acceptedAt)}.
        </InlineNotice>
      ) : null}
      <AgreementText />
    </div>
  );
}
