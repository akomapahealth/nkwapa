'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { apiFetch, readApiError } from '@/lib/api';
import { formatOpsDate, formatOpsDateTime, getTodayInTimeZone } from '@/lib/ops';
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
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const formatRange = (from: string, to: string, timeZone: string) =>
  from === to
    ? formatOpsDate(from, timeZone)
    : `${formatOpsDate(from, timeZone)} to ${formatOpsDate(to, timeZone)}`;

/** Keeps the name column in view while a phone scrolls the counts sideways. */
const STICKY_CELL = 'sticky left-0 z-[1] bg-card';

function StaffActivityContent() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const [range, setRange] = useState(() => lastSevenDays(getTodayInTimeZone()));
  const [selected, setSelected] = useState<string | null>(null);
  // Whose name to put focus back on after "All staff", so the reader keeps their place.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  // Stable callback refs: focus once, when the element mounts, not on every render.
  const focusOnMount = useCallback((element: HTMLElement | null) => element?.focus(), []);
  const focusReturn = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    element.focus();
    setReturnTo(null);
  }, []);

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
        title="Staff activity"
        description="Who did what work here, and when."
        hint="Listed by name, not ranked."
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
              <Button
                variant="ghost"
                onClick={() => {
                  setReturnTo(selected);
                  setSelected(null);
                }}
              >
                <ArrowLeft aria-hidden="true" />
                All staff
              </Button>
              <RecordSection>
                <RecordSectionHeader>
                  {/* A plain h2 (RecordSectionTitle's styles): focus lands here on opening a person. */}
                  <h2
                    ref={focusOnMount}
                    tabIndex={-1}
                    className="type-section-title focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {detail.person?.displayName ?? 'Unknown person'}
                  </h2>
                  <RecordSectionDescription>
                    {formatRoles(detail.person?.roles ?? [])}
                    {detail.person && !detail.person.active ? ' · Deactivated' : ''} ·{' '}
                    {formatRange(detail.from, detail.to, detail.timezone)}, clinic time (
                    {detail.timezone})
                  </RecordSectionDescription>
                </RecordSectionHeader>
                <RecordSectionContent
                  role="region"
                  aria-label="Activity by day"
                  tabIndex={0}
                  className="scroll-region overflow-x-auto"
                >
                  {detail.days.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing recorded in this range.</p>
                  ) : (
                    <table className="w-full min-w-[640px] text-sm" data-testid="activity-days">
                      <caption className="sr-only">Activity by day</caption>
                      <thead>
                        <tr className="border-b border-rule text-left text-xs text-muted-foreground">
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
                          <tr key={day.day} className="border-b border-rule last:border-0">
                            <th scope="row" className="py-2 pr-3 text-left font-medium">
                              {formatOpsDate(day.day, detail.timezone)}
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
                </RecordSectionContent>
              </RecordSection>

              <RecordSection>
                <RecordSectionHeader>
                  <RecordSectionTitle>Records worked on, newest first</RecordSectionTitle>
                </RecordSectionHeader>
                <RecordSectionContent>
                  {detail.records.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None in this range.</p>
                  ) : (
                    <ul className="divide-y divide-rule text-sm" data-testid="activity-records">
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
                              <time dateTime={record.at} className="tabular-nums">
                                {formatOpsDateTime(record.at, detail.timezone)}
                              </time>
                              {record.href ? (
                                <Link
                                  className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
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
                </RecordSectionContent>
              </RecordSection>
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
            <RecordSection>
              <RecordSectionHeader>
                <RecordSectionTitle>
                  {formatRange(data.from, data.to, data.timezone)}
                </RecordSectionTitle>
                <RecordSectionDescription>
                  Clinic time ({data.timezone}). Choose a name to see that person&apos;s days and
                  records.
                </RecordSectionDescription>
              </RecordSectionHeader>
              <RecordSectionContent
                role="region"
                aria-label="Work recorded by each member of staff"
                tabIndex={0}
                className="scroll-region overflow-x-auto"
              >
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
                      <tr className="border-b border-rule text-left text-xs text-muted-foreground">
                        <th scope="col" className={`${STICKY_CELL} py-2 pr-3 font-medium`}>
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
                        <tr key={row.userId} className="border-b border-rule last:border-0">
                          <th
                            scope="row"
                            className={`${STICKY_CELL} py-2 pr-3 text-left font-normal`}
                          >
                            <button
                              ref={row.userId === returnTo ? focusReturn : undefined}
                              type="button"
                              className="inline-flex min-h-11 items-center text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                      <tr className="border-t-2 border-rule-strong text-xs text-muted-foreground">
                        <th
                          scope="row"
                          className={`${STICKY_CELL} py-2 pr-3 text-left font-medium`}
                        >
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
              </RecordSectionContent>
            </RecordSection>
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
