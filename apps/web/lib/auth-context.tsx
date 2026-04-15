'use client';

import { createContext, useContext, useMemo } from 'react';
import type { GetToken } from './api';

const AuthContext = createContext<{ getToken?: GetToken } | null>(null);

export function AuthProvider({
  children,
  getToken,
}: {
  children: React.ReactNode;
  getToken?: GetToken;
}) {
  const value = useMemo(() => ({ getToken }), [getToken]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  return ctx?.getToken;
}
