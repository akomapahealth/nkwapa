'use client';

import { useEffect, useState } from 'react';
import { useSync } from './ServiceWorkerAndSyncProvider';
import { db } from '@/lib/db';

interface SyncStatusBarProps {
  clinicId: string;
}

export function SyncStatusBar({ clinicId }: SyncStatusBarProps) {
  const { isOnline, syncStatus, syncError, syncNow } = useSync();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updateCount = async () => {
      const count = await db.outbox.where('clinicId').equals(clinicId).count();
      setPendingCount(count);
    };
    updateCount();
    const interval = setInterval(updateCount, 2000);
    return () => clearInterval(interval);
  }, [clinicId]);

  const handleSync = async () => {
    await syncNow(clinicId);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.5rem 1rem',
        background: isOnline ? '#e8f5e9' : '#ffebee',
        borderBottom: '1px solid #ccc',
        fontSize: '0.875rem',
      }}
    >
      <span>
        {isOnline ? (
          <span style={{ color: '#2e7d32' }}>Online</span>
        ) : (
          <span style={{ color: '#c62828' }}>Offline</span>
        )}
      </span>
      <span>Pending: {pendingCount}</span>
      <button
        onClick={handleSync}
        disabled={!isOnline || syncStatus === 'syncing'}
        style={{
          padding: '0.25rem 0.5rem',
          cursor: isOnline && syncStatus !== 'syncing' ? 'pointer' : 'not-allowed',
        }}
      >
        {syncStatus === 'syncing' ? 'Syncing…' : 'Sync now'}
      </button>
      {syncError && (
        <span style={{ color: '#c62828', fontSize: '0.75rem' }}>
          {syncError.slice(0, 60)}
          {syncError.length > 60 ? '…' : ''}
        </span>
      )}
    </div>
  );
}
