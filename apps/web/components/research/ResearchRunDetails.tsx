'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { apiFetch, readApiError } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { eventLabel, type ResearchExportItem, type ResearchRunEvent } from '@/lib/research';

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** The run's own audit trail. Mounted only when the details are opened, so it loads lazily. */
function RunEvents({ clinicId, exportId }: { clinicId: string; exportId: string }) {
  const events = useAsyncResource<ResearchRunEvent[]>({
    resourceKey: exportId,
    errorMessage: 'This run’s steps could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/research/exports/${encodeURIComponent(exportId)}/events`,
        { getToken: token, activeClinicId: clinicId, signal },
      );
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as ResearchRunEvent[];
    },
  });

  return (
    <ResourceState
      state={events}
      errorTitle="We couldn't load this run's steps"
      skeleton={<SectionSkeleton lines={3} className="border-0 bg-transparent p-0 shadow-none" />}
      isEmpty={(items) => items.length === 0}
      empty={{ title: 'No steps recorded', description: 'Steps appear as the run moves along.' }}
    >
      {(items) => (
        <ol className="space-y-2 border-l border-border/80 pl-4">
          {items.map((event) => (
            <li key={event.id} className="text-sm">
              <span className="font-medium text-foreground">{eventLabel(event.action)}</span>
              <span className="text-muted-foreground">
                {' '}
                · {new Date(event.at).toLocaleString()} · {event.actor}
              </span>
              {event.note ? <p className="mt-0.5 text-muted-foreground">“{event.note}”</p> : null}
            </li>
          ))}
        </ol>
      )}
    </ResourceState>
  );
}

/**
 * Everything a director checks before trusting or quoting a run (#166): table sizes and how they
 * moved since the previous run, the checksums a researcher verifies against, and each step.
 */
export function ResearchRunDetails({
  clinicId,
  item,
}: {
  clinicId: string;
  item: ResearchExportItem;
}) {
  const [open, setOpen] = useState(false);
  const deltas = item.changes?.rowCountDeltas ?? {};
  const tables = Object.entries(item.rowCounts);
  const facts: Array<[string, string | null]> = [
    ['Dataset version', `v${item.datasetVersion} · ${item.policyVersionSnapshot}`],
    ['Content checksum', item.contentSha256],
    ['Zip checksum', item.artifactSha256],
    ['Storage reference', item.storageRef],
  ];

  return (
    <details
      className="group rounded-lg border border-border/70"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 transition-transform group-open:rotate-180"
        />
        Run details
      </summary>
      {open ? (
        <div className="grid gap-5 border-t border-border/70 p-4 lg:grid-cols-2">
          <div className="space-y-4">
            {tables.length > 0 ? (
              <table className="w-full text-sm">
                <caption className="mb-2 text-left font-medium text-foreground">
                  Rows per table
                </caption>
                <thead className="sr-only">
                  <tr>
                    <th>Table</th>
                    <th>Rows</th>
                    <th>Change since the previous run</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map(([table, rows]) => (
                    <tr key={table} className="border-t border-border/50">
                      <td className="break-all py-1.5 pr-3 font-mono text-xs text-muted-foreground">
                        {table}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{rows}</td>
                      <td className="w-16 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                        {deltas[table] ? signed(deltas[table]) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">No tables have been generated yet.</p>
            )}
            <dl className="space-y-2 text-sm">
              {facts
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-medium text-foreground">{label}</dt>
                    <dd className="break-all font-mono text-xs text-muted-foreground">{value}</dd>
                  </div>
                ))}
            </dl>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Steps</p>
            <RunEvents clinicId={clinicId} exportId={item.id} />
          </div>
        </div>
      ) : null}
    </details>
  );
}
