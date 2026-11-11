'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/app-shell/BottomNav';
import { NavigationProgress } from '@/components/app-shell/NavigationProgress';
import { Sidebar } from '@/components/Sidebar';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { PendingStaffInviteNotice } from '@/components/staff/PendingStaffInviteNotice';

const SIDEBAR_STORAGE_KEY = 'nkwapa.sidebar.collapsed';

/** AppLayout mounts after KeycloakProvider's client session check, so storage is
 * resolved before paint without disagreeing with server-rendered shell markup.
 * This is a desktop preference; forced tablet/phone layout never writes it. */
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
    // reason to fail to render a clinical workspace; fall through to the expanded desktop default.
  }

  return false;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(resolveInitialSidebarCollapsed);
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1200px)').matches,
  );
  const [animateSidebar, setAnimateSidebar] = useState(false);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1200px)');
    const update = () => {
      setDesktop(desktopQuery.matches);
      setAnimateSidebar(false);
    };
    update();
    desktopQuery.addEventListener('change', update);
    return () => {
      desktopQuery.removeEventListener('change', update);
    };
  }, []);

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

  /*
    `[` collapses and expands the rail, as the label at its foot says. Ignored while typing, with
    a modifier held, or below desktop, where navigation has a fixed presentation.
  */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '[' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
        )
      )
        return;
      if (!window.matchMedia('(min-width: 1200px)').matches) return;
      event.preventDefault();
      setAnimateSidebar(false);
      setSidebarCollapsed((current) => !current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background px-safe [--workspace-bottom-nav-height:3.75rem] compact:[--workspace-bottom-nav-height:0px] [:root[data-keyboard]_&]:[--workspace-bottom-nav-height:var(--keyboard-inset)]">
      <NavigationProgress />
      {/*
        First thing in the tab order, hidden until focused. Without it a keyboard or screen reader
        user walks the whole sidebar and header on every page before reaching the chart.
      */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-sm"
      >
        Skip to main content
      </a>
      {/*
        The canvas is `--background` and nothing else. A two-stop decorative radial gradient used
        to sit behind every clinical page here; it tinted the corners of every chart and table in
        the product for no informational reason.
      */}
      <div className="flex min-h-screen">
        <Sidebar collapsed={desktop && sidebarCollapsed} rail={!desktop} animate={animateSidebar} />
        <div className="flex min-w-0 flex-1 flex-col bg-card compact:my-2 compact:mr-2 compact:rounded-xl compact:border compact:border-border">
          <Header
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={(event) => {
              if (!window.matchMedia('(min-width: 1200px)').matches) return;
              setAnimateSidebar(event.detail > 0);
              setSidebarCollapsed((current) => !current);
            }}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 overflow-auto px-4 py-5 pb-[calc(10rem+env(safe-area-inset-bottom))] compact:pb-[calc(6rem+env(safe-area-inset-bottom))] focus-visible:outline-none compact:px-6 desktop:px-8"
          >
            <div className="mx-auto w-full max-w-[1440px] space-y-6">
              <PendingStaffInviteNotice />
              {children}
            </div>
          </main>
        </div>
      </div>
      <BottomNav />
      <ChatWidget />
    </div>
  );
}
