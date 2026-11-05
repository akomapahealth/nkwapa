import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClipboardCheck } from 'lucide-react';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { AppActionRow } from '@/components/app-shell/AppActionRow';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { ResourceState } from '@/components/feedback/ResourceState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { StatusLabel } from '@/components/ui/status-label';
import type { AsyncResourceState } from '@/lib/use-async-resource';

type Row = { id: string; name: string; status: string };
const rows: Row[] = [
  { id: '1', name: 'Synthetic record C', status: 'IN_REVIEW' },
  { id: '2', name: 'Synthetic record A', status: 'DRAFT' },
  { id: '3', name: 'Synthetic record B', status: 'FINALIZED' },
];
const columns: DataTableColumn<Row>[] = [
  { id: 'name', accessorKey: 'name', header: 'Record' },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <StatusLabel value={String(getValue())} />,
  },
];
const modes = [
  'content',
  'loading',
  'offline',
  'error',
  'empty',
  'stale',
  'refreshing',
  'saved',
] as const;
type Mode = (typeof modes)[number];

function SharedComponents() {
  const [mode, setMode] = useState<Mode>('content');
  const [filter, setFilter] = useState('');
  const [retries, setRetries] = useState(0);
  const [actions, setActions] = useState(0);
  const data = ['loading', 'offline', 'error'].includes(mode) ? null : mode === 'empty' ? [] : rows;
  const state: AsyncResourceState<Row[]> = {
    data,
    status:
      mode === 'loading' || mode === 'refreshing'
        ? 'loading'
        : mode === 'error' || mode === 'stale'
          ? 'error'
          : 'ready',
    error: mode === 'error' || mode === 'stale' ? 'The connection timed out. Try again.' : null,
    isInitialLoading: mode === 'loading',
    isRefreshing: mode === 'refreshing',
    isStale: mode === 'stale',
    isOnline: mode !== 'offline' && mode !== 'saved',
    isOfflineBlocked: mode === 'offline' || mode === 'saved',
    savedCopyAt: mode === 'saved' ? '2026-11-01T12:00:00Z' : null,
    refresh: () => setRetries((value) => value + 1),
    retry: () => setRetries((value) => value + 1),
    setData: () => undefined,
  };
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 24, display: 'grid', gap: 28 }}>
      <AppPageHeader
        title="Shared clinic foundations"
        description="Synthetic records for component verification."
        hint="This is a synthetic preview of the shared components."
        breadcrumbs={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#fixture">Workspace</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Foundations</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        actions={
          <Button onClick={() => setActions((value) => value + 1)}>Review next record</Button>
        }
      />
      <AppMetricGroup label="Today's work" className="sm:grid-cols-2">
        <AppMetricCard title="Awaiting review" value={3} detail="Synthetic records" />
        <AppMetricCard title="Finalized" value={12} detail="This clinic session" />
      </AppMetricGroup>
      <section aria-label="Needs you now">
        <h2 className="type-section-title">Needs you now</h2>
        <ul>
          <AppActionRow
            title="Review the next record"
            detail="Keep the patient's work moving."
            icon={ClipboardCheck}
            action={
              <Button variant="outline" onClick={() => setActions((value) => value + 1)}>
                Open review
              </Button>
            }
          />
        </ul>
        <p role="status">Actions taken: {actions}</p>
      </section>
      <FormSectionCard
        title="Record details"
        description="The caller still owns validation and saving."
        hint="Only synthetic names appear in this preview."
      >
        <Label htmlFor="fixture-name">Display name</Label>
        <Input id="fixture-name" defaultValue="Synthetic record" />
      </FormSectionCard>
      <section aria-label="Status labels">
        <h2 className="type-section-title">Status labels</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {['IN_REVIEW', 'DRAFT', 'FINALIZED', 'STAGE2', 'UNKNOWN'].map((value) => (
            <StatusLabel key={value} value={value} />
          ))}
        </div>
      </section>
      <section aria-label="Resource states">
        <h2 className="type-section-title">Resource states</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
          {modes.map((value) => (
            <Button
              key={value}
              variant="outline"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              Show {value}
            </Button>
          ))}
        </div>
        <p role="status">Retries: {retries}</p>
        <div data-testid="resource">
          <ResourceState
            state={state}
            empty={{
              title: 'No records yet',
              description: 'Records will appear after the first visit.',
            }}
            isEmpty={(items) => items.length === 0}
          >
            {(items) => (
              <DataTable
                columns={columns}
                data={items}
                caption="Synthetic records"
                initialPageSize={2}
                pageSizeOptions={[2, 10]}
                globalFilter={filter}
                toolbar={
                  <div>
                    <Label htmlFor="fixture-filter">Filter records</Label>
                    <Input
                      id="fixture-filter"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    />
                  </div>
                }
              />
            )}
          </ResourceState>
        </div>
      </section>
    </div>
  );
}

const container = document.getElementById('component-fixture');
if (!container) throw new Error('Missing component fixture container');
createRoot(container).render(<SharedComponents />);
