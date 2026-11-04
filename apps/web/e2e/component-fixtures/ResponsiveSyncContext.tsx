import { createContext, useContext } from 'react';
export const FixtureSyncContext = createContext({
  isOnline: true,
  syncStatus: 'idle',
  syncError: null as string | null,
  syncErrorDetail: null as string | null,
  syncCenterOpen: false,
  syncNow: async () => {},
  setSyncCenterOpen: (_open: boolean) => {},
});
export const useSync = () => useContext(FixtureSyncContext);
