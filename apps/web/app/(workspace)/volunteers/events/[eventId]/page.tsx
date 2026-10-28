'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Mail, UserPlus } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, readApiError } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import {
  PENDING_DELIVERY,
  eventsPath,
  formatEventWhen,
  volunteersPath,
  type RosterRow,
  type ScreeningEventDetail,
  type VolunteerContact,
} from '@/lib/volunteers';
import { RouteGuard } from '@/components/RouteGuard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, DataTableActions, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError, fieldErrorProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/components/ui/toast';
import { EventForm } from '@/components/volunteers/EventForm';
import { EventStatusBadge } from '@/components/volunteers/EventStatusBadge';

const POLL_MS = 4000;

function DeliveryBadge({ row }: { row: RosterRow }) {
  if (row.status === 'REMOVED') return <Badge variant="draft">Removed</Badge>;
  const delivery = row.delivery;
  if (!delivery) return <Badge variant="outline">Not sent</Badge>;
  if (delivery.status === 'FAILED') return <Badge variant="destructive">Failed</Badge>;
  if (delivery.status === 'SENT' || delivery.status === 'DELIVERED') {
    return (
      <Badge variant="finalized">
        {delivery.status === 'SENT' ? 'Sent' : 'Delivered'}
        {row.notifiedForCurrentDetails ? '' : ' (old details)'}
      </Badge>
    );
  }
  return <Badge variant="review">{delivery.status === 'QUEUED' ? 'Queued' : 'Sending'}</Badge>;
}

function EventContent() {
  const { eventId } = useParams<{ eventId: string }>();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap) ?? '';
  const getToken = useAuth();
  const base = `${eventsPath(clinicId)}/${eventId}`;

  const detail = useAsyncResource<ScreeningEventDetail>({
    resourceKey: `${clinicId}:${eventId}`,
    enabled: Boolean(clinicId && eventId),
    requiresOnline: true,
    errorMessage: 'This screening day could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(base, { getToken: token, activeClinicId: clinicId, signal });
      if (!response.ok) throw await readApiError(response);
      return response.json();
    },
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [removing, setRemoving] = useState<RosterRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const data = detail.data;
  const pending = data?.roster.some(
    (row) => row.status === 'ASSIGNED' && row.delivery && PENDING_DELIVERY.has(row.delivery.status),
  );
  const { refresh } = detail;
  // Delivery moves on the server; keep the badges honest until nothing is in flight.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, refresh]);

  const writable = detail.isOnline && data?.event.status === 'SCHEDULED';

  const call = async (path: string, method: string, body?: unknown) => {
    const response = await apiFetch(path, {
      method,
      getToken,
      activeClinicId: clinicId,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw await readApiError(response);
    return response.json();
  };

  const run = async (key: string, work: () => Promise<void>, failure: string) => {
    setBusy(key);
    try {
      await work();
      refresh();
    } catch (error) {
      showToast({
        title: failure,
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const sendAll = () =>
    run(
      'notify',
      async () => {
        const { queued } = (await call(`${base}/notify`, 'POST')) as { queued: number };
        showToast({
          title:
            queued === 0
              ? 'Everyone already has the current details'
              : `Emails queued for ${queued} volunteer${queued === 1 ? '' : 's'}`,
          tone: 'success',
        });
      },
      'Roster emails could not be sent',
    );

  const resend = (row: RosterRow) =>
    run(
      row.id,
      async () => {
        await call(`${base}/roster/${row.id}/resend`, 'POST');
        showToast({
          title: `Email queued for ${row.volunteerContact.displayName}`,
          tone: 'success',
        });
      },
      'The email could not be resent',
    );

  const unsent = (data?.roster ?? []).filter(
    (row) => row.status === 'ASSIGNED' && !row.notifiedForCurrentDetails,
  ).length;
  const failed = (data?.roster ?? []).filter(
    (row) => row.status === 'ASSIGNED' && row.delivery?.status === 'FAILED',
  ).length;

  const actions = (row: RosterRow) =>
    row.status === 'ASSIGNED' ? (
      <DataTableActions>
        <Button
          size="sm"
          variant="ghost"
          disabled={!writable || busy === row.id}
          onClick={() => resend(row)}
        >
          {row.delivery ? 'Resend' : 'Send'}
        </Button>
        <Button size="sm" variant="ghost" disabled={!writable} onClick={() => setRemoving(row)}>
          Remove
        </Button>
      </DataTableActions>
    ) : null;

  const columns: DataTableColumn<RosterRow>[] = [
    {
      id: 'name',
      header: 'Volunteer',
      accessorFn: (row) => row.volunteerContact.displayName,
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.volunteerContact.displayName}
          {!row.original.volunteerContact.isActive ? (
            <Badge variant="draft" className="ml-2">
              Inactive
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      accessorFn: (row) => row.volunteerContact.email,
      meta: { hideOnMobile: true },
    },
    {
      id: 'delivery',
      header: 'Email status',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="space-y-1">
          <DeliveryBadge row={row.original} />
          {row.original.delivery?.status === 'FAILED' && row.original.delivery.failureReason ? (
            <p className="text-xs text-muted-foreground">{row.original.delivery.failureReason}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => actions(row.original),
      meta: { align: 'right' },
    },
  ];

  return (
    <ResourceState
      state={detail}
      skeleton={<SectionSkeleton lines={8} />}
      errorTitle="This screening day could not be loaded"
    >
      {({ event, timezone, emailConfigured, roster }) => (
        <div className="space-y-6">
          <AppPageHeader
            eyebrow="Screening day"
            title={event.title}
            description={`${formatEventWhen(event, timezone)} · ${event.siteName}`}
            badges={<EventStatusBadge status={event.status} />}
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link href="/volunteers/events">
                    <ArrowLeft aria-hidden="true" />
                    Screening days
                  </Link>
                </Button>
                {event.status === 'SCHEDULED' ? (
                  <>
                    <Button variant="outline" disabled={!writable} onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!writable}
                      onClick={() => setCancelling(true)}
                    >
                      Cancel day
                    </Button>
                  </>
                ) : null}
              </div>
            }
          />

          {!detail.isOnline ? (
            <InlineNotice tone="warning">
              You are offline. Rosters and emails need a connection.
            </InlineNotice>
          ) : null}
          {!emailConfigured ? (
            <InlineNotice tone="warning" live={false}>
              Email delivery is not configured in this environment. Sends are recorded as failed
              with the reason.
            </InlineNotice>
          ) : null}
          {event.status === 'CANCELLED' ? (
            <InlineNotice tone="warning" live={false}>
              Cancelled{event.cancelReason ? `: ${event.cancelReason}` : '.'}
            </InlineNotice>
          ) : null}
          {failed > 0 ? (
            <InlineNotice tone="error">
              {failed} email{failed === 1 ? '' : 's'} failed. Check the address and use Resend.
            </InlineNotice>
          ) : null}

          <Card>
            <CardContent className="space-y-1 pt-6 text-sm">
              <p>
                <span className="text-muted-foreground">Where: </span>
                {event.siteName}
                {event.siteAddress ? `, ${event.siteAddress}` : ''}
              </p>
              {event.notes ? (
                <p className="whitespace-pre-line">
                  <span className="text-muted-foreground">Notes for volunteers: </span>
                  {event.notes}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Roster</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!writable} onClick={() => setAdding(true)}>
                <UserPlus aria-hidden="true" />
                Add volunteers
              </Button>
              <Button disabled={!writable || unsent === 0 || busy === 'notify'} onClick={sendAll}>
                <Mail aria-hidden="true" />
                Send roster emails{unsent > 0 ? ` (${unsent})` : ''}
              </Button>
            </div>
          </div>

          <DataTable
            caption="Volunteers on this screening day"
            columns={columns}
            data={roster}
            getRowId={(row) => row.id}
            isRefreshing={detail.isRefreshing}
            initialPageSize={50}
            emptyState={
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nobody is scheduled. Add volunteers from the directory.
              </p>
            }
            renderMobileRow={(row) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{row.volunteerContact.displayName}</span>
                  <DeliveryBadge row={row} />
                </div>
                <p className="break-all text-sm text-muted-foreground">
                  {row.volunteerContact.email}
                </p>
                {row.delivery?.status === 'FAILED' && row.delivery.failureReason ? (
                  <p className="text-xs text-muted-foreground">{row.delivery.failureReason}</p>
                ) : null}
                {actions(row)}
              </div>
            )}
          />

          <AddVolunteersDialog
            open={adding}
            clinicId={clinicId}
            rosteredIds={
              new Set(
                roster
                  .filter((row) => row.status === 'ASSIGNED')
                  .map((row) => row.volunteerContact.id),
              )
            }
            onClose={() => setAdding(false)}
            onAdd={(ids) =>
              run(
                'add',
                async () => {
                  await call(`${base}/roster`, 'POST', { volunteerContactIds: ids });
                  showToast({
                    title: `${ids.length} volunteer${ids.length === 1 ? '' : 's'} added`,
                    tone: 'success',
                  });
                  setAdding(false);
                },
                'Volunteers could not be added',
              )
            }
          />

          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit screening day</DialogTitle>
                <DialogDescription>Times are in clinic time ({timezone}).</DialogDescription>
              </DialogHeader>
              <EventForm
                timezone={timezone}
                initial={event}
                hasNotifiedVolunteers={roster.some(
                  (row) => row.status === 'ASSIGNED' && row.lastNotifiedAt,
                )}
                submitLabel="Save"
                disabled={!writable}
                onCancel={() => setEditing(false)}
                onSubmit={(values) =>
                  run(
                    'edit',
                    async () => {
                      const { notified } = (await call(base, 'PATCH', values)) as {
                        notified: number;
                      };
                      showToast({
                        title:
                          notified > 0
                            ? `Saved. ${notified} volunteer${notified === 1 ? '' : 's'} emailed the change`
                            : 'Saved',
                        tone: 'success',
                      });
                      setEditing(false);
                    },
                    'The screening day could not be saved',
                  )
                }
              />
            </DialogContent>
          </Dialog>

          <CancelDialog
            open={cancelling}
            onClose={() => setCancelling(false)}
            onConfirm={(reason, notifyVolunteers) =>
              run(
                'cancel',
                async () => {
                  const { notified } = (await call(`${base}/cancel`, 'POST', {
                    reason,
                    notifyVolunteers,
                  })) as { notified: number };
                  showToast({
                    title:
                      notified > 0
                        ? `Cancelled. ${notified} volunteer${notified === 1 ? '' : 's'} emailed`
                        : 'Screening day cancelled',
                    tone: 'success',
                  });
                  setCancelling(false);
                },
                'The screening day could not be cancelled',
              )
            }
          />

          <RemoveDialog
            row={removing}
            onClose={() => setRemoving(null)}
            onConfirm={(row, notify) =>
              run(
                row.id,
                async () => {
                  await call(`${base}/roster/${row.id}${notify ? '?notify=true' : ''}`, 'DELETE');
                  showToast({
                    title: `${row.volunteerContact.displayName} removed from the roster`,
                    tone: 'success',
                  });
                  setRemoving(null);
                },
                'The volunteer could not be removed',
              )
            }
          />
        </div>
      )}
    </ResourceState>
  );
}

function AddVolunteersDialog({
  open,
  clinicId,
  rosteredIds,
  onClose,
  onAdd,
}: {
  open: boolean;
  clinicId: string;
  rosteredIds: Set<string>;
  onClose: () => void;
  onAdd: (ids: string[]) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const directory = useAsyncResource<{ items: VolunteerContact[] }>({
    resourceKey: `${clinicId}:${open}`,
    enabled: open && Boolean(clinicId),
    requiresOnline: true,
    errorMessage: 'The directory could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(volunteersPath(clinicId), {
        getToken: token,
        activeClinicId: clinicId,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return response.json();
    },
  });
  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (directory.data?.items ?? []).filter(
      (contact) =>
        contact.isActive &&
        !rosteredIds.has(contact.id) &&
        (!query ||
          contact.displayName.toLowerCase().includes(query) ||
          contact.email.includes(query)),
    );
  }, [directory.data, rosteredIds, search]);

  const close = () => {
    setPicked(new Set());
    setSearch('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add volunteers</DialogTitle>
          <DialogDescription>Active volunteers from the directory.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="roster-search">Search by name or email</Label>
          <Input
            id="roster-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <ResourceState state={directory} skeleton={<SectionSkeleton lines={4} />}>
          {() =>
            candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody else to add.{' '}
                <Link href="/volunteers" className="underline">
                  Add people to the directory
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((contact) => (
                  <li key={contact.id} className="flex items-start gap-3">
                    <Checkbox
                      id={`pick-${contact.id}`}
                      checked={picked.has(contact.id)}
                      onCheckedChange={(checked) =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(contact.id);
                          else next.delete(contact.id);
                          return next;
                        })
                      }
                    />
                    <Label htmlFor={`pick-${contact.id}`} className="font-normal leading-snug">
                      <span className="font-medium">{contact.displayName}</span>
                      <span className="block break-all text-muted-foreground">{contact.email}</span>
                    </Label>
                  </li>
                ))}
              </ul>
            )
          }
        </ResourceState>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={picked.size === 0}
            onClick={async () => {
              await onAdd([...picked]);
              setPicked(new Set());
            }}
          >
            Add {picked.size > 0 ? picked.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notify: boolean) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | undefined>();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this screening day?</DialogTitle>
          <DialogDescription>It can&apos;t be reopened afterwards.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reason.trim()) {
              setError('Give a reason.');
              document.getElementById('cancel-reason')?.focus();
              return;
            }
            void onConfirm(reason.trim(), notify);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => {
                setReason(event.target.value);
                setError(undefined);
              }}
              {...fieldErrorProps('cancel-reason', error)}
            />
            <FieldError id="cancel-reason" message={error} />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="cancel-notify"
              checked={notify}
              onCheckedChange={(checked) => setNotify(checked === true)}
            />
            <Label htmlFor="cancel-notify" className="font-normal leading-snug">
              Email rostered volunteers
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Keep it
            </Button>
            <Button type="submit" variant="destructive">
              Cancel day
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: RosterRow | null;
  onClose: () => void;
  onConfirm: (row: RosterRow, notify: boolean) => Promise<void>;
}) {
  const [notify, setNotify] = useState(false);
  return (
    <Dialog
      open={row !== null}
      onOpenChange={(next) => {
        if (!next) {
          setNotify(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {row?.volunteerContact.displayName} from the roster?</DialogTitle>
          <DialogDescription>You can add them back later.</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2">
          <Checkbox
            id="remove-notify"
            checked={notify}
            onCheckedChange={(checked) => setNotify(checked === true)}
          />
          <Label htmlFor="remove-notify" className="font-normal leading-snug">
            Email them that they are no longer scheduled
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep them
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (row) await onConfirm(row, notify);
              setNotify(false);
            }}
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ScreeningEventPage() {
  return (
    <RouteGuard
      requiredPermission="VOLUNTEER.ROSTER.MANAGE"
      requiresClinic
      clinicSurface="This screening day"
    >
      <EventContent />
    </RouteGuard>
  );
}
