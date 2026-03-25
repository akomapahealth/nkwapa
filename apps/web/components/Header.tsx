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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AppNavList } from "@/components/app-shell/AppNavList";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useSync } from "@/app/ServiceWorkerAndSyncProvider";
import { useKeycloak } from "@/app/KeycloakProvider";
import { db } from "@/lib/db";
import { setStoredActiveClinicId } from "@/lib/bootstrap-storage";
import {
  ArrowRightLeft,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  RefreshCw,
  ShieldCheck,
  User,
} from "lucide-react";

export function Header({
  sidebarCollapsed = false,
  onToggleSidebar = () => undefined,
  mobileOpen = false,
  onMobileOpenChange = () => undefined,
}: {
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}) {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const { setActiveClinicId } = bootstrapCtx ?? {};
  const { isOnline, syncStatus, syncError, syncNow } = useSync();
  const { logout } = useKeycloak() ?? {};
  const [pendingCount, setPendingCount] = useState(0);

  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const memberships = bootstrap?.memberships ?? [];
  const activeMembership = memberships.find((membership) => membership.clinicId === clinicId);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canSync =
    (perms.includes("*") || perms.includes("SYNC.PUSH")) &&
    (perms.includes("*") || perms.includes("SYNC.PULL"));
  const roleLabels = [
    ...(activeMembership?.roles ?? []),
    ...(bootstrap?.globalRoles ?? []),
  ].slice(0, 3);

  useEffect(() => {
    if (!clinicId) {
      setPendingCount(0);
      return;
    }

    const updateCount = async () => {
      const count = await db.outbox.where("clinicId").equals(clinicId).count();
      setPendingCount(count);
    };

    void updateCount();
    const interval = window.setInterval(updateCount, 2500);
    return () => window.clearInterval(interval);
  }, [clinicId]);

  const handleClinicChange = (value: string) => {
    setStoredActiveClinicId(value);
    setActiveClinicId?.(value);
    if (value) {
      window.location.href = "/dashboard";
    }
  };

  const handleSync = () => {
    if (clinicId) {
      syncNow(clinicId);
    }
  };

  const initials = bootstrap?.displayName
    ?.split(/\s+/)
    .map((segment) => segment[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[88vw] max-w-[340px] border-border/70 bg-card/95 p-0">
            <SheetHeader className="border-b border-border/70 p-5 text-left">
              <SheetTitle className="text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-lg font-heading font-semibold text-primary-foreground">
                    N
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
                      Nkwapa EMR
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Mobile workspace navigation
                    </p>
                  </div>
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="h-full overflow-y-auto p-4">
              <AppNavList
                bootstrap={bootstrap}
                mobile
                onNavigate={() => onMobileOpenChange(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="hidden md:inline-flex"
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" />
          )}
          <span className="sr-only">Toggle sidebar</span>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden rounded-full px-3 py-1 text-[11px] md:inline-flex">
              Authenticated workspace
            </Badge>
            <p className="truncate text-sm font-medium text-foreground">
              {activeMembership?.clinicName ?? "Choose an active clinic"}
            </p>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Operations, patient records, reminders, and oversight tools in one responsive shell.
          </p>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          {memberships.length > 1 ? (
            <Select value={clinicId ?? ""} onValueChange={handleClinicChange}>
              <SelectTrigger className="h-10 w-[220px] rounded-2xl border-border/70 bg-card/70">
                <SelectValue placeholder="Select clinic" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((membership) => (
                  <SelectItem key={membership.clinicId} value={membership.clinicId}>
                    {membership.clinicName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : clinicId ? (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              {activeMembership?.clinicName ?? "Clinic"}
            </div>
          ) : null}

          {roleLabels.length > 0 && (
            <div className="hidden items-center gap-2 xl:flex">
              {roleLabels.map((role) => (
                <Badge key={role} variant="secondary" className="rounded-full">
                  {role}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-2xl border border-border/70 bg-card/75 px-3 py-2 text-sm md:flex">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isOnline ? "bg-emerald-500" : "bg-destructive"
              }`}
            />
            <span className="text-muted-foreground">
              {isOnline ? "Online" : "Offline"}
            </span>
            <span className="text-muted-foreground">Pending {pendingCount}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={!isOnline || syncStatus === "syncing" || !canSync}
              className="h-8 rounded-xl border-border/70"
            >
              <RefreshCw className={syncStatus === "syncing" ? "animate-spin" : ""} />
              {syncStatus === "syncing" ? "Syncing" : "Sync"}
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-2xl border-border/70">
              <DropdownMenuLabel>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{bootstrap?.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {bootstrap?.keycloakSub}
                    </p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard">
                  <User className="mr-2 h-4 w-4" />
                  Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {syncError ? (
                <>
                  <div className="px-2 py-2 text-xs text-destructive">
                    {syncError}
                  </div>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
