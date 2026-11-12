'use client';

import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CircleCheck,
  Mail,
  MailPlus,
  RotateCw,
  Trash2,
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
import { FieldLabel, focusFirstInvalid, RequiredLegend } from '@/components/ui/field';
import { StaffNameFields } from '@/components/account/StaffNameForm';
import {
  describeInviteExpiry,
  describeRenewalRequest,
  formatInviteDate,
} from '@/lib/portal-invite';
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
  removeStaffInvite,
  resendStaffInvite,
  staffInviteActions,
  staffInviteBucket,
  type StaffInvite,
  type StaffInviteAction,
  type StaffInviteFilter,
  type StaffInviteRole,
} from '@/lib/staff-invite';
import { ListSearch } from '@/components/app-shell/ListToolbar';
import { InfoHint } from '@/components/ui/info-hint';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableActions,
  SHEET_GUTTER,
  type DataTableColumn,
} from '@/components/ui/data-table';
import {
  RecordSectionContent,
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
import { avatarToneProps } from '@/lib/avatar-tone';

export interface StaffInvitesCardProps {
  clinicId: string;
  clinicName: string | null;
  getToken: GetToken | undefined;
  /** Called after an invitation changes, so the roster can refresh if someone just accepted. */
  onChanged?: () => void;
}

type Busy = { inviteId: string; action: StaffInviteAction } | null;

/** The list size at which a search box earns its place. */
const SEARCH_THRESHOLD = 6;

const FILTERS: Array<{ value: StaffInviteFilter; label: string; description?: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open', description: 'Waiting to be accepted' },
  { value: 'EXPIRED', label: 'Expired', description: 'Lapsed before anyone accepted' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'CANCELLED', label: 'Cancelled' },
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
 * Staff invitations for one clinic: send, resend, cancel, remove, and the history.
 *
 * Cancelled and expired invitations stay in the list until a director removes them, so a lapsed
 * invitation is never mistaken for one that was never sent. Removing only hides it here: the
 * record and its audit trail stay, and the invitee asking again brings it back.
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
      EXPIRED: 0,
      ACCEPTED: 0,
      CANCELLED: 0,
    };
    for (const invite of invites) tally[staffInviteBucket(invite.status)] += 1;
    return tally;
  }, [invites]);
  const visible = useMemo(
    () => filterStaffInvites(invites, { filter, query }),
    [invites, filter, query],
  );

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

  /* The same pattern: gone from the list at once, sent after the Undo window. */
  const removeWithUndoFor = (invite: StaffInvite) => {
    if (!getToken) return;
    setActionError(null);
    setNotice(null);
    removeWithUndo({
      message: `Invitation to ${invite.email} removed from the list`,
      hide: () => setInvites((current) => current.filter((item) => item.id !== invite.id)),
      restore: () =>
        setInvites((current) =>
          current.some((item) => item.id === invite.id) ? current : [...current, invite],
        ),
      commit: async () => {
        await removeStaffInvite(clinicId, invite.id, getToken);
        await load();
      },
      failureMessage: `The invitation to ${invite.email} could not be removed, so it is back in the list.`,
    });
  };

  const act = async (invite: StaffInvite, action: StaffInviteAction) => {
    if (!getToken) return;
    if (action === 'cancel') {
      cancelWithUndo(invite);
      return;
    }
    if (action === 'remove') {
      removeWithUndoFor(invite);
      return;
    }
    setBusy({ inviteId: invite.id, action });
    setActionError(null);
    try {
      await resendStaffInvite(clinicId, invite.id, getToken);
      setNotice(`Invitation to ${invite.email} sent again.`);
      await load();
      onChanged?.();
    } catch (error) {
      setActionError(describeFailure(error, 'The invitation could not be resent.'));
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="min-w-0">
      <RecordSectionHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <RecordSectionTitle className="flex items-center gap-2 text-xl">
            <MailPlus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Invitations
          </RecordSectionTitle>
          <InfoHint label="How invitations grant access">
            Invite a colleague to {clinicName ?? 'this clinic'} by email. They set their own
            password and get the role only once they accept.
          </InfoHint>
        </div>
        <Button
          className="w-full compact:w-auto"
          onClick={openDialog}
          disabled={!getToken || invitableRoles.length === 0}
        >
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
          <DataTable
            bleed
            caption="Staff invitations"
            columns={inviteColumns(busy, (invite, action) => void act(invite, action))}
            data={visible}
            getRowId={(invite) => invite.id}
            initialPageSize={10}
            toolbar={
              <div className="flex w-full min-w-0 flex-col gap-3">
                <SegmentedControl
                  label="Show invitations"
                  scrollable
                  value={filter}
                  options={FILTERS.map((option) => ({
                    value: option.value,
                    label: `${option.label} ${counts[option.value]}`,
                    description: option.description,
                  }))}
                  onChange={setFilter}
                />
                {invites.length > SEARCH_THRESHOLD ? (
                  <ListSearch
                    id="staff-invites-search"
                    label="Search invitations by name or email"
                    placeholder="Name or email…"
                    value={query}
                    onChange={setQuery}
                  />
                ) : null}
              </div>
            }
            emptyState={
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {query.trim()
                  ? `No invitations match \u201c${query.trim()}\u201d.`
                  : 'No invitations here.'}
              </p>
            }
            renderMobileRow={(invite) => (
              <InviteRow invite={invite} busy={busy} onAct={(action) => void act(invite, action)} />
            )}
          />
        )}
      </RecordSectionContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent variant="form">
          <DialogHeader>
            <DialogTitle>Invite a colleague</DialogTitle>
            <DialogDescription>
              Use an address only they read. Whoever opens the email can accept the role, so shared
              inboxes are refused.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <RequiredLegend />
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground">Their name</legend>
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
              <FieldLabel htmlFor="staff-invite-email" required>
                Email
              </FieldLabel>
              <Input
                id="staff-invite-email"
                required
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
    </section>
  );
}

type OnAct = (invite: StaffInvite, action: StaffInviteAction) => void;

function inviteHistory(invite: StaffInvite) {
  const isOpen = invite.status === 'PENDING';
  return [
    `Sent ${formatInviteDate(invite.createdAt)}${invite.invitedBy ? ` by ${invite.invitedBy}` : ''}`,
    isOpen ? describeInviteExpiry(invite.expiresAt).label : null,
    invite.acceptedAt
      ? `Accepted ${formatInviteDate(invite.acceptedAt)}${invite.acceptedBy ? ` by ${invite.acceptedBy}` : ''}`
      : null,
    invite.cancelledAt
      ? `Cancelled ${formatInviteDate(invite.cancelledAt)}${invite.cancelledBy ? ` by ${invite.cancelledBy}` : ''}`
      : null,
    describeRenewalRequest(invite.renewalRequestedAt),
  ].filter((entry): entry is string => Boolean(entry));
}

/** Account and email facts for an open invitation; spelled out only when they need attention. */
function InviteSetup({ invite }: { invite: StaffInvite }) {
  if (invite.status !== 'PENDING') return null;
  const identity = describeStaffInviteIdentity(invite.identity);
  const needsAttention =
    identity?.variant === 'warning' ||
    identity?.variant === 'destructive' ||
    invite.emailDelivery?.status === 'FAILED';
  return (
    <>
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
      {needsAttention && identity ? (
        <p className="whitespace-normal text-xs leading-5 text-warning-ink">{identity.detail}</p>
      ) : null}
    </>
  );
}

function InviteStatus({ invite }: { invite: StaffInvite }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          STATUS_DOT[invite.status] ?? 'bg-muted-foreground',
        )}
      />
      {describeStaffInviteStatus(invite.status).label}
    </span>
  );
}

/** The actions an invitation allows, as the API allows them. */
function InviteActions({ invite, busy, onAct }: { invite: StaffInvite; busy: Busy; onAct: OnAct }) {
  const actions = staffInviteActions(invite.status);
  if (actions.length === 0) return null;
  const isBusy = (action: StaffInviteAction) =>
    busy?.inviteId === invite.id && busy.action === action;
  return (
    <div className="flex gap-1">
      {actions.includes('resend') ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAct(invite, 'resend')}
          disabled={busy !== null}
        >
          <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {isBusy('resend') ? 'Resending…' : 'Resend'}
        </Button>
      ) : null}
      {actions.includes('cancel') ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onAct(invite, 'cancel')}
          disabled={busy !== null}
          aria-label={`Cancel invitation to ${invite.email}`}
        >
          <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Cancel
        </Button>
      ) : null}
      {actions.includes('remove') ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onAct(invite, 'remove')}
          disabled={busy !== null}
          aria-label={`Remove invitation to ${invite.email} from the list`}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Remove
        </Button>
      ) : null}
    </div>
  );
}

function inviteColumns(busy: Busy, onAct: OnAct): DataTableColumn<StaffInvite>[] {
  return [
    {
      id: 'invitee',
      header: 'Invitee',
      accessorFn: (invite) => invite.inviteeName ?? invite.email,
      cell: ({ row }) => {
        const invite = row.original;
        return (
          <div className="flex min-w-0 flex-col py-1">
            <span
              className="truncate font-medium text-foreground"
              title={invite.inviteeName ?? invite.email}
            >
              {invite.inviteeName ?? invite.email}
            </span>
            {invite.inviteeName ? (
              <span className="truncate text-xs text-muted-foreground" title={invite.email}>
                {invite.email}
              </span>
            ) : null}
            <InviteSetup invite={invite} />
          </div>
        );
      },
    },
    {
      id: 'role',
      header: 'Role',
      accessorFn: (invite) => formatStaffRole(invite.role),
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (invite) => describeStaffInviteStatus(invite.status).label,
      cell: ({ row }) => <InviteStatus invite={row.original} />,
    },
    {
      id: 'history',
      header: 'History',
      enableSorting: false,
      cell: ({ row }) => (
        <ul className="space-y-0.5 py-1 text-xs text-muted-foreground">
          {inviteHistory(row.original).map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <DataTableActions>
          <InviteActions invite={row.original} busy={busy} onAct={onAct} />
        </DataTableActions>
      ),
    },
  ];
}

/** One invitation as a phone card: who, what role, where it stands, and what you can do. */
function InviteRow({
  invite,
  busy,
  onAct,
}: {
  invite: StaffInvite;
  busy: Busy;
  onAct: (action: StaffInviteAction) => void;
}) {
  const isOpen = invite.status === 'PENDING';
  return (
    <article
      aria-label={invite.inviteeName ?? invite.email}
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-rule py-3',
        SHEET_GUTTER,
        !isOpen && 'bg-muted/20',
      )}
    >
      {/* A closed invitation stays grey: its colour would suggest a live person on the roster. */}
      <span
        aria-hidden="true"
        {...(isOpen ? avatarToneProps(invite.inviteeName ?? invite.email) : {})}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          !isOpen && 'bg-muted text-muted-foreground',
        )}
      >
        {initialsOf(invite)}
      </span>

      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <p
            className={cn(
              'font-medium [overflow-wrap:anywhere]',
              isOpen ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {invite.inviteeName ?? invite.email}
          </p>
          <span className="text-sm text-muted-foreground">{formatStaffRole(invite.role)}</span>
        </div>
        {invite.inviteeName ? (
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{invite.email}</p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <InviteStatus invite={invite} />
          {inviteHistory(invite).map((entry) => (
            <span key={entry}>· {entry}</span>
          ))}
        </p>
        <InviteSetup invite={invite} />
      </div>

      <div className="col-start-2">
        <InviteActions invite={invite} busy={busy} onAct={(_invite, action) => onAct(action)} />
      </div>
    </article>
  );
}
