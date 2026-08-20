'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CHART_TAB_PARAM,
  resolveChartTab,
  type PatientChartSection,
  type PatientChartSectionId,
} from '@/lib/patient-chart';

export interface ChartTabsController {
  activeTab: PatientChartSectionId | null;
  /** Sections the user has opened, so a tab is mounted only once it has been visited. */
  openedSections: PatientChartSectionId[];
  goToSection: (id: PatientChartSectionId) => void;
}

/**
 * Mirrors the active chart section into `?tab=` without performing a Next.js navigation.
 *
 * This app is offline-first: `router.replace` would fetch a fresh RSC payload for the route,
 * which fails on a device with no connection and drops the clinician out of the chart.
 * `history.replaceState` keeps the URL shareable and bookmarkable while switching tabs stays
 * a purely local, offline-safe state change.
 */
export function useChartTabs(sections: readonly PatientChartSection[]): ChartTabsController {
  const searchParams = useSearchParams();
  const requested = searchParams.get(CHART_TAB_PARAM);

  const resolvedFromUrl = useMemo(
    () => resolveChartTab(requested, sections),
    [requested, sections],
  );

  const [activeTab, setActiveTab] = useState<PatientChartSectionId | null>(resolvedFromUrl);
  const [openedSections, setOpenedSections] = useState<PatientChartSectionId[]>(() =>
    resolvedFromUrl ? [resolvedFromUrl] : [],
  );

  const writeUrl = useCallback((id: PatientChartSectionId) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(CHART_TAB_PARAM) === id) return;
    params.set(CHART_TAB_PARAM, id);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  const goToSection = useCallback(
    (id: PatientChartSectionId) => {
      setActiveTab(id);
      setOpenedSections((previous) => (previous.includes(id) ? previous : [...previous, id]));
      writeUrl(id);
    },
    [writeUrl],
  );

  // React to a real navigation that changed the tab (deep link, back/forward), but not to
  // the URL rewrites this hook performs itself.
  const lastRequestedRef = useRef(requested);
  useEffect(() => {
    if (requested === lastRequestedRef.current) return;
    lastRequestedRef.current = requested;
    const resolved = resolveChartTab(requested, sections);
    if (resolved) goToSection(resolved);
  }, [goToSection, requested, sections]);

  // Keep the selection valid when the section list changes, e.g. once the server narrows it.
  useEffect(() => {
    if (sections.length === 0) {
      setActiveTab(null);
      return;
    }
    const stillAccessible = activeTab && sections.some((section) => section.id === activeTab);
    if (!stillAccessible) {
      const fallback = resolveChartTab(requested, sections);
      if (fallback) goToSection(fallback);
    }
  }, [activeTab, goToSection, requested, sections]);

  // Normalise an unknown or unauthorised ?tab= so the address bar matches what is shown.
  useEffect(() => {
    if (activeTab) writeUrl(activeTab);
  }, [activeTab, writeUrl]);

  return { activeTab, openedSections, goToSection };
}
