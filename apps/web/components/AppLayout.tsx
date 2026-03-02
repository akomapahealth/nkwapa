"use client";

import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-clinical-grid p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
