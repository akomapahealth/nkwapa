'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import type { PatientChartSection, PatientChartSectionId } from '@/lib/patient-chart';
import type { ChartTabsController } from '@/lib/use-chart-tabs';

export interface PatientChartTabsProps {
  sections: readonly PatientChartSection[];
  controller: ChartTabsController;
  /** Renders a section body. Only called for sections that have been opened. */
  renderSection: (section: PatientChartSection) => ReactNode;
}

/**
 * Role-aware chart navigation.
 *
 * Presentational: `useChartTabs` owns the active section, the URL mirroring, and which
 * sections have been opened. A section's body is mounted only after it has been visited,
 * so an unopened tab never fetches its longitudinal data.
 */
export function PatientChartTabs({ sections, controller, renderSection }: PatientChartTabsProps) {
  const { activeTab, openedSections, goToSection } = controller;

  if (sections.length === 0 || !activeTab) {
    return (
      <EmptyStateCard
        title="No chart sections available"
        description="Your role does not include access to any section of this patient chart."
      />
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => goToSection(value as PatientChartSectionId)}
      className="w-full"
    >
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList
          aria-label="Patient chart sections"
          className="w-max justify-start gap-2 rounded-lg border border-border/80 bg-card/75 p-2"
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
