'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { hasPermission } from '@/lib/ops';
import { useReviewWaitingCount } from '@/lib/stations';
import { cn } from '@/lib/utils';

/** A number on a nav item, with the words a screen reader hears after the item's name. */
export interface NavBadge {
  count: number;
  label: string;
}

const NavBadgesContext = createContext<Partial<Record<string, NavBadge>>>({});

/**
 * Counts shown on nav items, keyed by href, read once for the whole shell so the sidebar, the
 * phone bar and the More sheet never poll separately. Today: patients waiting at review (#419).
 */
export function NavBadgesProvider({ children }: { children: ReactNode }) {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const canWork =
    isWebFeatureEnabled('stationWorkflow') &&
    hasPermission(bootstrap?.effectivePermissionsForActiveClinic ?? [], 'OPS.STATION.WORK');
  const reviewWaiting = useReviewWaitingCount(clinicId, getToken, canWork);
  const badges = useMemo(
    () =>
      reviewWaiting
        ? { '/stations': { count: reviewWaiting, label: `${reviewWaiting} waiting for review` } }
        : {},
    [reviewWaiting],
  );
  return <NavBadgesContext.Provider value={badges}>{children}</NavBadgesContext.Provider>;
}

export function useNavBadges(): Partial<Record<string, NavBadge>> {
  return useContext(NavBadgesContext);
}

/** The accessible name of a nav item with its count: "Stations, 4 waiting for review". */
export const navItemLabel = (label: string, badge: NavBadge | undefined) =>
  badge ? `${label}, ${badge.label}` : label;

/** The count itself, hidden from assistive technology: the item's name already says it. */
export function NavBadgeCount({ badge, className }: { badge?: NavBadge; className?: string }) {
  if (!badge) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="nav-badge"
      className={cn(
        'flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none tabular-nums text-primary-foreground',
        className,
      )}
    >
      {badge.count > 99 ? '99+' : badge.count}
    </span>
  );
}
