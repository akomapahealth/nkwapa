'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { ChatWidget } from '@/components/chat/ChatWidget';

const SIDEBAR_STORAGE_KEY = 'nkwapa.sidebar.collapsed';

/**
 * Resolve the rail's starting width before the first paint rather than after it.
 *
 * This used to start `false` and get corrected in an effect, so on any screen at or below 1280px
 * the sidebar painted at 320px and then snapped to 96px — a visible jump on every cold load, and
 * exactly the layout shift the design system forbids.
 *
 * Reading storage in the initializer is safe here because `AppLayout` never appears in the
 * server-rendered HTML: `KeycloakProvider` renders `PageSkeleton` until its session check
 * resolves in an effect, so this tree only ever mounts on the client. There is no server pass to
 * disagree with, and therefore no hydration mismatch to trade the flash for.
 */
function resolveInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored != null) {
      return stored === 'true';
    }
  } catch {
    // localStorage throws outright in some privacy modes. A preference we cannot read is not a
    // reason to fail to render a clinical workspace; fall through to the viewport default.
  }

  return window.matchMedia('(max-width: 1280px)').matches;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(resolveInitialSidebarCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // See above: a preference that cannot be persisted must not break the session.
    }
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen bg-background">
      {/*
        First thing in the tab order, hidden until focused. Without it a keyboard or screen reader
        user walks the whole sidebar and header on every page before reaching the chart.
      */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to main content
      </a>
      {/*
        The canvas is `--background` and nothing else. A two-stop decorative radial gradient used
        to sit behind every clinical page here; it tinted the corners of every chart and table in
        the product for no informational reason.
      */}
      <div className="flex min-h-screen">
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
            mobileOpen={mobileNavOpen}
            onMobileOpenChange={setMobileNavOpen}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 overflow-auto px-4 py-5 pb-24 focus-visible:outline-none md:px-6 md:pb-8 lg:px-8"
          >
            <div className="mx-auto w-full max-w-[1440px] space-y-6">{children}</div>
          </main>
        </div>
      </div>
      <ChatWidget />
    </div>
  );
}
