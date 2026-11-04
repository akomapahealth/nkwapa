'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
    <section aria-labelledby="status-title" className="mx-auto max-w-5xl text-foreground">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Home
      </Link>
      <h1 id="status-title" className="mt-4 border-t-2 border-rule-strong pt-5 type-page-title">
        System status details
      </h1>
      <p role="status" className="mt-3 type-body text-muted-foreground">
        {message}
      </p>
      {!auth?.isAuthenticated && auth?.isReady ? (
        <Link
          href="/login?next=%2Fstatus"
          className="mt-6 inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign in
        </Link>
      ) : null}
      {details ? (
        <ul className="mt-8 border-t-2 border-rule-strong">
          {details.map((item) => (
            <li key={item.name} className="border-b border-rule py-5">
              <h2 className="type-section-title capitalize">
                {item.name}: {item.state}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.reason} · {item.latencyMs} ms
              </p>
              {item.error ? <p className="mt-2 break-words text-sm">{item.error}</p> : null}
              {item.detail ? (
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words border-t border-rule pt-3 font-mono text-xs">
                  {JSON.stringify(item.detail, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
