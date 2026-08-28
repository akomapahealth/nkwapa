'use client';

import { useState } from 'react';
import type { GetToken } from '@/lib/api';
import { isPortalLinkMissingError } from '@/lib/patient-portal';
import { useAsyncResource, type AsyncResourceState } from '@/lib/use-async-resource';

/**
 * `useAsyncResource`, plus the one portal-specific question it cannot answer.
 *
 * A patient whose account has not been linked to a patient record must see the claim prompt, not
 * a red box: it is not a transient failure and retrying it forever will never help. That case is
 * identified by the typed `PortalApiError.code`, and `useAsyncResource` deliberately narrows every
 * failure to a message string for rendering. So the typed error is inspected here, in the one
 * place it is still typed, on its way past.
 *
 * The flag is sticky only until the next attempt resolves: a successful load clears it, which is
 * what makes "staff linked the record, press retry" work.
 */
export function usePortalResource<T>({
  fetcher,
  resourceKey,
  errorMessage,
  enabled,
}: {
  fetcher: (getToken: GetToken, signal: AbortSignal) => Promise<T>;
  resourceKey: string;
  errorMessage: string;
  enabled?: boolean;
}): AsyncResourceState<T> & { isLinkMissing: boolean } {
  const [isLinkMissing, setIsLinkMissing] = useState(false);

  const state = useAsyncResource<T>({
    resourceKey,
    errorMessage,
    enabled,
    fetcher: async (getToken, signal) => {
      try {
        const data = await fetcher(getToken, signal);
        setIsLinkMissing(false);
        return data;
      } catch (error) {
        setIsLinkMissing(isPortalLinkMissingError(error));
        throw error;
      }
    },
  });

  return { ...state, isLinkMissing };
}
