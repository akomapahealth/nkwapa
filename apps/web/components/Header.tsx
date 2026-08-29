'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InfoHint } from '@/components/ui/info-hint';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useTheme, type ThemePreference } from '@/lib/theme-context';
import { AppNavList } from '@/components/app-shell/AppNavList';
import { useBootstrap } from '@/lib/bootstrap-context';
import { formatRoleLabel, getVisibleRoleLabels } from '@/lib/ops';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useKeycloak } from '@/app/KeycloakProvider';
import { db } from '@/lib/db';
import { getActiveBootstrapClinic, getSwitchableClinics } from '@/lib/bootstrap-clinics';
import { setStoredActiveClinicId } from '@/lib/bootstrap-storage';
import { useToast } from '@/components/ui/toast';
import {
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';

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
  const { activeClinicId: contextActiveClinicId, setActiveClinicId } = bootstrapCtx ?? {};
  const { isOnline, syncStatus, syncError, syncNow } = useSync();
  const { logout } = useKeycloak() ?? {};
  const { showToast } = useToast();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const [pendingCount, setPendingCount] = useState(0);
  const router = useRouter();

  const clinicId = contextActiveClinicId ?? null;
  const memberships = bootstrap?.memberships ?? [];
  const switchableClinics = getSwitchableClinics(bootstrap);
  const activeClinic = getActiveBootstrapClinic(bootstrap, clinicId);
  const activeMembership = memberships.find((membership) => membership.clinicId === clinicId);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canSync =
    (perms.includes('*') || perms.includes('SYNC.PUSH')) &&
    (perms.includes('*') || perms.includes('SYNC.PULL'));
  const roleLabels = getVisibleRoleLabels(activeMembership?.roles, bootstrap?.globalRoles);

  useEffect(() => {
    if (!clinicId) {
      setPendingCount(0);
      return;
    }

    const updateCount = async () => {
      const count = await db.outbox.where('clinicId').equals(clinicId).count();
      setPendingCount(count);
    };

    void updateCount();
    const interval = window.setInterval(updateCount, 2500);
    return () => window.clearInterval(interval);
  }, [clinicId]);

  const handleClinicChange = (value: string) => {
    const nextClinic = switchableClinics.find((clinic) => clinic.clinicId === value);
    setStoredActiveClinicId(value);
    setActiveClinicId?.(value);
    showToast({
      tone: 'loading',
      title: nextClinic ? `Switching to ${nextClinic.clinicName}` : 'Switching clinic',
      description: 'Refreshing clinic-scoped queues, dashboard data, and records.',
      durationMs: 1800,
    });
    if (value) {
      /*
        A client navigation, not `window.location.href`.

        Switching clinic used to hard-reload the whole document after a 180ms timeout, which threw
        away the Keycloak session check, the bootstrap fetch and every warm route, and showed a
        white page in the middle of what is meant to be the smoothest thing the product does.
        `setActiveClinicId` above already moved the context that every clinic-scoped fetch keys
        off, so `refresh` is enough to bring server data along with it.
      */
      router.push('/dashboard');
      router.refresh();
    }
  };

  const handleSync = () => {
    if (clinicId) {
      syncNow(clinicId);
    }
  };

  const initials =
    bootstrap?.displayName
      ?.split(/\s+/)
      .map((segment) => segment[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ?? '?';

  /*
    One clinic picker, rendered in two places.

    The switcher used to live inside a `hidden lg:flex` block, so below 1024px there was no way to
    change clinic at all -- on a tablet or a phone the workspace was simply locked to whichever
    clinic was last chosen on a laptop. A 220px select does not belong in a 375px header bar, so
    the narrow answer is the navigation sheet, which has room for it.
  */
  const clinicPicker =
    switchableClinics.length > 1 ? (
      <Select value={clinicId ?? ''} onValueChange={handleClinicChange}>
        <SelectTrigger aria-label="Active clinic" className="w-full md:w-[190px] lg:w-[220px]">
          <SelectValue placeholder="Select clinic" />
        </SelectTrigger>
        <SelectContent>
          {switchableClinics.map((clinic) => (
            <SelectItem key={clinic.clinicId} value={clinic.clinicId}>
              {clinic.clinicName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  const roleBadges =
    roleLabels.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        {roleLabels.map((role) => (
          <Badge key={role} variant="secondary" className="rounded-full">
            {formatRoleLabel(role)}
          </Badge>
        ))}
      </div>
    ) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>
          {/*
            A flex column with a scrolling body. It was `h-full overflow-y-auto` inside a sheet
            that already had a header, so the body was a viewport tall *below* that header and the
            last nav items sat past the bottom of the screen with nothing to scroll them into view.
          */}
          <SheetContent
            side="left"
            className="flex w-[88vw] max-w-[340px] flex-col border-sidebar-border bg-sidebar p-0"
          >
            <SheetHeader className="border-b border-sidebar-border p-5 text-left">
              <SheetTitle className="text-left">
                <div className="space-y-3">
                  <div className="relative h-11 w-40">
                    <Image
                      src="/images/nkwapa-logo.png"
                      alt="Nkwapa EMR"
                      fill
                      sizes="160px"
                      className="object-contain object-left"
                    />
                  </div>
                  <p className="text-xs font-medium text-sidebar-muted-foreground">
                    Workspace menu
                  </p>
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              {clinicPicker || roleBadges ? (
                <div className="space-y-3 rounded-lg border border-sidebar-border bg-background p-3 md:hidden">
                  <p className="text-eyebrow text-sidebar-muted-foreground">Active clinic</p>
                  {clinicPicker ?? (
                    <p className="text-sm font-medium text-foreground">
                      {activeClinic?.clinicName ?? 'Choose an active clinic'}
                    </p>
                  )}
                  {roleBadges}
                </div>
              ) : null}
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
          aria-expanded={!sidebarCollapsed}
          aria-controls="workspace-sidebar"
          className="hidden md:inline-flex"
        >
          {sidebarCollapsed ? (
            <PanelLeft aria-hidden="true" className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="h-[18px] w-[18px]" />
          )}
          <span className="sr-only">
            {sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          </span>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-eyebrow text-primary">Active clinic</p>
            {/* The help was `hidden lg:inline-flex`, so the one explanation of what switching
                clinic actually changes was invisible on exactly the devices used in a clinic. */}
            <InfoHint label="Use the clinic picker to switch the records, queues, reminders, and dashboard data shown across this workspace." />
          </div>
          <p className="truncate text-sm font-medium text-foreground">
            {activeClinic?.clinicName ?? 'Choose an active clinic'}
          </p>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {clinicPicker}

          {/* Role chips were xl-only, so a doctor on a laptop could not see which role the app
              had them in. They are visible from lg, and in the navigation sheet below that. */}
          <div className="hidden lg:flex">{roleBadges}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm md:flex">
            {/* Was `bg-emerald-500`, a raw palette colour sitting in the same ternary as a token.
                Colour is never the only signal here: the adjacent label says Online or Offline. */}
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-success' : 'bg-destructive'}`}
            />
            <span className="text-muted-foreground">{isOnline ? 'Online' : 'Offline'}</span>
            <span className="text-muted-foreground">Pending {pendingCount}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={!isOnline || syncStatus === 'syncing' || !canSync}
              className="h-8 border-border"
            >
              <RefreshCw className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              {syncStatus === 'syncing' ? 'Syncing' : 'Sync'}
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
            <DropdownMenuContent align="end" className="w-64 border-border">
              <DropdownMenuLabel>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Appearance
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={themePreference}
                onValueChange={(value) => setThemePreference(value as ThemePreference)}
              >
                <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">Match system</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              {syncError ? (
                <>
                  <div className="px-2 py-2 text-xs text-destructive">{syncError}</div>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:text-destructive"
              >
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
