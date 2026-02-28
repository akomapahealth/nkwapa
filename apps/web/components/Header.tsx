"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useSync } from "@/app/ServiceWorkerAndSyncProvider";
import { useKeycloak } from "@/app/KeycloakProvider";
import { db } from "@/lib/db";
import { setStoredActiveClinicId } from "@/lib/bootstrap-storage";
import { LogOut, Building2, User } from "lucide-react";

export function Header() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const { setActiveClinicId } = useBootstrap() ?? {};
  const { isOnline, syncStatus, syncError, syncNow } = useSync();
  const { logout } = useKeycloak() ?? {};
  const [pendingCount, setPendingCount] = useState(0);

  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const memberships = bootstrap?.memberships ?? [];
  const activeMembership = memberships.find((m) => m.clinicId === clinicId);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canSync =
    (perms.includes("*") || perms.includes("SYNC.PUSH")) &&
    (perms.includes("*") || perms.includes("SYNC.PULL"));
  const roles = [
    ...(activeMembership?.roles ?? []),
    ...(bootstrap?.globalRoles ?? []),
  ];

  useEffect(() => {
    if (!clinicId) return;
    const updateCount = async () => {
      const count = await db.outbox.where("clinicId").equals(clinicId).count();
      setPendingCount(count);
    };
    updateCount();
    const interval = setInterval(updateCount, 2000);
    return () => clearInterval(interval);
  }, [clinicId]);

  const handleClinicChange = (value: string) => {
    setStoredActiveClinicId(value);
    setActiveClinicId?.(value);
    if (value) {
      window.location.href = "/queues";
    }
  };

  const handleSync = () => {
    if (clinicId) syncNow(clinicId);
  };

  const initials = bootstrap?.displayName
    ?.split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="text-lg">Nkwapa EMR</span>
      </Link>

      <div className="flex flex-1 items-center justify-end gap-4">
        {memberships.length > 1 && (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={clinicId ?? ""} onValueChange={handleClinicChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select clinic" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.clinicId} value={m.clinicId}>
                    {m.clinicName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {memberships.length === 1 && clinicId && (
          <span className="text-sm text-muted-foreground">
            {activeMembership?.clinicName ?? "Clinic"}
          </span>
        )}

        {roles.length > 0 && (
          <div className="flex items-center gap-1">
            {roles.map((r) => (
              <Badge key={r} variant="secondary" className="text-xs">
                {r}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              isOnline ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-muted-foreground">
            {isOnline ? "Online" : "Offline"}
          </span>
          <span>Pend: {pendingCount}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={!isOnline || syncStatus === "syncing" || !canSync}
          >
            {syncStatus === "syncing" ? "Syncing…" : "Sync"}
          </Button>
          {syncError && (
            <span className="max-w-[120px] truncate text-xs text-destructive">
              {syncError}
            </span>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{bootstrap?.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {bootstrap?.keycloakSub}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/">
                <User className="mr-2 h-4 w-4" />
                Dashboard
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
