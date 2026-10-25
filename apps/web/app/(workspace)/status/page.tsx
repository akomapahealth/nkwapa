'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useKeycloak } from '@/app/KeycloakProvider';
import { getKeycloak } from '@/lib/keycloak';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
interface Detail {
  name: string;
  state: string;
  reason: string;
  latencyMs: number;
  error?: string;
  detail?: unknown;
}

export default function StatusDetailsPage() {
  const auth = useKeycloak();
  const [details, setDetails] = useState<Detail[] | null>(null);
  const [message, setMessage] = useState('Loading status details…');

  useEffect(() => {
    if (!auth?.isReady) return;
    if (!auth.isAuthenticated) {
      setMessage('Sign in as a System Admin to view status details.');
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const client = getKeycloak();
        await client?.updateToken(30);
        const response = await fetch(`${API}/status/details`, {
          headers: { Authorization: `Bearer ${client?.token ?? ''}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 403) throw new Error('Only System Admins can view these details.');
        if (!response.ok) throw new Error('Status details could not be loaded.');
        const data = (await response.json()) as { components: Detail[] };
        setDetails(data.components);
        setMessage('Current status details');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setMessage((error as Error).message);
      }
    })();
    return () => controller.abort();
  }, [auth?.isReady, auth?.isAuthenticated]);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-12 text-foreground">
      <Link href="/" className="text-primary underline underline-offset-2">
        ← Home
      </Link>
      <h1 className="mt-8 font-heading text-3xl font-semibold">System status details</h1>
      <p className="mt-2 text-muted-foreground">{message}</p>
      {!auth?.isAuthenticated && auth?.isReady ? (
        <Link
          href="/login?next=%2Fstatus"
          className="mt-6 inline-block text-primary underline underline-offset-2"
        >
          Sign in
        </Link>
      ) : null}
      {details ? (
        <ul className="mt-8 space-y-4">
          {details.map((item) => (
            <li key={item.name} className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-semibold capitalize">
                {item.name}: {item.state}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.reason} · {item.latencyMs} ms
              </p>
              {item.error ? <p className="mt-2 break-words text-sm">{item.error}</p> : null}
              {item.detail ? (
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">
                  {JSON.stringify(item.detail, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
