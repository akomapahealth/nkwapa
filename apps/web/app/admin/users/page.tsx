"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useBootstrap } from "@/lib/bootstrap-context";
import { apiFetch } from "@/lib/api";
import { RouteGuard } from "@/components/RouteGuard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Box } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { dataGridSx } from "@/lib/datagrid-theme";

interface UserRow {
  id: string;
  keycloakSub: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
}

interface UserRoleRow {
  id: string;
  clinicId: string | null;
  role: string;
  clinicName: string | null;
}

const ROLES = [
  "SYSTEM_ADMIN",
  "DIRECTOR",
  "MANAGER",
  "DOCTOR",
  "PRECEPTOR",
  "VOLUNTEER",
] as const;

export default function AdminUsersPage() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinics = bootstrap?.memberships ?? [];
  const isSystemAdmin = bootstrap?.globalRoles?.includes("SYSTEM_ADMIN") ?? false;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);
  const [assignClinicId, setAssignClinicId] = useState<string>("");
  const [assignRole, setAssignRole] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [allClinics, setAllClinics] = useState<{ id: string; name: string }[]>([]);

  const fetchUsers = useCallback(async () => {
    if (!getToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/admin/users", {
        getToken,
        skipClinicHeader: true,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as UserRow[];
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const fetchUserRoles = useCallback(
    async (userId: string) => {
      if (!getToken) return;
      try {
        const res = await apiFetch(`/admin/users/${encodeURIComponent(userId)}/roles`, {
          getToken,
          skipClinicHeader: true,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as UserRoleRow[];
        setUserRoles(data);
      } catch (e) {
        setUserRoles([]);
      }
    },
    [getToken]
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const fetchClinics = useCallback(async () => {
    if (!getToken) return;
    try {
      const res = await apiFetch("/admin/clinics", {
        getToken,
        skipClinicHeader: true,
      });
      if (!res.ok) return;
      const data = (await res.json()) as { id: string; name: string }[];
      setAllClinics(data);
    } catch {
      setAllClinics([]);
    }
  }, [getToken]);

  const handleAssignOpen = (user: UserRow) => {
    setSelectedUser(user);
    setAssignClinicId("");
    setAssignRole("");
    setUserRoles([]);
    setAssignOpen(true);
    fetchUserRoles(user.id);
    if (isSystemAdmin) fetchClinics();
  };

  const handleAssignRole = async () => {
    if (!getToken || !selectedUser) return;
    const clinicId = assignRole === "SYSTEM_ADMIN" ? null : assignClinicId;
    if (assignRole !== "SYSTEM_ADMIN" && !clinicId) {
      setError("Select a clinic for this role");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/admin/users/${encodeURIComponent(selectedUser.id)}/roles`,
        {
          method: "POST",
          body: JSON.stringify({
            clinicId: clinicId || undefined,
            role: assignRole,
          }),
          getToken,
          skipClinicHeader: true,
        }
      );
      if (!res.ok) throw new Error(await res.text());
      setAssignClinicId("");
      setAssignRole("");
      await fetchUserRoles(selectedUser.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRole = async (userId: string, clinicId: string | null, role: string) => {
    if (!getToken) return;
    if (!confirm("Remove this role?")) return;
    setError(null);
    try {
      const params = new URLSearchParams();
      if (clinicId) params.set("clinicId", clinicId);
      params.set("role", role);
      const res = await apiFetch(
        `/admin/users/${encodeURIComponent(userId)}/roles?${params.toString()}`,
        {
          method: "DELETE",
          getToken,
          skipClinicHeader: true,
        }
      );
      if (!res.ok) throw new Error(await res.text());
      if (selectedUser?.id === userId) {
        await fetchUserRoles(userId);
      }
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const availableClinics = isSystemAdmin
    ? allClinics.map((c) => ({ clinicId: c.id, clinicName: c.name }))
    : clinics.filter((m) => m.roles.includes("DIRECTOR"));

  const displayFirstName = (row: UserRow) =>
    row.firstName ?? (row.displayName ? row.displayName.split(" ")[0] ?? row.displayName : "");
  const displayLastName = (row: UserRow) =>
    row.lastName ?? (row.displayName ? row.displayName.split(" ").slice(1).join(" ") ?? "" : "");

  const columns: GridColDef[] = [
    {
      field: "firstName",
      headerName: "First name",
      flex: 1,
      minWidth: 120,
      valueGetter: (_, row) => displayFirstName(row as UserRow),
    },
    {
      field: "lastName",
      headerName: "Last name",
      flex: 1,
      minWidth: 120,
      valueGetter: (_, row) => displayLastName(row as UserRow),
    },
    {
      field: "email",
      headerName: "Email",
      flex: 1,
      minWidth: 180,
      valueGetter: (value: string | null) => value || "—",
    },
    {
      field: "actions",
      headerName: "",
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAssignOpen(params.row as UserRow)}
        >
          Manage roles
        </Button>
      ),
    },
  ];

  return (
    <RouteGuard requiredPermission="CLINIC.MANAGE">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold font-heading">Staff & Roles</h1>
        {(users.length === 0 || users.length < 3) && !loading && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
            Users appear here after they log in to Nkwapa at least once. If you created a user in Keycloak, have them log in first, then refresh this page.
          </div>
        )}
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Box sx={{ height: 400, width: "100%" }} className="overflow-x-auto">
          <DataGrid
            rows={users}
            columns={columns}
            loading={loading}
            getRowId={(row) => row.id}
            sx={dataGridSx}
          />
        </Box>
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Manage roles
            {selectedUser
              ? ` — ${[displayFirstName(selectedUser), displayLastName(selectedUser)].filter(Boolean).join(" ") || selectedUser.displayName}`
              : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="mb-2 block">Current roles</Label>
              {userRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No roles assigned</p>
              ) : (
                <ul className="space-y-2">
                  {userRoles.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span>
                        {r.role}
                        {r.clinicName && ` @ ${r.clinicName}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() =>
                          handleRemoveRole(selectedUser!.id, r.clinicId, r.role)
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <Label>Assign new role</Label>
              <div className="flex gap-2">
                <Select value={assignRole} onValueChange={setAssignRole}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignRole && assignRole !== "SYSTEM_ADMIN" && (
                  <Select value={assignClinicId} onValueChange={setAssignClinicId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Clinic" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableClinics.map((c) => (
                        <SelectItem key={c.clinicId} value={c.clinicId}>
                          {c.clinicName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  onClick={handleAssignRole}
                  disabled={saving || !assignRole || (assignRole !== "SYSTEM_ADMIN" && !assignClinicId)}
                >
                  {saving ? "Adding…" : "Add"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </RouteGuard>
  );
}
