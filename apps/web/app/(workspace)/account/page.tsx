'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Mail, Phone, Settings, UserPen } from 'lucide-react';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { NotificationsCard } from '@/components/account/NotificationsCard';
import { YourDataCard } from '@/components/account/YourDataCard';
import { StaffNameForm } from '@/components/account/StaffNameForm';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { avatarToneProps } from '@/lib/avatar-tone';
import { Button } from '@/components/ui/button';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { FormActions } from '@/components/ui/form-actions';
import { FieldError, fieldErrorProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showToast } from '@/components/ui/toast';
import {
  toStaffNameInput,
  updateMyName,
  updateMyPhone,
  type StaffNameInput,
} from '@/lib/account-name';
import { ApiError, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap, type WhoAmIResponse } from '@/lib/bootstrap-context';
import { formatRoleLabel } from '@/lib/ops';
import { welcomeTourAudience } from '@/lib/welcome-tour';

/*
  Profile: what a person may change about themselves, and what they can only see.

  Only harmless, self-describing fields are editable. The sign-in email is the Keycloak login and
  roles are granted by an administrator, so both are shown read-only with who changes them. A
  patient's name and phone live on their Patient record, which the clinic keeps.
*/
export default function AccountPage() {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isStaff = bootstrap != null && welcomeTourAudience(bootstrap) === 'staff';

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Profile"
        description="How you appear to colleagues, and how Nkwapa reaches you."
        actions={
          <Button asChild variant="outline">
            <Link href="/settings">
              <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
              Device settings
            </Link>
          </Button>
        }
      />

      {bootstrapCtx?.isLoading && !bootstrap ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading your profile</span>
          <SectionSkeleton lines={4} />
        </div>
      ) : !bootstrap ? (
        <InlineErrorState
          title="We couldn't load your profile"
          description={bootstrapCtx?.error ?? 'Check your connection, then try again.'}
          onRetry={() => bootstrapCtx?.retry()}
          retryLabel="Try again"
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <IdentityCard bootstrap={bootstrap} />
          <div className="min-w-0 space-y-6">
            {isStaff ? (
              <>
                <NameCard bootstrap={bootstrap} />
                <PhoneCard key={bootstrap.userId} bootstrap={bootstrap} />
              </>
            ) : (
              <>
                <RecordSection>
                  <RecordSectionHeader>
                    <RecordSectionTitle>Your details</RecordSectionTitle>
                    <RecordSectionDescription>
                      Your name, phone and date of birth are on your clinic record. To correct them,
                      send a request below or ask at your next visit.
                    </RecordSectionDescription>
                  </RecordSectionHeader>
                </RecordSection>
                <YourDataCard />
              </>
            )}
            {/* Staff hear about messages and work; patients about appointment replies (#250). */}
            <NotificationsCard audience={isStaff ? 'staff' : 'patient'} />
          </div>
        </div>
      )}
    </div>
  );
}

function initialsOf(name: string | undefined) {
  return (
    name
      ?.split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function IdentityCard({ bootstrap }: { bootstrap: WhoAmIResponse }) {
  const email = bootstrap.profile?.email ?? null;
  const globalRoles = bootstrap.globalRoles ?? [];
  return (
    <RecordSection>
      <RecordSectionContent className="space-y-5 pt-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback
              {...avatarToneProps(bootstrap.displayName)}
              className="text-sm font-semibold"
            >
              {initialsOf(bootstrap.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-heading text-lg font-semibold text-foreground [overflow-wrap:anywhere]">
              {bootstrap.displayName}
            </p>
            {email ? (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                {/* 3px centres the 14px icon on the first 20px line when the email wraps. */}
                <Mail className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          You sign in with this email. Only an administrator can change it.
        </p>

        <section aria-labelledby="profile-access" className="space-y-2">
          <h2 id="profile-access" className="text-eyebrow text-muted-foreground">
            Your access
          </h2>
          <ul className="divide-y divide-rule border-y border-rule">
            {globalRoles.map((role) => (
              <li key={role} className="py-2.5 text-sm">
                <p className="font-medium text-foreground">{formatRoleLabel(role)}</p>
                <p className="text-xs text-muted-foreground">Every clinic</p>
              </li>
            ))}
            {bootstrap.memberships.map((membership) => (
              <li key={membership.clinicId} className="flex gap-2.5 py-2.5 text-sm">
                <Building2
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-medium text-foreground [overflow-wrap:anywhere]">
                    {membership.clinicName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {membership.roles.map(formatRoleLabel).join(', ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-5 text-muted-foreground">
            Roles are granted by a clinic administrator.
          </p>
        </section>
      </RecordSectionContent>
    </RecordSection>
  );
}

function NameCard({ bootstrap }: { bootstrap: WhoAmIResponse }) {
  const getToken = useAuth();
  const refetch = useBootstrap()?.refetch;

  const save = async (value: StaffNameInput) => {
    if (!getToken) return;
    await updateMyName(value, getToken);
    showToast({ title: 'Saved', description: 'Your name is updated.', tone: 'success' });
    // The header, station boards and staff lists all read the name from bootstrap.
    await refetch?.();
  };

  return (
    <RecordSection>
      <RecordSectionHeader>
        <RecordSectionTitle className="flex items-center gap-2">
          <UserPen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Name
        </RecordSectionTitle>
        <RecordSectionDescription>
          Shown on the records you work on, so colleagues and auditors can see who did what.
        </RecordSectionDescription>
      </RecordSectionHeader>
      <RecordSectionContent>
        <StaffNameForm
          key={bootstrap.userId}
          idPrefix="profile-name"
          initial={toStaffNameInput(bootstrap.profile)}
          email={bootstrap.profile?.email}
          onSubmit={save}
          autoFocus={false}
        />
      </RecordSectionContent>
    </RecordSection>
  );
}

function PhoneCard({ bootstrap }: { bootstrap: WhoAmIResponse }) {
  const getToken = useAuth();
  const refetch = useBootstrap()?.refetch;
  const saved = bootstrap.profile?.phoneE164 ?? '';
  const [phone, setPhone] = useState(saved);
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const id = 'profile-phone';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!getToken) return;
    setSaving(true);
    setError(undefined);
    setFailure(null);
    try {
      const result = await updateMyPhone(phone, getToken);
      setPhone(result.phoneE164 ?? '');
      showToast({
        title: 'Saved',
        description: result.phoneE164
          ? 'Your work phone is updated.'
          : 'Your work phone is removed.',
        tone: 'success',
      });
      await refetch?.();
    } catch (err) {
      const fieldError =
        err instanceof ApiError ? err.fieldErrors.find((entry) => entry.field === 'phone') : null;
      if (fieldError) setError(fieldError.message);
      else setFailure(getErrorMessage(err, 'Your phone could not be saved. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <RecordSection>
      <RecordSectionHeader>
        <RecordSectionTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Work phone
        </RecordSectionTitle>
        <RecordSectionDescription>
          Optional. A number your clinic team can reach you on. Patients never see it.
        </RecordSectionDescription>
      </RecordSectionHeader>
      <RecordSectionContent>
        <form noValidate onSubmit={(event) => void submit(event)} className="space-y-3">
          {failure ? <InlineNotice tone="error">{failure}</InlineNotice> : null}
          <div className="space-y-2">
            <Label htmlFor={id}>Phone number</Label>
            <Input
              id={id}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="024 123 4567"
              maxLength={32}
              value={phone}
              disabled={saving}
              onChange={(event) => {
                setPhone(event.target.value);
                setError(undefined);
              }}
              className="compact:max-w-xs"
              {...fieldErrorProps(id, error)}
            />
            <FieldError id={id} message={error} />
          </div>
          <FormActions>
            <Button
              type="submit"
              variant="outline"
              disabled={saving || phone.trim() === saved}
              aria-busy={saving}
            >
              {saving ? 'Saving…' : phone.trim() ? 'Save phone' : 'Remove phone'}
            </Button>
          </FormActions>
        </form>
      </RecordSectionContent>
    </RecordSection>
  );
}
