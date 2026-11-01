'use client';

import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { formatBytes, getStorageDiagnostics, type StorageDiagnostics } from '@/lib/pwa/storage';

/** Support diagnostics in the sync center: is this device's queued work protected, and how full is it (#206). */
export function DeviceStorageDetails({ open = false }: { open?: boolean }) {
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics | null>(null);

  useEffect(() => {
    void getStorageDiagnostics().then(setDiagnostics);
  }, []);

  if (!diagnostics) return null;
  const protectedLabel =
    diagnostics.persisted === null ? 'Unknown' : diagnostics.persisted ? 'Yes' : 'No';

  return (
    <details open={open} className="rounded-md border border-border/70 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
        <HardDrive aria-hidden="true" className="h-3.5 w-3.5" />
        Device storage
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Protected from clearing</dt>
        <dd className="font-medium">{protectedLabel}</dd>
        <dt className="text-muted-foreground">Used</dt>
        <dd className="font-medium">
          {formatBytes(diagnostics.usageBytes)} of {formatBytes(diagnostics.quotaBytes)}
        </dd>
      </dl>
      {diagnostics.persisted === false ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          The browser may clear saved changes if the device runs low on space. Installing Nkwapa
          makes this less likely.
        </p>
      ) : null}
    </details>
  );
}
