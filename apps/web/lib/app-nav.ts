import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  FileEdit,
  LayoutDashboard,
  Settings,
  Shield,
  Stethoscope,
  UserCog,
  Users,
} from 'lucide-react';
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
        description: 'Role-aware analytics and clinic insight.',
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
        description: 'Check-ins, assignments, and live flow.',
        icon: CalendarDays,
        permission: 'OPS.CHECKIN.READ',
        requiresClinic: true,
      },
      {
        href: '/my/assigned',
        label: 'My Assigned',
        description: 'Shift work and patient handoffs.',
        icon: Stethoscope,
        permission: 'OPS.ASSIGNMENT.READ_SELF',
        requiresClinic: true,
      },
      {
        href: '/queues',
        label: 'Queues',
        description: 'Draft, review, and finalization pipelines.',
        icon: ClipboardList,
        anyOf: ['ENCOUNTER.READ', 'ENCOUNTER.CREATE', 'PRECEPTOR.REVIEW', 'DOCTOR.FINALIZE'],
        requiresClinic: true,
      },
      {
        href: '/patients',
        label: 'Patients',
        description: 'Search and manage the clinic patient list.',
        icon: Users,
        permission: 'PATIENT.SEARCH',
        requiresClinic: true,
      },
      {
        href: '/patients/new',
        label: 'New Patient',
        description: 'Register a patient into the active clinic.',
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
        description: 'Trace clinical and admin activity.',
        icon: Shield,
        permission: 'AUDIT.READ',
        requiresClinic: true,
      },
      {
        href: '/reminders',
        label: 'Reminders',
        description: 'Review queued and delivered follow-up outreach.',
        icon: Bell,
        permission: 'REMINDER.READ',
        requiresClinic: true,
      },
      {
        href: '/settings/clinic',
        label: 'Settings',
        description: 'Clinic-level research and platform controls.',
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
        description: 'Create and manage clinic environments.',
        icon: Building2,
        permission: 'CLINIC.MANAGE',
        directorOrSystemAdminOnly: true,
      },
      {
        href: '/admin/users',
        label: 'Staff',
        description: 'Roles, lifecycle actions, and access cleanup.',
        icon: UserCog,
        permission: 'CLINIC.MANAGE',
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
  const clinicId = bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const memberships = bootstrap?.memberships ?? [];
  const activeMembership = memberships.find((membership) => membership.clinicId === clinicId);
  const isSystemAdmin = bootstrap?.globalRoles?.includes('SYSTEM_ADMIN') ?? false;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canAccessClinicAdmin =
    isSystemAdmin || (activeMembership?.roles.includes('DIRECTOR') ?? false);

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
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

export function isNavItemActive(pathname: string, item: AppNavItem, clinicId: string | null) {
  const resolvedHref = getNavItemHref(item, clinicId);
  return (
    pathname === resolvedHref ||
    pathname.startsWith(`${resolvedHref}/`) ||
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`)
  );
}
