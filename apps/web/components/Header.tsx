'use client';

import { usePathname, useRouter } from 'next/navigation';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { THEME_PREFERENCE_OPTIONS, useTheme, type ThemePreference } from '@/lib/theme-context';
import { AppNavList } from '@/components/app-shell/AppNavList';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getAccessibleNavItems, getNavItemHref, isNavItemActive } from '@/lib/app-nav';
import { cn } from '@/lib/utils';
import { useBootstrap } from '@/lib/bootstrap-context';
import { formatRoleLabel, getOpsDestination, getVisibleRoleLabels } from '@/lib/ops';
import { useKeycloak } from '@/app/KeycloakProvider';
import { getActiveBootstrapClinic, getSwitchableClinics } from '@/lib/bootstrap-clinics';
import { useToast } from '@/components/ui/toast';
import { SyncStatusBar } from '@/components/sync/SyncStatusBar';
import { InstallAppMenuItem, InstallInstructionsDialog } from '@/components/pwa/InstallApp';
import {
  Compass,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  Settings,
  ShieldCheck,
  User,
  UserPen,
} from 'lucide-react';
import { WelcomeTour } from '@/components/onboarding/WelcomeTour';
import { WELCOME_TOUR_OPEN_EVENT } from '@/lib/welcome-tour';
import { isWebFeatureEnabled } from '@/lib/feature-flags';

export function Header({
  sidebarCollapsed = false,
  onToggleSidebar,
  mobileOpen = false,
  onMobileOpenChange = () => undefined,
}: {
  sidebarCollapsed?: boolean;
  /** Omitted where there is no sidebar to toggle, as on the patient portal. */
  onToggleSidebar?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}) {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const { activeClinicId: contextActiveClinicId, setActiveClinicId } = bootstrapCtx ?? {};
  const { logout } = useKeycloak() ?? {};
  const { showToast } = useToast();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const clinicId = contextActiveClinicId ?? null;
  const memberships = bootstrap?.memberships ?? [];
  const switchableClinics = getSwitchableClinics(bootstrap);
  const activeClinic = getActiveBootstrapClinic(bootstrap, clinicId);
  const activeMembership = memberships.find((membership) => membership.clinicId === clinicId);
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const hasPermission = (permission: string) => perms.includes('*') || perms.includes(permission);
  const canSync = hasPermission('SYNC.PUSH') && hasPermission('SYNC.PULL');
  const recoveryAccess = {
    canReviewDuplicates: hasPermission('PATIENT.DUPLICATE.REVIEW'),
    opsBoardHref: getOpsDestination(perms, isWebFeatureEnabled('stationWorkflow')),
  };
  const roleLabels = getVisibleRoleLabels(activeMembership?.roles, bootstrap?.globalRoles);
  // Plain text, not the gold badges: the role is context for the clinic name, not an alert.
  const roleText = roleLabels.map(formatRoleLabel).join(', ');
  const clinicName = activeClinic?.clinicName ?? 'Choose an active clinic';
  // Gated by the same filter as the rail (#267); only where they are drawn differs.
  const headerItems = getAccessibleNavItems(bootstrap, 'header');
  const profileItems = getAccessibleNavItems(bootstrap, 'profile');
  const sheetUtilities = [...headerItems, ...profileItems];

  const handleClinicChange = async (value: string) => {
    if (!value || value === clinicId) return;
    const nextClinic = switchableClinics.find((clinic) => clinic.clinicId === value);
    const clinicName = nextClinic?.clinicName ?? 'the selected clinic';
    // One toast that turns from "Switching" into the outcome, rather than a spinner that expires.
    const toastId = 'clinic-switch';
    showToast({
      id: toastId,
      tone: 'loading',
      title: `Switching to ${clinicName}`,
      description: 'Refreshing clinic-scoped queues, dashboard data, and records.',
    });
    /*
      A client navigation, not `window.location.href`: a hard reload threw away the Keycloak
      session check and every warm route. `setActiveClinicId` re-fetches whoami, which is what
      moves the clinic and its permissions for every page that reads them.
    */
    const switched = (await setActiveClinicId?.(value)) ?? false;
    if (!switched) {
      showToast({
        id: toastId,
        tone: 'error',
        title: `Could not switch to ${clinicName}`,
        description: 'Check your connection, then try again.',
      });
      return;
    }
    router.push('/dashboard');
    showToast({ id: toastId, tone: 'success', title: `Now viewing ${clinicName}` });
  };

  const initials =
    bootstrap?.displayName
      ?.split(/\s+/)
      .map((segment) => segment[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ?? '?';

  /*
    One clinic switcher, in the header at every width: the clinic name with the active role beside
    it as text (MASTER.md section 12). It used to be three things (an "Active clinic" label, a
    separate picker from md, and role badges from lg) plus a second copy of the picker in the
    navigation sheet, because the header had no room for a 220px select below 1024px. As a
    borderless trigger sized to its text it fits a 390px header beside the menu, sync and account.
  */
  const switcherLabel = `Active clinic: ${clinicName}${roleText ? `, ${roleText}` : ''}`;
  const roleSuffix = roleText ? (
    // Visible from `sm`; on a phone it stays in the accessible name and shows in the menu sheet.
    <span className="sr-only shrink-0 font-normal text-muted-foreground sm:not-sr-only">
      {roleText}
    </span>
  ) : null;
  const clinicSwitcher =
    switchableClinics.length > 1 ? (
      <Select value={clinicId ?? ''} onValueChange={(value) => void handleClinicChange(value)}>
        <SelectTrigger
          aria-label={`${switcherLabel}. Switch clinic`}
          className="w-auto min-w-0 max-w-full justify-start gap-2 border-transparent bg-transparent px-2.5 shadow-none hover:bg-muted [&>span]:line-clamp-none"
        >
          <span className="min-w-0 truncate font-semibold text-foreground">
            <SelectValue placeholder="Select clinic" />
          </span>
          {roleSuffix}
        </SelectTrigger>
        <SelectContent>
          {switchableClinics.map((clinic) => (
            <SelectItem key={clinic.clinicId} value={clinic.clinicId}>
              {clinic.clinicName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <p className="flex min-w-0 items-center gap-2 px-2.5 text-sm">
        <span className="truncate font-semibold text-foreground">{clinicName}</span>
        {roleSuffix}
      </p>
    );

  return (
    <header
      className={cn(
        'pt-safe sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur',
        onToggleSidebar && 'compact:rounded-t-xl compact:bg-card/95',
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4 md:px-6">
        <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={onToggleSidebar ? 'compact:hidden' : 'md:hidden'}
            >
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
            className="flex w-[88vw] max-w-[320px] flex-col border-border bg-background p-0"
          >
            <SheetHeader className="border-b border-border p-5 text-left">
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
                  <p className="text-xs font-medium text-muted-foreground">Workspace menu</p>
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              {roleText ? (
                <p className="px-3 text-sm text-muted-foreground">
                  Signed in as <span className="font-medium text-foreground">{roleText}</span>
                </p>
              ) : null}
              <AppNavList
                bootstrap={bootstrap}
                mobile
                onNavigate={() => onMobileOpenChange(false)}
              />
              {/* The header icon and the account menu item, mirrored where a phone looks for them. */}
              {sheetUtilities.length ? (
                <AppNavList
                  bootstrap={bootstrap}
                  mobile
                  label="Account"
                  sections={[{ id: 'account', label: 'Account', items: sheetUtilities }]}
                  onNavigate={() => onMobileOpenChange(false)}
                />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>

        {/*
          Only where there is a sidebar. PortalLayout renders this Header without one, so the
          button shipped there pointing aria-controls at an element that does not exist -- a
          dangling reference axe flags on every portal page, and a control a screen reader
          announces as collapsing navigation the patient does not have.
        */}
        {onToggleSidebar ? (
          // The tooltip names the `[` shortcut AppLayout already handles (#280).
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleSidebar}
                  aria-expanded={!sidebarCollapsed}
                  aria-controls="workspace-sidebar"
                  aria-keyshortcuts="["
                  className="hidden desktop:inline-flex"
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
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex items-center gap-2">
                {sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                <kbd className="rounded-sm border border-border px-1.5 font-sans text-xs">[</kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center">{clinicSwitcher}</div>

        <div className="flex items-center gap-2">
          {/*
            Message delivery: an icon with its name in a tooltip, and no badge, because the ledger
            is outbound delivery with nothing to read (MASTER.md section 12). From `md`; on a phone
            it is in the menu sheet, where the header has no room for it.
          */}
          <TooltipProvider delayDuration={200}>
            {headerItems.map((item) => {
              const Icon = item.icon;
              const href = getNavItemHref(item, clinicId);
              if (href === '#') {
                return (
                  <Button
                    key={item.href}
                    variant="ghost"
                    size="icon"
                    disabled
                    aria-label={`${item.label}: select a clinic first`}
                    className={
                      onToggleSidebar ? 'hidden compact:inline-flex' : 'hidden md:inline-flex'
                    }
                  >
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                  </Button>
                );
              }
              const active = isNavItemActive(pathname, item, clinicId);
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className={cn(
                        onToggleSidebar ? 'hidden compact:inline-flex' : 'hidden md:inline-flex',
                        active && 'bg-primary/10 text-primary',
                      )}
                    >
                      <Link
                        href={href}
                        aria-label={item.label}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>

          <SyncStatusBar clinicId={clinicId} canSync={canSync} recoveryAccess={recoveryAccess} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu">
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
              <DropdownMenuItem
                onSelect={() => window.dispatchEvent(new Event(WELCOME_TOUR_OPEN_EVENT))}
              >
                <Compass className="mr-2 h-4 w-4" />
                Take the tour
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account">
                  <UserPen className="mr-2 h-4 w-4" />
                  Manage profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Your settings
                </Link>
              </DropdownMenuItem>
              {profileItems.map((item) => {
                const Icon = item.icon;
                const href = getNavItemHref(item, clinicId);
                return href === '#' ? (
                  <DropdownMenuItem key={item.href} disabled>
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={href}>
                      <Icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              <InstallAppMenuItem />
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Appearance
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={themePreference}
                onValueChange={(value) => setThemePreference(value as ThemePreference)}
              >
                {THEME_PREFERENCE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
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
      {/* Here because both the workspace and the portal render this header. */}
      <WelcomeTour />
      <InstallInstructionsDialog />
    </header>
  );
}
