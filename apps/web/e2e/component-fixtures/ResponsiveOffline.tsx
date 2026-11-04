import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SyncCenterSheet } from '@/components/sync/SyncCenterSheet';
import { ResourceState } from '@/components/feedback/ResourceState';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { MeasurementTrendChart } from '@/components/portal/MeasurementTrendChart';
import { FixtureSyncContext } from './ResponsiveSyncContext';
import type { OutboxQueueItem } from '@/lib/use-outbox-queue';

const longName = 'SyntheticClinicWithAnUnbrokenName'.repeat(5);
const item: OutboxQueueItem = {
  state: 'blocked',
  label: 'Vital signs',
  patientName: 'SyntheticPatientWithAnUnbrokenName'.repeat(4),
  row: {
    id: 'synthetic-change',
    clinicId: 'synthetic-clinic',
    entityType: 'vitals',
    entityId: 'synthetic-encounter',
    operation: 'UPSERT',
    payloadJson: '{}',
    idempotencyKey: 'synthetic-key',
    createdAt: new Date().toISOString(),
    ownerUserId: 'synthetic-owner',
    ownerName: 'SyntheticColleague'.repeat(6),
    syncState: 'blocked',
    attempts: 2,
    lastFailure: {
      status: 'conflict',
      conflictType: 'ENCOUNTER_FINALIZED',
      at: new Date().toISOString(),
      retryable: false,
    },
  },
};
function Fixture() {
  const [mode, setMode] = useState('offline');
  const [open, setOpen] = useState(false);
  const online = !mode.startsWith('offline');
  const populated = mode === 'changes';
  const rows = [
    { id: '1', record: 'Synthetic record A', value: '120/80 mmHg' },
    { id: '2', record: 'Synthetic record B', value: '118/78 mmHg' },
  ];
  return (
    <FixtureSyncContext.Provider
      value={{
        isOnline: online,
        syncStatus: mode === 'error' ? 'error' : 'idle',
        syncError:
          mode === 'error' ? 'The sync request did not answer. Saved changes are kept.' : null,
        syncErrorDetail: mode === 'error' ? 'Synthetic network failure' : null,
        syncCenterOpen: open,
        setSyncCenterOpen: setOpen,
        syncNow: async () => {},
      }}
    >
      <div className="mx-auto max-w-4xl space-y-6 p-4" id="responsive-fixture">
        <h1 className="type-page-title">Responsive and offline clinic fixtures</h1>
        <p>Synthetic records only. No clinical writes or outbox mutations.</p>
        <div className="flex flex-wrap gap-2">
          {['offline', 'online', 'error', 'changes', 'loading'].map((value) => (
            <Button
              key={value}
              onClick={() => {
                setMode(value);
                setOpen(true);
              }}
            >
              Open {value}
            </Button>
          ))}
        </div>
        <ResourceState
          state={{
            data: null,
            status: 'idle',
            error: null,
            isInitialLoading: false,
            isRefreshing: false,
            isStale: false,
            isOnline: false,
            isOfflineBlocked: true,
            refresh: () => {},
            retry: () => {},
            setData: () => {},
          }}
          empty={{ title: 'No records yet', description: 'Only after a successful load.' }}
          isEmpty={() => true}
        >
          {() => null}
        </ResourceState>
        <h2 className="type-section-title">Synthetic clinical readings</h2>
        <DataTable
          caption="Synthetic wide clinical readings"
          columns={[
            { accessorKey: 'record', header: 'Record' },
            { accessorKey: 'value', header: 'Blood pressure (mmHg)' },
            {
              id: 'details',
              header: 'Additional clinical context',
              cell: () => 'Synthetic long table cell for contained scrolling',
            },
          ]}
          data={rows}
        />
        <MeasurementTrendChart
          title="Synthetic blood pressure"
          description="Synthetic readings in mmHg"
          emptyMessage="No readings"
          staffRecord
          data={[
            { label: 'Visit 1', sys: 120, dia: 80 },
            { label: 'Visit 2', sys: 118, dia: 78 },
          ]}
          lines={[
            { key: 'sys', label: 'Systolic', color: 'hsl(var(--chart-1))' },
            { key: 'dia', label: 'Diastolic', color: 'hsl(var(--chart-2))' },
          ]}
        />
        <SyncCenterSheet
          clinicId="synthetic-clinic"
          canSync
          recoveryAccess={{ canReviewDuplicates: true }}
          queue={{
            loaded: mode !== 'loading',
            total: populated ? 1 : 0,
            blocked: populated ? [item] : [],
            retrying: [],
            pending: [],
            held: populated
              ? [
                  {
                    ...item,
                    row: { ...item.row, id: 'held-synthetic', ownerUserId: 'another-account' },
                  },
                ]
              : [],
          }}
          otherClinics={
            populated
              ? [
                  {
                    clinicId: 'other-clinic',
                    clinicName: longName,
                    access: 'available',
                    own: [item.row],
                    others: [item.row],
                  },
                ]
              : []
          }
        />
      </div>
    </FixtureSyncContext.Provider>
  );
}
createRoot(document.getElementById('component-fixture')!).render(<Fixture />);
