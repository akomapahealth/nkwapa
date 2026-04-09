'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { ChatWidget } from '@/components/chat/ChatWidget';

const SIDEBAR_STORAGE_KEY = 'nkwapa.sidebar.collapsed';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored != null) {
      setSidebarCollapsed(stored === 'true');
      return;
    }

    if (window.matchMedia('(max-width: 1280px)').matches) {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_28%),radial-gradient(circle_at_bottom_right,hsl(var(--secondary)/0.08),transparent_24%)]">
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
            mobileOpen={mobileNavOpen}
            onMobileOpenChange={setMobileNavOpen}
          />
          <main className="min-w-0 flex-1 overflow-auto px-4 py-5 md:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1440px] space-y-6">{children}</div>
          </main>
        </div>
      </div>
      <ChatWidget />
    </div>
  );
}
