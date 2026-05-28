'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Layers3, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { apiFetch } from '@/lib/api';
import { formatRoleLabel, readApiError } from '@/lib/ops';
import { dataGridSx } from '@/lib/datagrid-theme';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { RouteGuard } from '@/components/RouteGuard';
import { EmptyStateCard, InlineNotice } from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type RoleName = 'SYSTEM_ADMIN' | 'DIRECTOR' | 'MANAGER' | 'DOCTOR' | 'VOLUNTEER' | 'PATIENT';

type PortalLinkStatus = 'LINKED' | 'ROLE_ONLY' | 'LINK_ONLY' | 'NONE';
type PortalFilter = 'ALL' | 'MISMATCH' | PortalLinkStatus;

interface PatientPortalLinkState {
  status: PortalLinkStatus;
  patientId: string | null;
  patientCode: string | null;
  clinicId: string | null;
  clinicName: string | null;
}

interface ClinicRosterRow {
  id: string;
  keycloakSub?: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  clinicRoles: RoleName[];
  globalRoles: RoleName[];
  otherClinicCount: number;
}

interface ClinicRosterResponse {
  items: ClinicRosterRow[];
}

interface AllUsersRow {
  id: string;
  keycloakSub: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  globalRoles: RoleName[];
  clinicMemberships: Array<{
    id: string;
    clinicId: string;
    clinicName: string;
    role: RoleName;
  }>;
  patientPortal: PatientPortalLinkState;
}

interface UserRoleRow {
  id: string;
  clinicId: string | null;
  role: RoleName;
  clinicName: string | null;
}

interface StaffAccessRow {
  id: string;
  keycloakSub?: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  clinicRoles: RoleName[];
  globalRoles: RoleName[];
  otherClinicCount: number;
  clinicMemberships: Array<{
    id: string;
    clinicId: string;
    clinicName: string;
    role: RoleName;
  }>;
  patientPortal?: PatientPortalLinkState | null;
}

type StatusFilter = 'active' | 'inactive' | 'all';
type ViewMode = 'clinic' | 'all';

const ROLES: RoleName[] = ['SYSTEM_ADMIN', 'DIRECTOR', 'MANAGER', 'DOCTOR', 'VOLUNTEER', 'PATIENT'];

function statusBadgeVariant(isActive: boolean) {
  return isActive ? 'finalized' : 'destructive';
}

function nameForRow(row: StaffAccessRow) {
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.displayName;
}

function summarizeCurrentAccess(row: StaffAccessRow) {
  if (row.clinicRoles.length === 0) {
    return 'No active-clinic roles';
  }

  return row.clinicRoles.map((role) => formatRoleLabel(role)).join(', ');
}

function summarizeExtraAccess(row: StaffAccessRow) {
  const parts: string[] = [];
  if (row.globalRoles.length > 0) {
    parts.push(`Global: ${row.globalRoles.map((role) => formatRoleLabel(role)).join(', ')}`);
  }
  if (row.otherClinicCount > 0) {
    parts.push(`Other clinics: ${row.otherClinicCount}`);
  }

  return parts.join(' • ') || 'Clinic-local only';
}

function formatAdminTimestamp(value?: string) {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString();
}

function isPortalMismatch(status: PortalLinkStatus) {
  return status === 'ROLE_ONLY' || status === 'LINK_ONLY';
}

function patientPortalMatchesFilter(row: StaffAccessRow, portalFilter: PortalFilter) {
  if (portalFilter === 'ALL') {
    return true;
  }

  if (!row.patientPortal) {
    return false;
  }

  if (portalFilter === 'MISMATCH') {
    return isPortalMismatch(row.patientPortal.status);
  }

  return row.patientPortal.status === portalFilter;
}

function portalStatusLabel(status: PortalLinkStatus) {
  switch (status) {
    case 'LINKED':
      return 'Linked';
    case 'ROLE_ONLY':
      return 'Role only';
    case 'LINK_ONLY':
      return 'Link only';
    case 'NONE':
    default:
      return 'No portal link';
  }
}

function portalStatusVariant(status: PortalLinkStatus) {
  switch (status) {
    case 'LINKED':
      return 'finalized' as const;
    case 'ROLE_ONLY':
      return 'destructive' as const;
    case 'LINK_ONLY':
      return 'warning' as const;
    case 'NONE':
    default:
      return 'outline' as const;
  }
}

function roleMatchesFilter(row: StaffAccessRow, roleFilter: string) {
  if (roleFilter === 'ALL') {
    return true;
  }

  return (
    row.clinicRoles.includes(roleFilter as RoleName) ||
    row.globalRoles.includes(roleFilter as RoleName) ||
    row.clinicMemberships.some((membership) => membership.role === roleFilter)
  );
}

function normalizeClinicRow(row: ClinicRosterRow, clinicId: string, clinicName: string) {
  return {
    id: row.id,
    keycloakSub: row.keycloakSub,
    displayName: row.displayName,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    clinicRoles: row.clinicRoles,
    globalRoles: row.globalRoles,
    otherClinicCount: row.otherClinicCount,
    clinicMemberships: row.clinicRoles.map((role) => ({
      id: `${row.id}-${clinicId}-${role}`,
      clinicId,
      clinicName,
      role,
    })),
    patientPortal: null,
  } satisfies StaffAccessRow;
}

function normalizeAllUsersRow(
  row: AllUsersRow,
  activeClinicId: string | null,
  activeClinicName: string | null,
) {
  const clinicRoles = activeClinicId
    ? row.clinicMemberships
        .filter((membership) => membership.clinicId === activeClinicId)
        .map((membership) => membership.role)
    : [];
  const otherClinicCount = new Set(
    row.clinicMemberships
      .filter((membership) => membership.clinicId !== activeClinicId)
      .map((membership) => membership.clinicId),
  ).size;

  return {
    id: row.id,
    keycloakSub: row.keycloakSub,
    displayName: row.displayName,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    clinicRoles,
    globalRoles: row.globalRoles,
    otherClinicCount,
    clinicMemberships:
      activeClinicId && activeClinicName
        ? [
            ...row.clinicMemberships.filter((membership) => membership.clinicId === activeClinicId),
            ...row.clinicMemberships.filter((membership) => membership.clinicId !== activeClinicId),
          ]
        : row.clinicMemberships,
    patientPortal: row.patientPortal,
  } satisfies StaffAccessRow;
}

export default function AdminUsersPage() {
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const activeClinicId = getBootstrapActiveClinicId(bootstrap);
  const activeMembership =
    bootstrap?.memberships.find((membership) => membership.clinicId === activeClinicId) ?? null;
  const activeClinicName = getActiveBootstrapClinic(bootstrap, activeClinicId)?.clinicName ?? null;
  const isSystemAdmin = bootstrap?.globalRoles?.includes('SYSTEM_ADMIN') ?? false;
  const directorMemberships = (bootstrap?.memberships ?? []).filter((membership) =>
    membership.roles.includes('DIRECTOR'),
  );
  const activeClinicRoles = activeMembership?.roles ?? [];
  const canAssignRoles = isSystemAdmin || directorMemberships.length > 0;
  const canManageLifecycle =
    isSystemAdmin ||
    activeClinicRoles.includes('DIRECTOR') ||
    activeClinicRoles.includes('MANAGER');

  const lifecycleRoles: RoleName[] = isSystemAdmin
    ? ROLES
    : activeClinicRoles.includes('DIRECTOR')
      ? ['MANAGER', 'DOCTOR', 'VOLUNTEER', 'PATIENT']
      : ['DOCTOR', 'VOLUNTEER', 'PATIENT'];
  const assignableRoles: RoleName[] = isSystemAdmin
    ? ['SYSTEM_ADMIN', 'DIRECTOR', 'MANAGER', 'DOCTOR', 'VOLUNTEER']
    : ['MANAGER', 'DOCTOR', 'VOLUNTEER'];

  const [viewMode, setViewMode] = useState<ViewMode>(
    isSystemAdmin && !activeClinicId ? 'all' : 'clinic',
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [portalFilter, setPortalFilter] = useState<PortalFilter>('ALL');
  const [rows, setRows] = useState<StaffAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<StaffAccessRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);
  const [assignRole, setAssignRole] = useState<string>('');
  const [assignClinicId, setAssignClinicId] = useState<string>('');
  const [allClinics, setAllClinics] = useState<Array<{ id: string; name: string }>>([]);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [revokingRole, setRevokingRole] = useState<UserRoleRow | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [mutationLoading, setMutationLoading] = useState(false);

  useEffect(() => {
    if (!isSystemAdmin) {
      setViewMode('clinic');
      return;
    }

    if (!activeClinicId && viewMode === 'clinic') {
      setViewMode('all');
    }
  }, [activeClinicId, isSystemAdmin, viewMode]);

  useEffect(() => {
    if (!isSystemAdmin || viewMode !== 'all') {
      setPortalFilter('ALL');
    }
  }, [isSystemAdmin, viewMode]);

  const fetchAllClinics = useCallback(async () => {
    if (!getToken || !isSystemAdmin) {
      return;
    }

    try {
      const res = await apiFetch('/admin/clinics', {
        getToken,
        skipClinicHeader: true,
      });
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      setAllClinics((await res.json()) as Array<{ id: string; name: string }>);
    } catch {
      setAllClinics([]);
    }
  }, [getToken, isSystemAdmin]);

  const fetchRows = useCallback(
    async (options?: { background?: boolean }) => {
      if (!getToken) {
        return [];
      }

      if (viewMode === 'clinic' && !activeClinicId) {
        setRows([]);
        setLoading(false);
        return [];
      }

      if (options?.background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        if (viewMode === 'clinic' && activeClinicId) {
          const res = await apiFetch(
            `/clinics/${encodeURIComponent(activeClinicId)}/users?status=${encodeURIComponent(
              statusFilter,
            )}`,
            {
              getToken,
              activeClinicId,
            },
          );
          if (!res.ok) {
            throw new Error(await readApiError(res));
          }
          const data = (await res.json()) as ClinicRosterResponse;
          const nextRows = data.items.map((row) =>
            normalizeClinicRow(row, activeClinicId, activeClinicName ?? 'Active clinic'),
          );
          setRows(nextRows);
          return nextRows;
        }

        const res = await apiFetch(`/admin/users?status=${encodeURIComponent(statusFilter)}`, {
          getToken,
          skipClinicHeader: true,
        });
        if (!res.ok) {
          throw new Error(await readApiError(res));
        }
        const data = (await res.json()) as AllUsersRow[];
        const nextRows = data.map((row) =>
          normalizeAllUsersRow(row, activeClinicId, activeClinicName),
        );
        setRows(nextRows);
        return nextRows;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setRows([]);
        return [];
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeClinicId, activeClinicName, getToken, statusFilter, viewMode],
  );

  const fetchUserRoles = useCallback(
    async (userId: string) => {
      if (!getToken) {
        return;
      }

      setDetailLoading(true);
      try {
        const res = await apiFetch(`/admin/users/${encodeURIComponent(userId)}/roles`, {
          getToken,
          skipClinicHeader: true,
        });
        if (!res.ok) {
          throw new Error(await readApiError(res));
        }
        setUserRoles((await res.json()) as UserRoleRow[]);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        setUserRoles([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (isSystemAdmin) {
      void fetchAllClinics();
    }
  }, [fetchAllClinics, isSystemAdmin]);

  const openDetails = (row: StaffAccessRow) => {
    setSelectedUser(row);
    setDetailOpen(true);
    setUserRoles([]);
    setAssignRole('');
    setAssignClinicId(activeClinicId ?? '');
    setError(null);
    void fetchUserRoles(row.id);
  };

  const availableClinics = isSystemAdmin
    ? allClinics
    : directorMemberships.map((membership) => ({
        id: membership.clinicId,
        name: membership.clinicName,
      }));

  const visibleRows = rows.filter(
    (row) => roleMatchesFilter(row, roleFilter) && patientPortalMatchesFilter(row, portalFilter),
  );
  const activeCount = rows.filter((row) => row.isActive).length;
  const inactiveCount = rows.filter((row) => !row.isActive).length;
  const sharedAccessCount = rows.filter(
    (row) => row.globalRoles.length > 0 || row.otherClinicCount > 0,
  ).length;
  const portalMismatchCount = rows.filter(
    (row) => row.patientPortal && isPortalMismatch(row.patientPortal.status),
  ).length;
  const roleOnlyCount = rows.filter((row) => row.patientPortal?.status === 'ROLE_ONLY').length;

  const selectedCurrentClinicRoles = activeClinicId
    ? userRoles.filter((role) => role.clinicId === activeClinicId)
    : [];
  const selectedHasProtectedExternalAccess =
    (selectedUser?.globalRoles.length ?? 0) > 0 || (selectedUser?.otherClinicCount ?? 0) > 0;
  const selectedCanDeactivate = Boolean(
    selectedUser?.isActive &&
    canManageLifecycle &&
    ((viewMode === 'clinic' &&
      activeClinicId &&
      selectedUser.clinicRoles.length > 0 &&
      selectedUser.clinicRoles.every((role) => lifecycleRoles.includes(role)) &&
      (!selectedHasProtectedExternalAccess || isSystemAdmin)) ||
      (viewMode === 'all' && isSystemAdmin)),
  );
  const showPortalFilter = isSystemAdmin && viewMode === 'all';
  const showPortalDetails =
    isSystemAdmin && viewMode === 'all' && Boolean(selectedUser?.patientPortal);

  const columns: GridColDef[] = [
    {
      field: 'displayName',
      headerName: 'Staff member',
      minWidth: 220,
      flex: 1.2,
      valueGetter: (_, row) => nameForRow(row as StaffAccessRow),
      renderCell: (params) => {
        const row = params.row as StaffAccessRow;
        return (
          <div className="flex min-w-0 flex-col py-2">
            <span className="truncate font-medium text-foreground">{nameForRow(row)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.email || 'No email on file'}
            </span>
          </div>
        );
      },
    },
    {
      field: 'isActive',
      headerName: 'Status',
      width: 130,
      sortable: false,
      renderCell: (params) => (
        <Badge variant={statusBadgeVariant(Boolean(params.value))}>
          {params.value ? 'Active' : 'Deactivated'}
        </Badge>
      ),
    },
    {
      field: 'clinicRoles',
      headerName: viewMode === 'clinic' ? 'Current clinic access' : 'Active clinic access',
      minWidth: 220,
      flex: 1,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as StaffAccessRow;
        return <span className="text-sm text-foreground">{summarizeCurrentAccess(row)}</span>;
      },
    },
    {
      field: 'extraAccess',
      headerName: 'Broader access',
      minWidth: 220,
      flex: 1,
      sortable: false,
      valueGetter: (_, row) => summarizeExtraAccess(row as StaffAccessRow),
    },
    ...(showPortalFilter
      ? [
          {
            field: 'patientPortal',
            headerName: 'Portal state',
            minWidth: 160,
            flex: 0.8,
            sortable: false,
            renderCell: (params) => {
              const row = params.row as StaffAccessRow;
              return row.patientPortal ? (
                <Badge variant={portalStatusVariant(row.patientPortal.status)}>
                  {portalStatusLabel(row.patientPortal.status)}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Not available</span>
              );
            },
          } satisfies GridColDef,
        ]
      : []),
    {
      field: 'actions',
      headerName: '',
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openDetails(params.row as StaffAccessRow)}
        >
          Manage
        </Button>
      ),
    },
  ];

  async function refreshAfterMutation(options?: { closeDetail?: boolean }) {
    const nextRows = await fetchRows({ background: true });
    await bootstrapCtx?.refetch?.();

    if (options?.closeDetail || !selectedUser) {
      if (options?.closeDetail) {
        setDetailOpen(false);
        setSelectedUser(null);
      }
      return;
    }

    const refreshedRow = nextRows.find((row) => row.id === selectedUser.id) ?? null;
    if (!refreshedRow) {
      setDetailOpen(false);
      setSelectedUser(null);
      return;
    }

    setSelectedUser(refreshedRow);
    await fetchUserRoles(refreshedRow.id);
  }

  async function handleAssignRole() {
    if (!getToken || !selectedUser || !assignRole) {
      return;
    }
    if (!selectedUser.isActive) {
      setError(
        'This account is inactive. Ask the replacement user to sign in first, then assign roles to the new active account.',
      );
      return;
    }

    const clinicIdForRole = assignRole === 'SYSTEM_ADMIN' ? null : assignClinicId;
    if (assignRole !== 'SYSTEM_ADMIN' && !clinicIdForRole) {
      setError('Select a clinic before assigning this role.');
      return;
    }

    setSavingAssignment(true);
    setError(null);
    setNotice(null);

    try {
      const res = await apiFetch(`/admin/users/${encodeURIComponent(selectedUser.id)}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          clinicId: clinicIdForRole || undefined,
          role: assignRole,
        }),
        getToken,
        skipClinicHeader: true,
      });
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      setAssignRole('');
      setAssignClinicId(activeClinicId ?? '');
      setNotice(`Assigned ${formatRoleLabel(assignRole)} successfully.`);
      await refreshAfterMutation();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSavingAssignment(false);
    }
  }

  async function handleConfirmRoleRevoke() {
    if (!getToken || !selectedUser || !revokingRole || !activeClinicId) {
      return;
    }

    setMutationLoading(true);
    setError(null);
    setNotice(null);

    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(activeClinicId)}/users/${encodeURIComponent(
          selectedUser.id,
        )}/roles/${encodeURIComponent(revokingRole.role)}`,
        {
          method: 'DELETE',
          getToken,
          activeClinicId,
        },
      );
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      setRevokingRole(null);
      setNotice(`Removed ${formatRoleLabel(revokingRole.role)} from the active clinic.`);
      await refreshAfterMutation();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setMutationLoading(false);
    }
  }

  async function handleConfirmDeactivate() {
    if (!getToken || !selectedUser) {
      return;
    }

    setMutationLoading(true);
    setError(null);
    setNotice(null);

    try {
      const useClinicDeactivation = viewMode === 'clinic' && Boolean(activeClinicId);
      const path = useClinicDeactivation
        ? `/clinics/${encodeURIComponent(activeClinicId!)}/users/${encodeURIComponent(
            selectedUser.id,
          )}/deactivate`
        : `/users/${encodeURIComponent(selectedUser.id)}/deactivate`;

      const res = await apiFetch(path, {
        method: 'PATCH',
        getToken,
        ...(useClinicDeactivation ? { activeClinicId } : { skipClinicHeader: true }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      setDeactivateOpen(false);
      setNotice(`${nameForRow(selectedUser)} has been deactivated.`);
      await refreshAfterMutation({ closeDetail: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setMutationLoading(false);
    }
  }

  const emptyState =
    viewMode === 'clinic' && !activeClinicId ? (
      <EmptyStateCard
        title="Select a clinic"
        description="Choose an active clinic in the header to review the roster and manage clinic-scoped access."
      />
    ) : (
      <EmptyStateCard
        title="No staff records match these filters"
        description="Adjust the status or role filters, or wait until the user signs into Nkwapa for the first time."
      />
    );

  return (
    <RouteGuard requiredPermission="CLINIC.MANAGE">
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-primary/15 bg-gradient-to-br from-primary/15 via-card to-secondary/15 p-6 shadow-xl shadow-primary/5">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80">
                Access Lifecycle
              </p>
              <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Staff & Access
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                Manage clinic access and roster status.
              </p>
              <div className="mt-3 max-w-2xl">
                <ProgressiveHelp title="How access changes work">
                  Use Active clinic for day-to-day roster changes, switch to All users when you need
                  cross-clinic or global account checks, and remember that deactivating an account
                  blocks access without removing audit history.
                </ProgressiveHelp>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {isSystemAdmin ? (
                <div className="flex rounded-2xl border border-border/80 bg-card/85 p-1 shadow-sm">
                  <Button
                    type="button"
                    variant={viewMode === 'clinic' ? 'default' : 'ghost'}
                    className="rounded-xl"
                    onClick={() => setViewMode('clinic')}
                    disabled={!activeClinicId}
                  >
                    Active clinic
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === 'all' ? 'default' : 'ghost'}
                    className="rounded-xl"
                    onClick={() => setViewMode('all')}
                  >
                    All users
                  </Button>
                </div>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchRows({ background: true })}
                disabled={refreshing || loading}
                className="h-11 rounded-2xl border-border/80 bg-card/85 px-4"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/80 bg-card/85 p-4 shadow-sm backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Scope
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                {viewMode === 'clinic' ? (activeClinicName ?? 'Clinic roster') : 'All users'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {viewMode === 'clinic'
                  ? 'Current clinic access and lifecycle actions'
                  : 'System-wide visibility for system admin review'}
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-card/85 p-4 shadow-sm backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Visible records
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                {visibleRows.length}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {rows.length} loaded before role filtering
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-card/85 p-4 shadow-sm backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Account status
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                {activeCount} / {inactiveCount}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Active vs deactivated in this dataset
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-card/85 p-4 shadow-sm backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Broader access
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                {sharedAccessCount}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Users with global roles or other-clinic access
              </p>
            </div>
            {showPortalFilter ? (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 shadow-sm backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-900/70">
                  Portal mismatches
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-amber-950">
                  {portalMismatchCount}
                </p>
                <p className="mt-1 text-sm text-amber-900/75">
                  {roleOnlyCount} role-only accounts need linking from the patient chart
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {(rows.length === 0 || rows.length < 3) && !loading ? (
          <InlineNotice>
            New staff rows appear after the person signs in to Nkwapa for the first time.
          </InlineNotice>
        ) : null}
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

        <section className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
          <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Layers3 className="h-5 w-5 text-primary" />
                Filters
              </CardTitle>
              <CardDescription>
                Refine the roster before opening a user’s access panel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="staff-status-filter">Account status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                >
                  <SelectTrigger id="staff-status-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active only</SelectItem>
                    <SelectItem value="inactive">Deactivated only</SelectItem>
                    <SelectItem value="all">All accounts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="staff-role-filter">Role focus</Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger id="staff-role-filter">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All roles</SelectItem>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {formatRoleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showPortalFilter ? (
                <div className="space-y-2">
                  <Label htmlFor="staff-portal-filter">Patient portal state</Label>
                  <Select
                    value={portalFilter}
                    onValueChange={(value) => setPortalFilter(value as PortalFilter)}
                  >
                    <SelectTrigger id="staff-portal-filter">
                      <SelectValue placeholder="Filter by portal state" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All portal states</SelectItem>
                      <SelectItem value="MISMATCH">Mismatch only</SelectItem>
                      <SelectItem value="ROLE_ONLY">Role only</SelectItem>
                      <SelectItem value="LINK_ONLY">Link only</SelectItem>
                      <SelectItem value="LINKED">Linked</SelectItem>
                      <SelectItem value="NONE">No portal access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => {
                    setStatusFilter('active');
                    setRoleFilter('ALL');
                    setPortalFilter('ALL');
                  }}
                >
                  Reset filters
                </Button>
              </div>

              <ActiveFilterSummary
                items={[
                  { label: 'Status', value: statusFilter === 'all' ? null : statusFilter },
                  {
                    label: 'Role',
                    value: roleFilter === 'ALL' ? null : formatRoleLabel(roleFilter as RoleName),
                  },
                  {
                    label: 'Portal',
                    value:
                      showPortalFilter && portalFilter !== 'ALL'
                        ? portalFilter === 'MISMATCH'
                          ? 'Mismatch only'
                          : portalStatusLabel(portalFilter as PortalLinkStatus)
                        : null,
                  },
                ]}
                emptyLabel="Default roster view"
              />

              <ProgressiveHelp title="Safety rules">
                Deactivation is always soft. Audit history, encounters, and clinic records stay in
                place after access is disabled, and patient portal access still has to be linked
                from the patient record rather than from this roster.
              </ProgressiveHelp>

              {isSystemAdmin ? (
                <ProgressiveHelp title="Identity cleanup rules">
                  Keycloak remains the source of truth for identity. If a stale legacy account no
                  longer maps to a real Keycloak user, deactivate that row, have the real user sign
                  in again, and assign access to the newly created active account.
                </ProgressiveHelp>
              ) : null}

              {showPortalFilter ? (
                <ProgressiveHelp title="How to fix portal mismatches">
                  `ROLE_ONLY` and `LINK_ONLY` accounts should be repaired from the patient chart,
                  not from generic role assignment. Use the mismatch filter here to find the row,
                  then relink from the correct patient record.
                </ProgressiveHelp>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
            <CardHeader className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Users className="h-5 w-5 text-primary" />
                    {viewMode === 'clinic' ? 'Clinic roster' : 'All users'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {viewMode === 'clinic'
                      ? activeClinicName
                        ? `Lifecycle controls for ${activeClinicName}.`
                        : 'Choose a clinic to load the roster.'
                      : 'System-wide user visibility for platform administration.'}
                  </CardDescription>
                </div>
                <div className="hidden rounded-2xl border border-border bg-background/80 px-4 py-3 text-right sm:block">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Showing
                  </p>
                  <p className="mt-1 text-xl font-semibold">{visibleRows.length}</p>
                </div>
              </div>
              <ActiveFilterSummary
                items={[
                  {
                    label: 'Scope',
                    value:
                      viewMode === 'clinic' ? (activeClinicName ?? 'Active clinic') : 'All users',
                  },
                  { label: 'Status', value: statusFilter === 'all' ? null : statusFilter },
                  {
                    label: 'Role',
                    value: roleFilter === 'ALL' ? null : formatRoleLabel(roleFilter as RoleName),
                  },
                  {
                    label: 'Portal',
                    value:
                      showPortalFilter && portalFilter !== 'ALL'
                        ? portalFilter === 'MISMATCH'
                          ? 'Mismatch only'
                          : portalStatusLabel(portalFilter as PortalLinkStatus)
                        : null,
                  },
                ]}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="space-y-4">
                  <div className="h-28 animate-pulse rounded-3xl bg-muted" />
                  <div className="h-[420px] animate-pulse rounded-3xl bg-muted" />
                </div>
              ) : visibleRows.length === 0 ? (
                emptyState
              ) : (
                <>
                  <div className="md:hidden space-y-3">
                    {visibleRows.map((row) => (
                      <article
                        key={row.id}
                        className="rounded-3xl border border-border/80 bg-background/80 p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-semibold text-foreground">
                              {nameForRow(row)}
                            </h3>
                            <p className="mt-1 truncate text-sm text-muted-foreground">
                              {row.email || 'No email on file'}
                            </p>
                          </div>
                          <Badge variant={statusBadgeVariant(row.isActive)}>
                            {row.isActive ? 'Active' : 'Deactivated'}
                          </Badge>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {row.clinicRoles.map((role) => (
                            <Badge key={`${row.id}-${role}`} variant="outline">
                              {formatRoleLabel(role)}
                            </Badge>
                          ))}
                          {row.clinicRoles.length === 0 ? (
                            <Badge variant="outline">No clinic role in view</Badge>
                          ) : null}
                          {row.patientPortal ? (
                            <Badge variant={portalStatusVariant(row.patientPortal.status)}>
                              {portalStatusLabel(row.patientPortal.status)}
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-4 rounded-2xl border border-border/70 bg-card/70 p-3 text-sm text-muted-foreground">
                          <p>{summarizeExtraAccess(row)}</p>
                        </div>

                        <Button
                          variant="outline"
                          className="mt-4 w-full"
                          onClick={() => openDetails(row)}
                        >
                          Manage access
                        </Button>
                      </article>
                    ))}
                  </div>

                  <Box
                    sx={{ height: 560, width: '100%' }}
                    className="hidden overflow-x-auto md:block"
                  >
                    <DataGrid
                      rows={visibleRows}
                      columns={columns}
                      getRowId={(row) => row.id}
                      loading={loading}
                      disableRowSelectionOnClick
                      pageSizeOptions={[10, 25, 50]}
                      sx={dataGridSx}
                    />
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <Sheet
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setSelectedUser(null);
            setUserRoles([]);
            setAssignRole('');
            setRevokingRole(null);
            setDeactivateOpen(false);
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto border-border/80 bg-card/95 sm:max-w-2xl">
          <SheetHeader className="pr-10">
            <SheetTitle className="font-heading text-2xl">
              {selectedUser ? nameForRow(selectedUser) : 'Manage access'}
            </SheetTitle>
            <SheetDescription className="leading-6">
              Review clinic access, broader memberships, and safe lifecycle actions before making
              changes.
            </SheetDescription>
          </SheetHeader>

          {selectedUser ? (
            <div className="mt-8 space-y-6">
              <Card className="rounded-[28px] border-border/80 bg-background/70">
                <CardHeader>
                  <CardTitle className="text-lg">Identity and cleanup</CardTitle>
                  <CardDescription>
                    Use identity metadata to confirm whether this is the current sign-in account or
                    a stale legacy record.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Keycloak subject
                    </p>
                    <p className="mt-2 break-all text-sm font-medium text-foreground">
                      {selectedUser.keycloakSub ?? 'Not exposed in this view'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Account lifecycle
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Created {formatAdminTimestamp(selectedUser.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Updated {formatAdminTimestamp(selectedUser.updatedAt)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card/70 p-4 sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Replacement workflow
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      If this account no longer represents a real Keycloak user, deactivate it, ask
                      the real user to sign in again, and assign roles to the newly created active
                      account instead of trying to recreate the old identity manually.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {showPortalDetails ? (
                <Card className="rounded-[28px] border-border/80 bg-background/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Patient portal linkage</CardTitle>
                    <CardDescription>
                      Use this state to spot role-only mismatches and repair access from the correct
                      patient chart.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/80 bg-card/70 p-4">
                      <Badge variant={portalStatusVariant(selectedUser.patientPortal!.status)}>
                        {portalStatusLabel(selectedUser.patientPortal!.status)}
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        {selectedUser.patientPortal!.patientCode
                          ? `${selectedUser.patientPortal!.patientCode} • ${selectedUser.patientPortal!.clinicName ?? 'Linked clinic'}`
                          : 'No linked patient record is currently attached to this account.'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border/80 bg-card/70 p-4 text-sm leading-6 text-muted-foreground">
                      {selectedUser.patientPortal!.status === 'LINKED' ? (
                        <p>
                          This account is linked correctly. If the user still cannot access the
                          portal, verify they are using the intended clinic.
                        </p>
                      ) : selectedUser.patientPortal!.status === 'ROLE_ONLY' ? (
                        <p>
                          This account has a `PATIENT` role but no linked patient record. Open the
                          correct patient chart and use the portal-link action to repair access.
                        </p>
                      ) : selectedUser.patientPortal!.status === 'LINK_ONLY' ? (
                        <p>
                          This account is linked to a patient record but is missing the matching
                          clinic patient role. Re-link from the patient chart to restore the full
                          patient-access bundle safely.
                        </p>
                      ) : (
                        <p>
                          No patient portal access is configured for this user. If this person
                          should use the patient portal, start from the patient chart instead of
                          assigning a generic role here.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="rounded-[28px] border-border/80 bg-background/70">
                <CardHeader>
                  <CardTitle className="text-lg">Account status</CardTitle>
                  <CardDescription>
                    Lifecycle changes affect sign-in access globally.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {selectedUser.email || 'No email on file'}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {selectedUser.globalRoles.length > 0 || selectedUser.otherClinicCount > 0
                        ? 'This user also has broader system access outside the active clinic.'
                        : 'This account is currently scoped to clinic-local access.'}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(selectedUser.isActive)}>
                    {selectedUser.isActive ? 'Active' : 'Deactivated'}
                  </Badge>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-border/80 bg-background/70">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {viewMode === 'clinic' ? 'Current clinic access' : 'Active clinic access'}
                  </CardTitle>
                  <CardDescription>
                    Role removal stays clinic-local and does not delete history.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {detailLoading ? (
                    <div className="h-24 animate-pulse rounded-2xl bg-muted" />
                  ) : selectedCurrentClinicRoles.length > 0 ? (
                    selectedCurrentClinicRoles.map((role) => {
                      const canRevokeRole = Boolean(
                        canManageLifecycle && activeClinicId && lifecycleRoles.includes(role.role),
                      );

                      return (
                        <div
                          key={role.id}
                          className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {formatRoleLabel(role.role)}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {role.clinicName ?? activeClinicName ?? 'Active clinic'}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canRevokeRole || mutationLoading}
                            onClick={() => setRevokingRole(role)}
                          >
                            Remove role
                          </Button>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyStateCard
                      title="No roles in the active clinic"
                      description="Switch the header clinic or open the clinic roster view to manage a different clinic-scoped membership."
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-border/80 bg-background/70">
                <CardHeader>
                  <CardTitle className="text-lg">Broader access summary</CardTitle>
                  <CardDescription>
                    Use this section to spot global roles or memberships outside the clinic before
                    deactivating the account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {detailLoading ? (
                    <div className="h-24 animate-pulse rounded-2xl bg-muted" />
                  ) : userRoles.length > 0 ? (
                    userRoles.map((role) => (
                      <div
                        key={role.id}
                        className="rounded-2xl border border-border/80 bg-card/70 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={role.clinicId === null ? 'secondary' : 'outline'}>
                            {formatRoleLabel(role.role)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {role.clinicId === null
                              ? 'Global scope'
                              : (role.clinicName ?? 'Clinic access')}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyStateCard
                      title="No role records found"
                      description="This usually means the user has not been granted any clinic or global access yet."
                    />
                  )}
                </CardContent>
              </Card>

              {canAssignRoles ? (
                <Card className="rounded-[28px] border-border/80 bg-background/70">
                  <CardHeader>
                    <CardTitle className="text-lg">Assign a new role</CardTitle>
                    <CardDescription>
                      Directors can assign roles only for clinics they direct. System Admins can
                      assign staff and admin roles here.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <InlineNotice>
                      Patient access is granted from the patient record portal-link action. It is
                      intentionally excluded from generic role assignment here.
                    </InlineNotice>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,180px),minmax(0,1fr),auto]">
                      <div className="space-y-2">
                        <Label htmlFor="staff-assign-role">Role</Label>
                        <Select value={assignRole} onValueChange={setAssignRole}>
                          <SelectTrigger id="staff-assign-role">
                            <SelectValue placeholder="Choose role" />
                          </SelectTrigger>
                          <SelectContent>
                            {assignableRoles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {formatRoleLabel(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {assignRole && assignRole !== 'SYSTEM_ADMIN' ? (
                        <div className="space-y-2">
                          <Label htmlFor="staff-assign-clinic">Clinic</Label>
                          <Select value={assignClinicId} onValueChange={setAssignClinicId}>
                            <SelectTrigger id="staff-assign-clinic">
                              <SelectValue placeholder="Select clinic" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableClinics.map((clinic) => (
                                <SelectItem key={clinic.id} value={clinic.id}>
                                  {clinic.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="staff-assign-context">Context</Label>
                          <Input id="staff-assign-context" value="Global role" readOnly disabled />
                        </div>
                      )}

                      <div className="flex items-end">
                        <Button
                          onClick={() => void handleAssignRole()}
                          disabled={
                            savingAssignment ||
                            !selectedUser.isActive ||
                            !assignRole ||
                            (assignRole !== 'SYSTEM_ADMIN' && !assignClinicId)
                          }
                          className="w-full sm:w-auto"
                        >
                          {savingAssignment ? 'Adding...' : 'Add role'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="rounded-[28px] border-destructive/20 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                    <ShieldAlert className="h-5 w-5 text-destructive" />
                    Deactivate account
                  </CardTitle>
                  <CardDescription>
                    This blocks API and app access without deleting audit or clinical history.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedHasProtectedExternalAccess && !isSystemAdmin && viewMode === 'clinic' ? (
                    <InlineNotice tone="error">
                      Only System Admin can deactivate users who still have global roles or access
                      in other clinics.
                    </InlineNotice>
                  ) : null}
                  {selectedUser.clinicRoles.some((role) => !lifecycleRoles.includes(role)) &&
                  !isSystemAdmin ? (
                    <InlineNotice tone="error">
                      This user holds a role above your clinic lifecycle authority in the active
                      clinic.
                    </InlineNotice>
                  ) : null}
                  <Button
                    variant="destructive"
                    onClick={() => setDeactivateOpen(true)}
                    disabled={!selectedCanDeactivate || mutationLoading}
                    className="w-full sm:w-auto"
                  >
                    Deactivate account
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(revokingRole)} onOpenChange={(open) => !open && setRevokingRole(null)}>
        <DialogContent className="max-w-lg rounded-[28px] border-border/80">
          <DialogHeader>
            <DialogTitle>Remove clinic role</DialogTitle>
            <DialogDescription className="leading-6">
              This removes the selected role from the active clinic only. Audit history stays intact
              and any other clinic or global access remains untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border/80 bg-card/70 p-4 text-sm">
            <p className="font-medium text-foreground">
              {selectedUser ? nameForRow(selectedUser) : 'Selected user'}
            </p>
            <p className="mt-1 text-muted-foreground">
              {revokingRole ? formatRoleLabel(revokingRole.role) : 'Role'}
              {activeClinicName ? ` • ${activeClinicName}` : ''}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRevokingRole(null)}
              disabled={mutationLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmRoleRevoke()}
              disabled={mutationLoading}
            >
              {mutationLoading ? 'Removing...' : 'Remove role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent className="max-w-lg rounded-[28px] border-border/80">
          <DialogHeader>
            <DialogTitle>Deactivate account</DialogTitle>
            <DialogDescription className="leading-6">
              This sets the user to inactive and blocks API access globally. Existing audit logs,
              encounters, and clinic records are preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-foreground">
              {selectedUser ? nameForRow(selectedUser) : 'Selected user'}
            </p>
            <p className="mt-1 text-muted-foreground">
              {viewMode === 'clinic' && activeClinicName
                ? `Requested from ${activeClinicName}; impact remains global.`
                : 'This action applies to the account across all clinic access.'}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeactivateOpen(false)}
              disabled={mutationLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDeactivate()}
              disabled={mutationLoading || !selectedCanDeactivate}
            >
              {mutationLoading ? 'Deactivating...' : 'Deactivate account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RouteGuard>
  );
}
