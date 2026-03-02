"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { useBootstrap } from "@/lib/bootstrap-context";
import { useSync } from "@/app/ServiceWorkerAndSyncProvider";
import { useKeycloak } from "@/app/KeycloakProvider";
import { db } from "@/lib/db";
import { setStoredActiveClinicId } from "@/lib/bootstrap-storage";
import { cn } from "@/lib/utils";
import {
  LogOut,
  Building2,
  User,
  Menu,
  LayoutDashboard,
  Users,
  ClipboardList,
  FileEdit,
  Shield,
  Settings,
  Bell,
  UserCog,
} from "lucide-react";

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes("*") || permissions.includes(perm);
}

function hasAnyPermission(permissions: string[], perms: string[]): boolean {
  return permissions.includes("*") || perms.some((p) => permissions.includes(p));
}

export function Header() {
  const pathname = usePathname();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const { setActiveClinicId } = useBootstrap() ?? {};
  const { isOnline, syncStatus, syncError, syncNow } = useSync();
  const { logout } = useKeycloak() ?? {};
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const navItems: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    permission?: string;
    anyOf?: string[];
  }[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    {
      href: "/queues",
      label: "Queues",
      icon: ClipboardList,
      anyOf: ["ENCOUNTER.READ", "ENCOUNTER.CREATE", "PRECEPTOR.REVIEW", "DOCTOR.FINALIZE"],
    },
    { href: "/patients", label: "Patients", icon: Users, permission: "PATIENT.SEARCH" },
    { href: "/patients/new", label: "New Patient", icon: FileEdit, permission: "PATIENT.CREATE" },
    { href: "/audit", label: "Audit", icon: Shield, permission: "AUDIT.READ" },
    { href: "/reminders", label: "Reminders", icon: Bell, permission: "REMINDER.READ" },
    { href: "/settings/clinic", label: "Settings", icon: Settings, permission: "RESEARCH.SETTINGS.UPDATE" },
    { href: "/admin/clinics", label: "Clinics", icon: Building2, permission: "CLINIC.MANAGE" },
    { href: "/admin/users", label: "Staff", icon: UserCog, permission: "CLINIC.MANAGE" },
  ];

  const filteredNav = navItems.filter((item) => {
    if (item.anyOf) return hasAnyPermission(perms, item.anyOf);
    return !item.permission || hasPermission(perms, item.permission);
  });

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
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-card px-4 shadow-sm">
      {/* Mobile hamburger */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-card p-0">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle className="font-heading text-lg text-primary">
              Nkwapa EMR
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 p-3">
            {filteredNav.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors touch-target",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <Link href="/" className="flex items-center gap-2">
        <span className="font-heading text-lg font-semibold text-primary">
          Nkwapa EMR
        </span>
      </Link>

      <div className="flex flex-1 items-center justify-end gap-3">
        {memberships.length > 1 && (
          <div className="hidden items-center gap-2 sm:flex">
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
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {activeMembership?.clinicName ?? "Clinic"}
          </span>
        )}

        {roles.length > 0 && (
          <div className="hidden items-center gap-1 md:flex">
            {roles.map((r) => (
              <Badge key={r} variant="secondary" className="text-xs">
                {r}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isOnline ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <span className="hidden text-muted-foreground sm:inline">
            {isOnline ? "Online" : "Offline"}
          </span>
          <span className="hidden sm:inline">Pend: {pendingCount}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={!isOnline || syncStatus === "syncing" || !canSync}
          >
            {syncStatus === "syncing" ? "Syncing…" : "Sync"}
          </Button>
          {syncError && (
            <span className="hidden max-w-[120px] truncate text-xs text-destructive sm:inline">
              {syncError}
            </span>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {initials}
                </AvatarFallback>
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
