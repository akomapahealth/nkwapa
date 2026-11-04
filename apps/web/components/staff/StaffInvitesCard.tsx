'use client';

import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  Mail,
  MailPlus,
  RotateCw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { ApiError, getErrorMessage, type GetToken } from '@/lib/api';
import {
  EMPTY_STAFF_NAME,
  STAFF_NAME_FIELDS,
  staffNameErrorsFrom,
  validateStaffName,
  type StaffNameErrors,
} from '@/lib/account-name';
import { focusFirstInvalid } from '@/components/ui/field';
import { StaffNameFields } from '@/components/account/StaffNameForm';
import { describeInviteExpiry, formatInviteDate } from '@/lib/portal-invite';
import {
  ADDRESS_IN_USE_CODE,
  DEFAULT_STAFF_INVITE_TTL_HOURS,
  STAFF_INVITE_TTL_CHOICES,
  cancelStaffInvite,
  createStaffInvite,
  describeStaffInviteIdentity,
  describeStaffInviteStatus,
  filterStaffInvites,
  formatStaffRole,
  listStaffInvites,
  resendStaffInvite,
  staffInviteBucket,
  type StaffInvite,
  type StaffInviteFilter,
  type StaffInviteRole,
} from '@/lib/staff-invite';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
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
import { removeWithUndo } from '@/lib/undoable';

export interface StaffInvitesCardProps {
  clinicId: string;
  clinicName: string | null;
  getToken: GetToken | undefined;
  /** Called after an invitation changes, so the roster can refresh if someone just accepted. */
  onChanged?: () => void;
}

type Busy = { inviteId: string; action: 'resend' | 'cancel' } | null;

/** Rows shown before "Show more", and the list size at which a search box earns its place. */
const PAGE_SIZE = 8;
const SEARCH_THRESHOLD = 6;

const FILTERS: Array<{ value: StaffInviteFilter; label: string; description?: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open', description: 'Waiting to be accepted' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'CLOSED', label: 'Closed', description: 'Cancelled or expired' },
];

const STATUS_DOT: Record<string, string> = {
  PENDING: 'bg-primary',
  ACCEPTED: 'bg-success',
  CANCELLED: 'bg-muted-foreground/40',
  EXPIRED: 'bg-warning',
};

function initialsOf(invite: StaffInvite) {
  const source = invite.inviteeName ?? invite.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?')
    .concat(invite.inviteeName ? (parts.at(-1)?.[0] ?? '') : '')
    .toUpperCase();
}

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
  const { isOnline } = useSync();
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [invitableRoles, setInvitableRoles] = useState<StaffInviteRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [filter, setFilter] = useState<StaffInviteFilter>('ALL');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteeName, setInviteeName] = useState(EMPTY_STAFF_NAME);
  const [nameErrors, setNameErrors] = useState<StaffNameErrors>({});
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

  const counts = useMemo(() => {
    const tally: Record<StaffInviteFilter, number> = {
      ALL: invites.length,
      OPEN: 0,
      ACCEPTED: 0,
      CLOSED: 0,
    };
    for (const invite of invites) tally[staffInviteBucket(invite.status)] += 1;
    return tally;
  }, [invites]);
  const visible = useMemo(
    () => filterStaffInvites(invites, { filter, query }),
    [invites, filter, query],
  );
  const shown = showAll ? visible : visible.slice(0, PAGE_SIZE);
  const hiddenCount = visible.length - shown.length;

  const openDialog = () => {
    setEmail('');
    setInviteeName(EMPTY_STAFF_NAME);
    setNameErrors({});
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
    const errors = validateStaffName(inviteeName, { email, optional: true });
    setNameErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusNameError(errors);
      return;
    }
    setSubmitting(true);
    setDialogError(null);
    try {
      const created = await createStaffInvite(clinicId, getToken, {
        email: email.trim(),
        ...inviteeName,
        role,
        ttlHours,
        ...(confirmReuse ? { confirmExistingAccount: true } : {}),
      });
      setDialogOpen(false);
      setNotice(
        `Invitation sent to ${created.inviteeName ?? created.email} as ${formatStaffRole(created.role)}.`,
      );
      await load();
      onChanged?.();
    } catch (error) {
      if (error instanceof ApiError && error.code === ADDRESS_IN_USE_CODE) {
        // Not a dead end: the inviter is told, and confirms if that is the person they mean.
        setConfirmReuse([error.message, error.recoveryAction].filter(Boolean).join(' '));
      } else if (Object.keys(staffNameErrorsFrom(error)).length > 0) {
        setNameErrors(staffNameErrorsFrom(error));
        focusNameError(staffNameErrorsFrom(error));
      } else {
        setDialogError(describeFailure(error, 'The invitation could not be sent.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const focusNameError = (errors: StaffNameErrors) =>
    focusFirstInvalid(
      Object.fromEntries(
        Object.entries(errors).map(([field, message]) => [`staff-invite-${field}`, message]),
      ),
      STAFF_NAME_FIELDS.map((field) => `staff-invite-${field}`),
    );

  /*
    Cancelling is cheap to undo -- the colleague can simply be invited again -- so it does not ask
    first. It shows as cancelled at once and is sent a few seconds later, with Undo in between.
  */
  const cancelWithUndo = (invite: StaffInvite) => {
    if (!getToken) return;
    setActionError(null);
    setNotice(null);
    removeWithUndo({
      message: `Invitation to ${invite.email} cancelled`,
      hide: () =>
        setInvites((current) =>
          current.map((item) =>
            item.id === invite.id
              ? { ...item, status: 'CANCELLED', cancelledAt: new Date().toISOString() }
              : item,
          ),
        ),
      restore: () =>
        setInvites((current) => current.map((item) => (item.id === invite.id ? invite : item))),
      commit: async () => {
        await cancelStaffInvite(clinicId, invite.id, getToken);
        await load();
        onChanged?.();
      },
      failureMessage: `The invitation to ${invite.email} could not be cancelled, so it is still open.`,
    });
  };

  const act = async (invite: StaffInvite, action: 'resend' | 'cancel') => {
    if (!getToken) return;
    if (action === 'cancel') {
      cancelWithUndo(invite);
      return;
    }
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
    <RecordSection className="min-w-0">
      <RecordSectionHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <RecordSectionTitle className="flex items-center gap-2 text-xl">
            <MailPlus className="h-5 w-5 text-primary" aria-hidden="true" />
            Staff invitations
          </RecordSectionTitle>
          <RecordSectionDescription>
            Invite a colleague to {clinicName ?? 'this clinic'} by email. They set their own
            password and get the role only once they accept.
          </RecordSectionDescription>
        </div>
        <Button onClick={openDialog} disabled={!getToken || invitableRoles.length === 0}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          Invite a colleague
        </Button>
      </RecordSectionHeader>

      <RecordSectionContent className="space-y-4">
        {!isOnline ? <StaleDataNotice isOnline={false} /> : null}
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
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SegmentedControl
                label="Show invitations"
                value={filter}
                options={FILTERS.map((option) => ({
                  value: option.value,
                  label: `${option.label} ${counts[option.value]}`,
                  description: option.description,
                }))}
                onChange={(next) => {
                  setFilter(next);
                  setShowAll(false);
                }}
                className="sm:flex-1"
              />
              {invites.length > SEARCH_THRESHOLD ? (
                <div className="relative sm:w-64">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    aria-label="Search invitations by name or email"
                    placeholder="Search name or email"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setShowAll(false);
                    }}
                    className="pl-9"
                  />
                </div>
              ) : null}
            </div>

            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {query.trim()
                  ? `No invitations match \u201c${query.trim()}\u201d.`
                  : 'No invitations here.'}
              </p>
            ) : (
              <ul
                className="divide-y divide-border overflow-hidden rounded-lg border border-border"
                aria-label="Staff invitations"
              >
                {shown.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    invite={invite}
                    busy={busy}
                    onAct={(action) => void act(invite, action)}
                  />
                ))}
              </ul>
            )}

            {hiddenCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => setShowAll(true)}
              >
                <ChevronDown className="mr-2 h-4 w-4" aria-hidden="true" />
                Show {hiddenCount} more
              </Button>
            ) : null}
          </div>
        )}
      </RecordSectionContent>

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
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground">
                Their name <span className="font-normal text-muted-foreground">(optional)</span>
              </legend>
              <p className="text-xs text-muted-foreground">
                Add it if you know it and they go straight in. Leave it blank and they are asked for
                it when they first sign in.
              </p>
              <StaffNameFields
                idPrefix="staff-invite"
                value={inviteeName}
                onChange={(next) => {
                  setInviteeName(next);
                  if (Object.keys(nameErrors).length > 0) {
                    setNameErrors(validateStaffName(next, { email, optional: true }));
                  }
                }}
                errors={nameErrors}
                required={false}
                disabled={submitting}
              />
            </fieldset>
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
    </RecordSection>
  );
}

/**
 * One invitation as a dense row: who, what role, where it stands, and what you can do.
 *
 * The account and email facts used to be two more pills and a paragraph on every open invite,
 * which is what made the list a wall. They are now one quiet line, and the explanation is only
 * spelled out when something needs the inviter's attention.
 */
function InviteRow({
  invite,
  busy,
  onAct,
}: {
  invite: StaffInvite;
  busy: Busy;
  onAct: (action: 'resend' | 'cancel') => void;
}) {
  const status = describeStaffInviteStatus(invite.status);
  const isOpen = invite.status === 'PENDING';
  const identity = isOpen ? describeStaffInviteIdentity(invite.identity) : null;
  const needsAttention =
    identity?.variant === 'warning' ||
    identity?.variant === 'destructive' ||
    invite.emailDelivery?.status === 'FAILED';
  const expiry = describeInviteExpiry(invite.expiresAt);
  const isBusy = (action: 'resend' | 'cancel') =>
    busy?.inviteId === invite.id && busy.action === action;

  const history = [
    `Sent ${formatInviteDate(invite.createdAt)}${invite.invitedBy ? ` by ${invite.invitedBy}` : ''}`,
    isOpen ? expiry.label : null,
    invite.acceptedAt
      ? `Accepted ${formatInviteDate(invite.acceptedAt)}${invite.acceptedBy ? ` by ${invite.acceptedBy}` : ''}`
      : null,
    invite.cancelledAt
      ? `Cancelled ${formatInviteDate(invite.cancelledAt)}${invite.cancelledBy ? ` by ${invite.cancelledBy}` : ''}`
      : null,
  ].filter(Boolean);

  return (
    <li
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 bg-background px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center',
        !isOpen && 'bg-muted/20',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold',
          isOpen ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {initialsOf(invite)}
      </span>

      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <p
            className={cn(
              'truncate font-medium',
              isOpen ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {invite.inviteeName ?? invite.email}
          </p>
          <span className="text-sm text-muted-foreground">{formatStaffRole(invite.role)}</span>
        </div>
        {invite.inviteeName ? (
          <p className="truncate text-sm text-muted-foreground">{invite.email}</p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span
              aria-hidden="true"
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                STATUS_DOT[invite.status] ?? 'bg-muted-foreground',
              )}
            />
            {status.label}
          </span>
          {history.map((entry) => (
            <span key={entry}>· {entry}</span>
          ))}
        </p>
        {isOpen ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
            {identity ? (
              <span className="inline-flex items-center gap-1" title={identity.detail}>
                {needsAttention ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                ) : (
                  <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                )}
                {identity.label}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {invite.emailDelivery
                ? `Invite email ${invite.emailDelivery.status.toLowerCase()}`
                : 'Invite email not sent'}
            </span>
          </p>
        ) : null}
        {needsAttention && identity ? (
          <p className="text-xs leading-5 text-warning-ink">{identity.detail}</p>
        ) : null}
      </div>

      {isOpen ? (
        <div className="col-start-2 flex gap-1 sm:col-start-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAct('resend')}
            disabled={busy !== null}
          >
            <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {isBusy('resend') ? 'Resending…' : 'Resend'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onAct('cancel')}
            disabled={busy !== null}
            aria-label={`Cancel invitation to ${invite.email}`}
          >
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {isBusy('cancel') ? 'Cancelling…' : 'Cancel'}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
