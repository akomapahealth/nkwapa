"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBootstrap } from "@/lib/bootstrap-context";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileEdit,
  Shield,
  Settings,
  Bell,
  Building2,
  UserCog,
} from "lucide-react";

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes("*") || permissions.includes(perm);
}

function hasAnyPermission(permissions: string[], perms: string[]): boolean {
  return permissions.includes("*") || perms.some((p) => permissions.includes(p));
}

export function Sidebar() {
  const pathname = usePathname();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];

  const navItems: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    permission?: string;
    anyOf?: string[];
  }[] = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
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

  const filtered = navItems.filter((item) => {
    if (item.anyOf) return hasAnyPermission(perms, item.anyOf);
    return !item.permission || hasPermission(perms, item.permission!);
  });

  return (
    <aside className="hidden w-48 flex-col border-r bg-muted/30 md:flex">
      <nav className="flex flex-col gap-1 p-2">
        {filtered.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const isAdminRoute = item.href.startsWith("/admin");
          const href = clinicId || item.href === "/" || isAdminRoute ? item.href : "#";
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                !clinicId && item.href !== "/" && !isAdminRoute && "pointer-events-none opacity-50"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
