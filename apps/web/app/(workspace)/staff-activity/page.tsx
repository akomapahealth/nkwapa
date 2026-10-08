'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { apiFetch, readApiError } from '@/lib/api';
import { getTodayInTimeZone } from '@/lib/ops';
import { useAsyncResource } from '@/lib/use-async-resource';
import {
  describeRecord,
  formatRoles,
  lastSevenDays,
  staffActivityPath,
  type StaffActivityOverview,
  type StaffActivityPerson,
} from '@/lib/staff-activity';
import { RouteGuard } from '@/components/RouteGuard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const formatAt = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

function StaffActivityContent() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const [range, setRange] = useState(() => lastSevenDays(getTodayInTimeZone()));
  const [selected, setSelected] = useState<string | null>(null);

  const overview = useAsyncResource<StaffActivityOverview>({
    resourceKey: `${clinicId}:${range.from}:${range.to}`,
    enabled: Boolean(clinicId),
    requiresOnline: true,
    errorMessage: 'Staff activity could not be loaded.',
    fetcher: async (getToken, signal) => {
      const response = await apiFetch(staffActivityPath(clinicId ?? '', range), {
        getToken,
        activeClinicId: clinicId ?? undefined,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as StaffActivityOverview;
    },
  });

  const person = useAsyncResource<StaffActivityPerson>({
    resourceKey: `${clinicId}:${range.from}:${range.to}:${selected}`,
    enabled: Boolean(clinicId && selected),
    requiresOnline: true,
    errorMessage: 'This person’s activity could not be loaded.',
    fetcher: async (getToken, signal) => {
      const response = await apiFetch(
        staffActivityPath(clinicId ?? '', range, selected ?? undefined),
        { getToken, activeClinicId: clinicId ?? undefined, signal },
      );
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as StaffActivityPerson;
    },
  });

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Oversight"
        title="Staff activity"
        description="Who did what work at this clinic, and when. Listed by name, not ranked."
        helpTitle="What these numbers are"
        helpText="Each figure counts the records a person worked on, from the audit trail: a form saved several times counts once. It shows workload, not performance, and leaves out time spent with patients that does not produce a record. No patient is named here."
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="activity-from">From</Label>
              <Input
                id="activity-from"
                type="date"
                value={range.from}
                max={range.to}
                onChange={(event) =>
                  event.target.value &&
                  setRange((current) => ({ ...current, from: event.target.value }))
                }
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="activity-to">To</Label>
              <Input
                id="activity-to"
                type="date"
                value={range.to}
                min={range.from}
                onChange={(event) =>
                  event.target.value &&
                  setRange((current) => ({ ...current, to: event.target.value }))
                }
                className="w-[160px]"
              />
            </div>
          </div>
        }
      />

      {selected ? (
        <ResourceState
          state={person}
          skeleton={<SectionSkeleton lines={6} />}
          errorTitle="This person’s activity could not be loaded"
          offlineDescription="Staff activity is calculated on the server, so it needs a connection."
        >
          {(detail) => (
            <div className="space-y-6">
              <Button variant="ghost" onClick={() => setSelected(null)}>
                <ArrowLeft aria-hidden="true" />
                All staff
              </Button>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">
                    {detail.person?.displayName ?? 'Unknown person'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatRoles(detail.person?.roles ?? [])}
                    {detail.person && !detail.person.active ? ' · Deactivated' : ''} · {detail.from}{' '}
                    to {detail.to}, clinic time ({detail.timezone})
                  </p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {detail.days.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing recorded in this range.</p>
                  ) : (
                    <table className="w-full min-w-[640px] text-sm" data-testid="activity-days">
                      <caption className="sr-only">Activity by day</caption>
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th scope="col" className="py-2 pr-3 font-medium">
                            Day
                          </th>
                          {detail.categories.map((category) => (
                            <th
                              key={category.key}
                              scope="col"
                              className="py-2 pr-3 text-right font-medium"
                            >
                              {category.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {detail.days.map((day) => (
                          <tr key={day.day} className="border-b last:border-0">
                            <th scope="row" className="py-2 pr-3 text-left font-medium">
                              {day.day}
                            </th>
                            {detail.categories.map((category) => (
                              <td key={category.key} className="py-2 pr-3 text-right">
                                {day.counts[category.key] || '–'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Records worked on, newest first
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {detail.records.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None in this range.</p>
                  ) : (
                    <ul className="divide-y text-sm" data-testid="activity-records">
                      {detail.records.map((record, index) => {
                        const category =
                          detail.categories.find((entry) => entry.key === record.category)?.label ??
                          record.category;
                        return (
                          <li
                            key={`${record.at}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-2 py-2"
                          >
                            <span>
                              <span className="font-medium">
                                {describeRecord(record.entityType)}
                              </span>
                              <span className="text-muted-foreground"> · {category}</span>
                            </span>
                            <span className="flex items-center gap-3 text-muted-foreground">
                              {formatAt(record.at, detail.timezone)}
                              {record.href ? (
                                <Link
                                  className="text-primary underline-offset-4 hover:underline"
                                  href={record.href}
                                >
                                  Open
                                </Link>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </ResourceState>
      ) : (
        <ResourceState
          state={overview}
          skeleton={<SectionSkeleton lines={8} />}
          errorTitle="Staff activity could not be loaded"
          offlineDescription="Staff activity is calculated on the server, so it needs a connection."
        >
          {(data) => (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {data.from} to {data.to}, clinic time ({data.timezone})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {data.staff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody works at this clinic yet.</p>
                ) : (
                  <table
                    className="w-full min-w-[960px] text-sm"
                    data-testid="staff-activity-table"
                  >
                    <caption className="sr-only">
                      Work recorded by each member of staff, listed by name
                    </caption>
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Name
                        </th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">
                          Hours on shift
                        </th>
                        {data.categories.map((category) => (
                          <th
                            key={category.key}
                            scope="col"
                            className="py-2 pr-3 text-right font-medium"
                          >
                            {category.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {data.staff.map((row) => (
                        <tr key={row.userId} className="border-b last:border-0">
                          <th scope="row" className="py-2 pr-3 text-left font-normal">
                            <button
                              type="button"
                              className="text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setSelected(row.userId)}
                            >
                              {row.displayName}
                            </button>
                            <span className="block text-xs text-muted-foreground">
                              {formatRoles(row.roles)}
                              {!row.active ? (
                                <>
                                  {' '}
                                  <Badge variant="secondary">Deactivated</Badge>
                                </>
                              ) : null}
                            </span>
                          </th>
                          <td className="py-2 pr-3 text-right">
                            {row.shifts ? `${row.shiftHours} h` : '–'}
                          </td>
                          {data.categories.map((category) => (
                            <td key={category.key} className="py-2 pr-3 text-right">
                              {row.counts[category.key] || '–'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t text-xs text-muted-foreground">
                        <th scope="row" className="py-2 pr-3 text-left font-medium">
                          Clinic total
                        </th>
                        <td className="py-2 pr-3" />
                        {data.categories.map((category) => (
                          <td key={category.key} className="py-2 pr-3 text-right tabular-nums">
                            {data.totals[category.key] || '–'}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                )}
              </CardContent>
            </Card>
          )}
        </ResourceState>
      )}
    </div>
  );
}

export default function StaffActivityPage() {
  return (
    <RouteGuard requiredPermission="AUDIT.READ" requiresClinic clinicSurface="Staff activity">
      <StaffActivityContent />
    </RouteGuard>
  );
}
