'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import {
  CHART_TAB_PARAM,
  resolveChartTab,
  type PatientChartSection,
  type PatientChartSectionId,
} from '@/lib/patient-chart';

export interface PatientChartTabsProps {
  sections: readonly PatientChartSection[];
  /** Renders the body for a section. Only ever called for sections already opened. */
  renderSection: (section: PatientChartSection) => ReactNode;
  /** Notified whenever the active section changes, for analytics or prefetching. */
  onSectionChange?: (section: PatientChartSectionId) => void;
}

/**
 * Role-aware, deep-linkable chart navigation.
 *
 * Three behaviours the previous implementation lacked:
 * - the active tab lives in `?tab=`, so a section can be linked, bookmarked, and restored
 * - a section's body is only mounted once it has been opened, so inactive tabs never fetch
 * - an unknown or unauthorised `?tab=` falls back instead of rendering an empty chart
 */
export function PatientChartTabs({
  sections,
  renderSection,
  onSectionChange,
}: PatientChartTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get(CHART_TAB_PARAM);

  const activeTab = useMemo(
    () => resolveChartTab(requestedTab, sections),
    [requestedTab, sections],
  );

  // Sections the user has actually opened. Mounting is sticky so switching back to a tab
  // does not refetch, while a tab never opened is never mounted at all.
  const [openedSections, setOpenedSections] = useState<PatientChartSectionId[]>(() =>
    activeTab ? [activeTab] : [],
  );

  useEffect(() => {
    if (!activeTab) return;
    setOpenedSections((previous) =>
      previous.includes(activeTab) ? previous : [...previous, activeTab],
    );
  }, [activeTab]);

  // Normalise the URL when it names a tab this user cannot open, so the address bar
  // always reflects what is actually being shown.
  const normalisedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTab || requestedTab === activeTab) return;
    const target = `${pathname}?${CHART_TAB_PARAM}=${activeTab}`;
    if (normalisedRef.current === target) return;
    normalisedRef.current = target;
    router.replace(target, { scroll: false });
  }, [activeTab, pathname, requestedTab, router]);

  const handleValueChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(CHART_TAB_PARAM, value);
      normalisedRef.current = null;
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      onSectionChange?.(value as PatientChartSectionId);
    },
    [onSectionChange, pathname, router, searchParams],
  );

  if (sections.length === 0 || !activeTab) {
    return (
      <EmptyStateCard
        title="No chart sections available"
        description="Your role does not include access to any section of this patient chart."
      />
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={handleValueChange} className="w-full">
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList
          aria-label="Patient chart sections"
          className="min-h-11 w-max justify-start gap-2 rounded-3xl border border-border/80 bg-card/75 p-2"
        >
          {sections.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              title={section.description}
              className="min-h-9 cursor-pointer"
            >
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {sections.map((section) => (
        <TabsContent key={section.id} value={section.id} className="mt-4">
          {openedSections.includes(section.id) ? renderSection(section) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
