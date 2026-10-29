'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, CalendarPlus } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, readApiError } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import { eventsPath, formatEventWhen, type ScreeningEvent } from '@/lib/volunteers';
import { RouteGuard } from '@/components/RouteGuard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { showToast } from '@/components/ui/toast';
import { EventForm } from '@/components/volunteers/EventForm';
import { EventStatusBadge } from '@/components/volunteers/EventStatusBadge';

type EventList = { timezone: string; items: ScreeningEvent[] };

function EventsContent() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap) ?? '';
  const getToken = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const events = useAsyncResource<EventList>({
    resourceKey: clinicId,
    enabled: Boolean(clinicId),
    requiresOnline: true,
    errorMessage: 'Screening days could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(eventsPath(clinicId), {
        getToken: token,
        activeClinicId: clinicId,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return response.json();
    },
  });
  const timezone = events.data?.timezone ?? 'Africa/Accra';
  const open = (event: ScreeningEvent) => router.push(`/volunteers/events/${event.id}`);

  const columns: DataTableColumn<ScreeningEvent>[] = [
    {
      accessorKey: 'title',
      header: 'Event',
      cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
    },
    {
      accessorKey: 'startsAt',
      header: 'When',
      cell: ({ row }) => formatEventWhen(row.original, timezone),
    },
    { accessorKey: 'siteName', header: 'Site', meta: { hideOnMobile: true } },
    {
      accessorKey: 'rosteredCount',
      header: 'Rostered',
      meta: { align: 'right' },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <EventStatusBadge status={row.original.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Oversight"
        title="Screening days"
        description={`Plan screening days and who volunteers at each. Times are in clinic time (${timezone}).`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/volunteers">
                <ArrowLeft aria-hidden="true" />
                Directory
              </Link>
            </Button>
            <Button onClick={() => setCreating(true)} disabled={!events.isOnline}>
              <CalendarPlus aria-hidden="true" />
              New screening day
            </Button>
          </div>
        }
      />

      {!events.isOnline ? (
        <InlineNotice tone="warning">
          You are offline. Screening days need a connection to change.
        </InlineNotice>
      ) : null}

      <ResourceState
        state={events}
        skeleton={<SectionSkeleton lines={6} />}
        errorTitle="Screening days could not be loaded"
        isEmpty={(data) => data.items.length === 0}
        empty={{
          title: 'No screening days yet',
          description: 'Create one, then add volunteers from the directory.',
        }}
      >
        {(data) => (
          <DataTable
            caption="Screening days"
            columns={columns}
            data={data.items}
            getRowId={(row) => row.id}
            isRefreshing={events.isRefreshing}
            onRowClick={open}
            renderMobileRow={(event) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{event.title}</span>
                  <EventStatusBadge status={event.status} />
                </div>
                <p className="text-sm">{formatEventWhen(event, timezone)}</p>
                <p className="text-sm text-muted-foreground">
                  {event.siteName} · {event.rosteredCount ?? 0} rostered
                </p>
              </div>
            )}
          />
        )}
      </ResourceState>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New screening day</DialogTitle>
            <DialogDescription>Times are in clinic time ({timezone}).</DialogDescription>
          </DialogHeader>
          <EventForm
            timezone={timezone}
            submitLabel="Create"
            disabled={!events.isOnline}
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              const response = await apiFetch(eventsPath(clinicId), {
                method: 'POST',
                getToken,
                activeClinicId: clinicId,
                body: JSON.stringify(values),
              });
              if (!response.ok) {
                const error = await readApiError(response);
                showToast({
                  title: 'The screening day could not be created',
                  description: error.message,
                  tone: 'error',
                });
                return;
              }
              const created = (await response.json()) as ScreeningEvent;
              showToast({ title: `${created.title} created`, tone: 'success' });
              setCreating(false);
              open(created);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ScreeningEventsPage() {
  return (
    <RouteGuard
      requiredPermission="VOLUNTEER.ROSTER.MANAGE"
      requiresClinic
      clinicSurface="Screening days"
    >
      <EventsContent />
    </RouteGuard>
  );
}
