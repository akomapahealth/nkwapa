import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SyncStatusBar } from '@/components/sync/SyncStatusBar';
import { FixtureSyncContext } from './ResponsiveSyncContext';
import { PillFixtureContext } from './SyncPillState';

function Fixture() {
  const [state, setState] = useState('synced');
  const [open, setOpen] = useState(false);
  const [syncs, setSyncs] = useState(0);
  return (
    <PillFixtureContext.Provider value={state}>
      <FixtureSyncContext.Provider
        value={{
          isOnline: state !== 'offline',
          syncStatus: state === 'syncing' ? 'syncing' : state === 'failed' ? 'error' : 'idle',
          syncError: state === 'failed' ? 'Synthetic connection failure' : null,
          syncErrorDetail: null,
          syncCenterOpen: open,
          setSyncCenterOpen: setOpen,
          syncNow: async () => setSyncs((n) => n + 1),
        }}
      >
        <h1>Sync presentation fixtures</h1>
        <div data-testid="pill-row" style={{ display: 'flex', alignItems: 'center' }}>
          <SyncStatusBar
            clinicId="synthetic-clinic"
            canSync
            recoveryAccess={{ canReviewDuplicates: false, opsBoardHref: null }}
          />
          <button type="button">Adjacent action</button>
        </div>
        <p>Sync requests: {syncs}</p>
        {['offline', 'syncing', 'attention', 'failed', 'queued', 'held', 'synced'].map((value) => (
          <button type="button" key={value} onClick={() => setState(value)}>
            Show {value}
          </button>
        ))}
      </FixtureSyncContext.Provider>
    </PillFixtureContext.Provider>
  );
}

createRoot(document.getElementById('component-fixture')!).render(<Fixture />);
