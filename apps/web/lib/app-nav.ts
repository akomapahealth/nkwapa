import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  CopyCheck,
  FileEdit,
  LayoutDashboard,
  Network,
  Settings,
  Shield,
  Stethoscope,
  UserCog,
  Users,
} from 'lucide-react';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import type { WhoAmIResponse } from '@/lib/bootstrap-context';

export interface AppNavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  permission?: string;
  anyOf?: string[];
  requiresClinic?: boolean;
  directorOrSystemAdminOnly?: boolean;
  /**
   * Visible to a global system administrator only, whatever permissions the active clinic grants.
   * For views that span clinics: a director holds the item's permission at their own clinic, but
   * the API refuses them anything wider, so showing the link would only lead to a refusal.
   */
  systemAdminOnly?: boolean;
}

export interface AppNavSection {
  id: string;
  label: string;
  items: AppNavItem[];
}

const NAV_SECTIONS: AppNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        description: 'Snapshot and trends.',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: 'care',
    label: 'Care Delivery',
    items: [
      {
        href: '/today',
        label: 'Today Board',
        description: 'Check-ins and assignments.',
        icon: CalendarDays,
        permission: 'OPS.CHECKIN.READ',
        requiresClinic: true,
      },
      {
        href: '/my/assigned',
        label: 'My Assigned',
        description: 'Your next tasks.',
        icon: Stethoscope,
        permission: 'OPS.ASSIGNMENT.READ_SELF',
        requiresClinic: true,
      },
      {
        href: '/queues',
        label: 'Queues',
        description: 'Drafts, reviews, sign-off.',
        icon: ClipboardList,
        anyOf: ['ENCOUNTER.READ', 'ENCOUNTER.CREATE', 'ENCOUNTER.REVIEW', 'DOCTOR.FINALIZE'],
        requiresClinic: true,
      },
      {
        href: '/patients',
        label: 'Patients',
        description: 'Find and open records.',
        icon: Users,
        permission: 'PATIENT.SEARCH',
        requiresClinic: true,
      },
      {
        href: '/appointments',
        label: 'Appointments',
        description: 'Schedule by day or week.',
        icon: CalendarDays,
        permission: 'APPOINTMENT.READ',
        requiresClinic: true,
      },
      {
        href: '/patients/new',
        label: 'New Patient',
        description: 'Add a new patient.',
        icon: FileEdit,
        permission: 'PATIENT.CREATE',
        requiresClinic: true,
      },
    ],
  },
  {
    id: 'governance',
    label: 'Oversight',
    items: [
      {
        href: '/audit',
        label: 'Audit',
        description: 'Activity history.',
        icon: Shield,
        permission: 'AUDIT.READ',
        requiresClinic: true,
      },
      {
        href: '/metrics',
        label: 'Metrics',
        description: 'Workflow conversion and failures.',
        icon: BarChart3,
        permission: 'METRICS.READ',
        requiresClinic: true,
      },
      {
        href: '/notifications',
        label: 'Notifications',
        description: 'Outbound message delivery.',
        icon: Bell,
        permission: 'REMINDER.READ',
        requiresClinic: true,
      },
      {
        href: '/settings/clinic',
        label: 'Settings',
        description: 'Clinic controls.',
        icon: Settings,
        permission: 'RESEARCH.SETTINGS.UPDATE',
        requiresClinic: true,
      },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      {
        href: '/admin/clinics',
        label: 'Clinics',
        description: 'Clinic setup.',
        icon: Building2,
        permission: 'CLINIC.MANAGE',
        directorOrSystemAdminOnly: true,
      },
      {
        href: '/admin/users',
        label: 'Staff',
        description: 'Roles and access.',
        icon: UserCog,
        permission: 'CLINIC.MANAGE',
      },
      {
        href: '/admin/duplicates',
        label: 'Duplicate review',
        description: 'Charts that may be the same person.',
        icon: CopyCheck,
        permission: 'PATIENT.DUPLICATE.REVIEW',
      },
      {
        href: '/admin/duplicates/cross-clinic',
        label: 'Cross-clinic duplicates',
        description: 'How many charts may be duplicated across clinics.',
        icon: Network,
        permission: 'PATIENT.DUPLICATE.REVIEW',
        systemAdminOnly: true,
      },
    ],
  },
];

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes('*') || permissions.includes(perm);
}

function hasAnyPermission(permissions: string[], perms: string[]): boolean {
  return permissions.includes('*') || perms.some((perm) => permissions.includes(perm));
}

export function getAccessibleNavSections(bootstrap: WhoAmIResponse | null): AppNavSection[] {
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const memberships = bootstrap?.memberships ?? [];
  const activeMembership = memberships.find((membership) => membership.clinicId === clinicId);
  const isSystemAdmin = bootstrap?.globalRoles?.includes('SYSTEM_ADMIN') ?? false;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canAccessClinicAdmin =
    isSystemAdmin || (activeMembership?.roles.includes('DIRECTOR') ?? false);

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.systemAdminOnly && !isSystemAdmin) {
        return false;
      }
      if (item.directorOrSystemAdminOnly && !canAccessClinicAdmin) {
        return false;
      }
      if (item.anyOf) {
        return hasAnyPermission(perms, item.anyOf);
      }
      return !item.permission || hasPermission(perms, item.permission);
    }),
  })).filter((section) => section.items.length > 0);
}

export function getNavItemHref(item: AppNavItem, clinicId: string | null) {
  if (item.requiresClinic && !clinicId) {
    return '#';
  }
  if (clinicId && item.href === '/patients') {
    return `/clinics/${clinicId}/patients`;
  }
  if (clinicId && item.href === '/patients/new') {
    return `/clinics/${clinicId}/patients/new`;
  }
  return item.href;
}

function pathMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

/**
 * Whether an item is the current page.
 *
 * A nested destination owns its own highlight. Without that, `/admin/duplicates/cross-clinic`
 * lit up both itself and the review queue above it, and `/patients/new` both itself and Patients:
 * two links announced as the current page, which tells a screen reader user nothing.
 */
export function isNavItemActive(pathname: string, item: AppNavItem, clinicId: string | null) {
  const hrefs = (navItem: AppNavItem) => [getNavItemHref(navItem, clinicId), navItem.href];
  const own = hrefs(item);
  if (!own.some((href) => pathMatches(pathname, href))) return false;

  return !ALL_NAV_ITEMS.some(
    (other) =>
      other !== item &&
      hrefs(other).some(
        (otherHref) =>
          own.some((href) => otherHref.startsWith(`${href}/`)) && pathMatches(pathname, otherHref),
      ),
  );
}
