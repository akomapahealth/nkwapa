'use client';

import { useCallback, useEffect, useState } from 'react';
import { MailPlus, RotateCw, UserPlus, X } from 'lucide-react';
import { ApiError, getErrorMessage, type GetToken } from '@/lib/api';
import { describeInviteExpiry, formatInviteDate } from '@/lib/portal-invite';
import { getStatusVariant } from '@/lib/notification-delivery';
import {
  ADDRESS_IN_USE_CODE,
  DEFAULT_STAFF_INVITE_TTL_HOURS,
  STAFF_INVITE_TTL_CHOICES,
  cancelStaffInvite,
  createStaffInvite,
  describeStaffInviteIdentity,
  describeStaffInviteStatus,
  formatStaffRole,
  listStaffInvites,
  resendStaffInvite,
  type StaffInvite,
  type StaffInviteRole,
} from '@/lib/staff-invite';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineNotice } from '@/components/ops/OpsShared';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';

export interface StaffInvitesCardProps {
  clinicId: string;
  clinicName: string | null;
  getToken: GetToken | undefined;
  /** Called after an invitation changes, so the roster can refresh if someone just accepted. */
  onChanged?: () => void;
}

type Busy = { inviteId: string; action: 'resend' | 'cancel' } | null;

function describeFailure(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback);
}

/**
 * Staff invitations for one clinic: send, resend, cancel, and the history.
 *
 * Every invitation stays in the list, cancelled and expired ones included, as on the patient chart.
 * Hiding them would make a lapsed invitation indistinguishable from one that was never sent.
 */
export function StaffInvitesCard({
  clinicId,
  clinicName,
  getToken,
  onChanged,
}: StaffInvitesCardProps) {
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [invitableRoles, setInvitableRoles] = useState<StaffInviteRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffInviteRole>('VOLUNTEER');
  const [ttlHours, setTtlHours] = useState<number>(DEFAULT_STAFF_INVITE_TTL_HOURS);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Set when the API says the address already belongs to a staff account.
  const [confirmReuse, setConfirmReuse] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken) return;
    setLoadError(null);
    try {
      const result = await listStaffInvites(clinicId, getToken);
      setInvites(result.items);
      setInvitableRoles(result.invitableRoles);
    } catch (error) {
      setLoadError(describeFailure(error, 'Invitations could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const openDialog = () => {
    setEmail('');
    setRole(
      invitableRoles.includes('VOLUNTEER') ? 'VOLUNTEER' : (invitableRoles[0] ?? 'VOLUNTEER'),
    );
    setTtlHours(DEFAULT_STAFF_INVITE_TTL_HOURS);
    setDialogError(null);
    setConfirmReuse(null);
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!getToken) return;
    setSubmitting(true);
    setDialogError(null);
    try {
      const created = await createStaffInvite(clinicId, getToken, {
        email: email.trim(),
        role,
        ttlHours,
        ...(confirmReuse ? { confirmExistingAccount: true } : {}),
      });
      setDialogOpen(false);
      setNotice(`Invitation sent to ${created.email} as ${formatStaffRole(created.role)}.`);
      await load();
      onChanged?.();
    } catch (error) {
      if (error instanceof ApiError && error.code === ADDRESS_IN_USE_CODE) {
        // Not a dead end: the inviter is told, and confirms if that is the person they mean.
        setConfirmReuse([error.message, error.recoveryAction].filter(Boolean).join(' '));
      } else {
        setDialogError(describeFailure(error, 'The invitation could not be sent.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (invite: StaffInvite, action: 'resend' | 'cancel') => {
    if (!getToken) return;
    setBusy({ inviteId: invite.id, action });
    setActionError(null);
    try {
      if (action === 'resend') {
        await resendStaffInvite(clinicId, invite.id, getToken);
        setNotice(`Invitation to ${invite.email} sent again.`);
      } else {
        await cancelStaffInvite(clinicId, invite.id, getToken);
        setNotice(`Invitation to ${invite.email} cancelled. The link no longer grants access.`);
      }
      await load();
      onChanged?.();
    } catch (error) {
      setActionError(
        describeFailure(
          error,
          `The invitation could not be ${action === 'resend' ? 'resent' : 'cancelled'}.`,
        ),
      );
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-xl">
            <MailPlus className="h-5 w-5 text-primary" aria-hidden="true" />
            Staff invitations
          </CardTitle>
          <CardDescription>
            Invite a colleague to {clinicName ?? 'this clinic'} by email. They set their own
            password and get the role only once they accept.
          </CardDescription>
        </div>
        <Button onClick={openDialog} disabled={!getToken || invitableRoles.length === 0}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          Invite a colleague
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
        {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}

        {loading ? (
          <SectionSkeleton lines={3} />
        ) : loadError ? (
          <InlineErrorState
            title="Invitations could not be loaded"
            description={loadError}
            onRetry={() => void load()}
          />
        ) : invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invitations have been sent for this clinic yet.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Staff invitations">
            {invites.map((invite) => {
              const status = describeStaffInviteStatus(invite.status);
              const isOpen = invite.status === 'PENDING';
              const identity = isOpen ? describeStaffInviteIdentity(invite.identity) : null;
              const expiry = describeInviteExpiry(invite.expiresAt);
              return (
                <li
                  key={invite.id}
                  className="rounded-lg border border-border/70 bg-background p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-foreground">{invite.email}</p>
                        <Badge variant="secondary" className="rounded-full">
                          {formatStaffRole(invite.role)}
                        </Badge>
                        <Badge variant={status.variant} className="rounded-full">
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sent {formatInviteDate(invite.createdAt)}
                        {invite.invitedBy ? ` by ${invite.invitedBy}` : ''}
                        {isOpen ? ` · ${expiry.label}` : ''}
                        {invite.acceptedAt
                          ? ` · Accepted ${formatInviteDate(invite.acceptedAt)}${invite.acceptedBy ? ` by ${invite.acceptedBy}` : ''}`
                          : ''}
                        {invite.cancelledAt
                          ? ` · Cancelled ${formatInviteDate(invite.cancelledAt)}${invite.cancelledBy ? ` by ${invite.cancelledBy}` : ''}`
                          : ''}
                      </p>
                    </div>
                    {isOpen ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void act(invite, 'resend')}
                          disabled={busy !== null}
                        >
                          <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
                          {busy?.inviteId === invite.id && busy.action === 'resend'
                            ? 'Resending…'
                            : 'Resend'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void act(invite, 'cancel')}
                          disabled={busy !== null}
                          aria-label={`Cancel invitation to ${invite.email}`}
                        >
                          <X className="mr-2 h-4 w-4" aria-hidden="true" />
                          {busy?.inviteId === invite.id && busy.action === 'cancel'
                            ? 'Cancelling…'
                            : 'Cancel'}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {isOpen ? (
                    <div className="mt-3 flex flex-wrap items-start gap-2 text-sm">
                      {/* Two separate facts, as on the patient chart: the account, and the email. */}
                      {identity ? (
                        <Badge
                          variant={identity.variant}
                          className="rounded-full"
                          title={identity.detail}
                        >
                          {identity.label}
                        </Badge>
                      ) : null}
                      <Badge
                        variant={getStatusVariant(invite.emailDelivery?.status ?? 'QUEUED')}
                        className="rounded-full"
                      >
                        {invite.emailDelivery
                          ? `Invite email ${invite.emailDelivery.status.toLowerCase()}`
                          : 'Invite email not sent'}
                      </Badge>
                      {identity ? (
                        <p className="basis-full text-xs leading-5 text-muted-foreground">
                          {identity.detail}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a colleague</DialogTitle>
            <DialogDescription>
              Use an address only they read. Whoever opens the email can accept the role, so shared
              inboxes are refused.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-invite-email">Email</Label>
              <Input
                id="staff-invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setConfirmReuse(null);
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="staff-invite-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(value) => {
                    setRole(value);
                    setConfirmReuse(null);
                  }}
                >
                  <SelectTrigger id="staff-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {invitableRoles.map((entry) => (
                      <SelectItem key={entry} value={entry}>
                        {formatStaffRole(entry)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-invite-ttl">Valid for</Label>
                <Select
                  value={String(ttlHours)}
                  onValueChange={(value) => setTtlHours(Number(value))}
                >
                  <SelectTrigger id="staff-invite-ttl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_INVITE_TTL_CHOICES.map((choice) => (
                      <SelectItem key={choice.hours} value={String(choice.hours)}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Director and System Admin access is never sent by email; assign it by hand on this
              page.
            </p>

            {confirmReuse ? <InlineNotice tone="warning">{confirmReuse}</InlineNotice> : null}
            {dialogError ? <InlineNotice tone="error">{dialogError}</InlineNotice> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Close
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={submitting || email.trim().length === 0}
            >
              {submitting
                ? 'Sending…'
                : confirmReuse
                  ? 'Yes, invite this account'
                  : 'Send invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
