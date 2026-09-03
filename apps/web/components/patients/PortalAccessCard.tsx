'use client';

import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { Check, ClipboardCopy, Link2, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineNotice } from '@/components/ops/OpsShared';
import { explainFailure, getStatusVariant } from '@/lib/notification-delivery';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';
import {
  DEFAULT_PORTAL_INVITE_TTL_DAYS,
  PORTAL_INVITE_TTL_CHOICES,
  buildManualInviteInstructions,
  cancelPortalInvite,
  createPortalInvite,
  describeInviteContact,
  describeInviteDeliveryGap,
  describeInviteExpiry,
  describeInviteStatus,
  describePortalAccessStatus,
  formatInviteDate,
  resendPortalInvite,
  type PortalAccess,
  type PortalInvite,
} from '@/lib/portal-invite';
import type { GetToken } from '@/lib/api';

export interface PortalAccessCardProps {
  clinicId: string;
  patientId: string;
  patientCode: string;
  clinicName: string;
  patient: { email?: string | null; phoneE164?: string | null };
  portalAccess: PortalAccess;
  /**
   * Undefined until auth resolves, which is why the actions guard on it rather than
   * assuming a token is always to hand.
   */
  getToken: GetToken | undefined;
  /** Refetch the chart. The card owns no data of its own; the server is the truth. */
  onChanged: () => void;
  onNotify: (message: string) => void;
  onError: (message: string) => void;
  onLinkExistingAccount: () => void;
}

type BusyAction = 'create' | 'resend' | 'cancel' | null;

/**
 * Portal access for one chart: whether the patient can sign in, the invitation that is
 * waiting, and what to do when it did not reach them.
 *
 * Pulled out of the 1,400-line chart page rather than edited in place. None of this was
 * reachable by a test where it was, and the page was carrying six pieces of invite state
 * and three dialogs alongside everything else a chart does.
 */
export function PortalAccessCard({
  clinicId,
  patientId,
  patientCode,
  clinicName,
  patient,
  portalAccess,
  getToken,
  onChanged,
  onNotify,
  onError,
  onLinkExistingAccount,
}: PortalAccessCardProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PortalInvite | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ttlDays, setTtlDays] = useState<number>(DEFAULT_PORTAL_INVITE_TTL_DAYS);
  // Pinned when the dialog opens rather than read during render. Reading the clock while
  // rendering is impure, and it would also let the previewed date jump a day mid-edit if
  // the component happened to re-render across midnight.
  const [dialogOpenedAt, setDialogOpenedAt] = useState(() => Date.now());
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Scoped, so a cancel does not blank the chart someone is reading. The page-level
  // loading flag used to be set here, which swapped the whole record for a skeleton.
  const [busy, setBusy] = useState<BusyAction>(null);
  const [previousOpen, setPreviousOpen] = useState(false);

  const { state: copyState, copy } = useCopyToClipboard();

  const currentInvite = portalAccess.currentInvite ?? null;
  const accessState = describePortalAccessStatus(portalAccess.status);
  const expiry = useMemo(
    () => describeInviteExpiry(currentInvite?.expiresAt ?? null),
    [currentInvite?.expiresAt],
  );
  const deliveryGap = describeInviteDeliveryGap(
    currentInvite,
    portalAccess.emailChannel ?? { available: true, readiness: 'unknown', reason: null },
  );
  const manualInstructions = useMemo(
    () =>
      buildManualInviteInstructions({
        clinicName,
        patientCode,
        claimUrl: portalAccess.claimUrl ?? null,
        expiresAt: currentInvite?.expiresAt ?? null,
      }),
    [clinicName, patientCode, portalAccess.claimUrl, currentInvite?.expiresAt],
  );

  const mutationContext = useMemo(
    () => (getToken ? { clinicId, patientId, getToken } : null),
    [clinicId, patientId, getToken],
  );

  const run = useCallback(
    async (
      action: Exclude<BusyAction, null>,
      work: (context: NonNullable<typeof mutationContext>) => Promise<void>,
      done: string,
    ) => {
      if (!mutationContext) return false;
      setBusy(action);
      try {
        await work(mutationContext);
        onNotify(done);
        onChanged();
        return true;
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [mutationContext, onChanged, onError, onNotify],
  );

  const openInviteDialog = () => {
    setEmail(patient.email ?? '');
    setPhone(patient.phoneE164 ?? '');
    setTtlDays(DEFAULT_PORTAL_INVITE_TTL_DAYS);
    setDialogError(null);
    setDialogOpenedAt(Date.now());
    setInviteOpen(true);
  };

  const submitInvite = async () => {
    if (!mutationContext) return;
    setBusy('create');
    setDialogError(null);
    try {
      await createPortalInvite(mutationContext, {
        email: email || undefined,
        phoneE164: phone || undefined,
        ttlDays,
      });
      setInviteOpen(false);
      onNotify('Portal invite created.');
      onChanged();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const ok = await run(
      'cancel',
      (context) => cancelPortalInvite(context, cancelTarget.id),
      'Portal invite cancelled.',
    );
    if (ok) setCancelTarget(null);
  };

  /*
    Defaulted rather than trusted. The web app deploys to Vercel and the API to Render from
    the same commit but not in the same step, so there is a window where a browser holding
    the new bundle is talking to the old API. A chart that throws its error boundary during
    that window is a worse failure than a card that renders without a list it cannot get.
  */
  const previousInvites = portalAccess.previousInvites ?? [];
  const canResend = Boolean(currentInvite?.email) && !expiry.isExpired;

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Portal account</h2>
          <p className="text-sm text-muted-foreground">
            Link the patient to an existing app account, or stage an invitation they claim on first
            sign-in.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-4">
            {/*
              The status is said once. The old card printed the raw enum as both a heading
              and a badge beside it, so the same word appeared twice and the second carried
              nothing the first had not. The badge is the token; the sentence under it is
              what the reader actually needs.
            */}
            <p className="text-eyebrow text-muted-foreground">Portal status</p>
            <p className="mt-2">
              <Badge variant={accessState.variant} className="rounded-full text-sm">
                {accessState.label}
              </Badge>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{accessState.detail}</p>

            {portalAccess.status === 'LINKED' && portalAccess.linkedKeycloakSub ? (
              <p className="mt-3 break-all font-mono text-xs text-foreground/80">
                {portalAccess.linkedKeycloakSub}
              </p>
            ) : null}

            {currentInvite ? (
              <dl className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
                {/*
                  No status badge here. The live invite is pending by construction — it is
                  the one the API picked as current — so a badge reading "Waiting to be
                  claimed" under a status already reading "Invitation waiting" is the same
                  sentence twice. The countdown is the part that varies, and it is what
                  staff are actually checking: a date would make them work out today's
                  first.
                */}
                <div className="flex flex-wrap items-baseline gap-2">
                  <dt className="text-eyebrow text-muted-foreground">Expiry</dt>
                  <dd
                    className={
                      expiry.tone === 'neutral'
                        ? 'text-sm text-foreground'
                        : 'text-sm font-semibold text-warning-ink'
                    }
                    title={formatInviteDate(currentInvite.expiresAt)}
                  >
                    {expiry.label}
                  </dd>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <dt className="text-eyebrow text-muted-foreground">Sent to</dt>
                    <dd className="break-words text-foreground">
                      {describeInviteContact(currentInvite)}
                    </dd>
                  </div>
                  {currentInvite.createdByName ? (
                    <div className="min-w-0">
                      <dt className="text-eyebrow text-muted-foreground">Issued by</dt>
                      <dd className="break-words text-foreground">{currentInvite.createdByName}</dd>
                    </div>
                  ) : null}
                </div>

                {currentInvite.email ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <dt className="sr-only">Invitation email</dt>
                    <dd>
                      <Badge
                        variant={getStatusVariant(currentInvite.emailDelivery?.status ?? 'QUEUED')}
                        className="rounded-full"
                      >
                        {currentInvite.emailDelivery
                          ? `Invite email ${currentInvite.emailDelivery.status.toLowerCase()}`
                          : 'Invite email not sent'}
                      </Badge>
                    </dd>
                    {currentInvite.emailDelivery?.failureReason ? (
                      <dd className="text-xs text-destructive-ink">
                        {explainFailure(currentInvite.emailDelivery.failureReason)?.detail ?? ''}
                      </dd>
                    ) : null}
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>

          {/*
            The invitation is valid whether or not an email carried it. Three different
            situations produced the same silence here before: a phone-only invite, a server
            with no SMTP, and a send the mail server refused.
          */}
          {deliveryGap ? (
            <div className="space-y-3">
              <InlineNotice tone={deliveryGap.tone} live={false}>
                <span className="font-medium">{deliveryGap.title}</span>{' '}
                <span>{deliveryGap.detail}</span>
              </InlineNotice>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-eyebrow text-muted-foreground">Read this to the patient</p>
                <pre className="mt-2 whitespace-pre-wrap break-words font-body text-sm text-foreground">
                  {manualInstructions}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full rounded-lg"
                  onClick={() => void copy(manualInstructions)}
                >
                  {/* The label never changes: swapping it resizes the control and moves
                      what sits beside it. The icon and the live region carry the state. */}
                  {copyState === 'copied' ? (
                    <Check className="mr-2 h-4 w-4" aria-hidden />
                  ) : (
                    <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Copy instructions
                  <span aria-live="polite" className="sr-only">
                    {copyState === 'copied'
                      ? 'Instructions copied'
                      : copyState === 'failed'
                        ? 'Could not copy. Select the text and copy it manually.'
                        : ''}
                  </span>
                </Button>
                {copyState === 'failed' ? (
                  <p className="mt-2 text-xs text-destructive-ink">
                    This browser would not let the page copy. Select the text above and copy it
                    manually.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openInviteDialog}
              className="w-full cursor-pointer rounded-lg"
            >
              <UserPlus className="mr-2 h-4 w-4" aria-hidden />
              {currentInvite ? 'Replace invitation' : 'Create portal invite'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLinkExistingAccount}
              className="w-full cursor-pointer rounded-lg"
            >
              <Link2 className="mr-2 h-4 w-4" aria-hidden />
              Link existing app account
            </Button>
            {currentInvite && canResend ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy === 'resend' || !mutationContext}
                onClick={() =>
                  void run(
                    'resend',
                    (context) => resendPortalInvite(context, currentInvite.id),
                    // Never claims it arrived. The send is queued; the delivery badge says
                    // the rest.
                    'Invite email queued for resend.',
                  )
                }
                className="w-full cursor-pointer rounded-lg"
              >
                <Mail
                  className={`mr-2 h-4 w-4 ${busy === 'resend' ? 'animate-pulse' : ''}`}
                  aria-hidden
                />
                Resend invite email
                <span aria-live="polite" className="sr-only">
                  {busy === 'resend' ? 'Resending the invitation email' : ''}
                </span>
              </Button>
            ) : null}
            {currentInvite ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCancelTarget(currentInvite)}
                className="w-full cursor-pointer rounded-lg text-destructive hover:text-destructive"
              >
                Cancel invitation
              </Button>
            ) : null}
          </div>

          {/*
            Staff could previously see only pending and expired invites, and only the newest
            one, so "nobody ever invited them" and "someone cancelled it last week" looked
            identical from the chart. Collapsed by default because on most charts it is
            empty or irrelevant.
          */}
          {previousInvites.length > 0 ? (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                aria-expanded={previousOpen}
                aria-controls="portal-previous-invites"
                onClick={() => setPreviousOpen((open) => !open)}
                className="flex min-h-11 w-full items-center justify-between rounded-lg px-1 text-left text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                <span>
                  Previous invitations{' '}
                  <span className="text-muted-foreground">({previousInvites.length})</span>
                </span>
                <span aria-hidden className="text-muted-foreground">
                  {previousOpen ? '−' : '+'}
                </span>
              </button>
              {previousOpen ? (
                <ul id="portal-previous-invites" className="mt-2 space-y-2">
                  {previousInvites.map((invite) => {
                    const state = describeInviteStatus(invite.status);
                    const settledAt =
                      invite.claimedAt ?? invite.cancelledAt ?? invite.expiresAt ?? null;
                    return (
                      <li
                        key={invite.id}
                        className="rounded-lg border border-border bg-background p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={state.variant} className="rounded-full">
                            {state.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatInviteDate(settledAt)}
                          </span>
                        </div>
                        <p className="mt-2 break-words text-muted-foreground">
                          {describeInviteContact(invite)}
                        </p>
                        {invite.createdByName ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Issued by {invite.createdByName}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {currentInvite ? 'Replace portal invitation' : 'Create portal invite'}
            </DialogTitle>
            <DialogDescription className="leading-6">
              An invitation email goes to the address you enter, carrying the patient code and a
              link to sign in. A phone number alone stages the invitation without sending anything.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dialogError ? <InlineNotice tone="error">{dialogError}</InlineNotice> : null}
            {currentInvite ? (
              <InlineNotice tone="warning" live={false}>
                This replaces the invitation currently waiting for{' '}
                {describeInviteContact(currentInvite)}. The old one stops working immediately.
              </InlineNotice>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="portal-invite-email">Email</Label>
              <Input
                id="portal-invite-email"
                type="email"
                value={email}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
                placeholder="patient@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-invite-phone">Phone</Label>
              <Input
                id="portal-invite-phone"
                type="tel"
                value={phone}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setPhone(event.target.value)}
                placeholder="+233..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-invite-ttl">Valid for</Label>
              <Select
                value={String(ttlDays)}
                onValueChange={(value: string) => setTtlDays(Number(value))}
              >
                <SelectTrigger id="portal-invite-ttl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PORTAL_INVITE_TTL_CHOICES.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* The resolved date, because "14 days" is not what staff tell a patient. */}
              <p className="text-xs text-muted-foreground">
                Expires{' '}
                {formatInviteDate(
                  new Date(dialogOpenedAt + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
                )}
                . After that the patient cannot claim their record and you will need to send a new
                invitation.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitInvite()}
              disabled={busy === 'create'}
              className="cursor-pointer"
            >
              <ShieldCheck
                className={`mr-2 h-4 w-4 ${busy === 'create' ? 'animate-pulse' : ''}`}
                aria-hidden
              />
              {currentInvite ? 'Replace invitation' : 'Create invite'}
              <span aria-live="polite" className="sr-only">
                {busy === 'create' ? 'Saving the invitation' : ''}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Cancelling used to fire on the first click. It is not recoverable — the invitation
        stops working and the patient has to be sent a new one — so it takes the same
        confirmation shape as deactivating an account.
      */}
      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open: boolean) => !open && setCancelTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel this invitation?</DialogTitle>
            <DialogDescription className="leading-6">
              The patient will no longer be able to claim their record with it. If they have already
              been given the details, you will need to send a new invitation and tell them.
            </DialogDescription>
          </DialogHeader>
          {cancelTarget ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-foreground">{describeInviteContact(cancelTarget)}</p>
              <p className="mt-1 text-muted-foreground">
                Issued {formatInviteDate(cancelTarget.createdAt)}
                {cancelTarget.createdByName ? ` by ${cancelTarget.createdByName}` : ''}.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCancelTarget(null)}
              disabled={busy === 'cancel'}
            >
              Keep invitation
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmCancel()}
              disabled={busy === 'cancel'}
            >
              Cancel invitation
              <span aria-live="polite" className="sr-only">
                {busy === 'cancel' ? 'Cancelling the invitation' : ''}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
