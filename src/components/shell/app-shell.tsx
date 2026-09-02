'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, LogOut, Menu, Play, Search, Settings, User, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AppShellView, NavGroupView, NavItemView } from '@/contracts/view-models';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { CountBadge } from '@/components/ui/badge';
import { DropdownMenu } from '@/components/feedback/overlay';
import { NavIcon } from './icons';
import { selectBottomNavItems } from './navigation';

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard' || href === '/hr' || href === '/finance') {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                    */
/* -------------------------------------------------------------------------- */

function NavList({
  groups,
  pathname,
  onNavigate,
}: {
  groups: readonly NavGroupView[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-3 py-4">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {group.label && (
            <h2 className="px-2.5 pb-1 text-caption font-medium tracking-wide text-ink-subtle uppercase">
              {group.label}
            </h2>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLink item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItemView;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm',
        'transition-colors duration-150',
        active
          ? 'bg-surface-sunken font-medium text-ink'
          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
      )}
    >
      <NavIcon
        iconKey={item.iconKey}
        className={cn('size-4.5 shrink-0', active ? 'text-accent' : 'text-ink-subtle')}
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badgeCount !== undefined && item.badgeCount > 0 && (
        <CountBadge count={item.badgeCount} label={`unread in ${item.label}`} />
      )}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Top bar                                                                    */
/* -------------------------------------------------------------------------- */

function RunningTimerPill({ view }: { view: NonNullable<AppShellView['runningTimer']> }) {
  return (
    <Link
      href="/timesheets"
      className={cn(
        'inline-flex min-h-9 items-center gap-2 rounded-full border border-accent-border',
        'bg-accent-subtle px-3 text-caption font-medium text-accent transition-colors',
        'hover:bg-accent-subtle/70',
      )}
    >
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-accent" />
      </span>
      <span className="hidden sm:inline">{view.division.code}</span>
      <span className="tabular">{view.elapsed.display}</span>
      <span className="sr-only">
        Timer running for {view.division.name}, {view.elapsed.accessibleLabel} elapsed
      </span>
    </Link>
  );
}

function TopBar({
  view,
  onOpenDrawer,
  onSignOut,
}: {
  view: AppShellView;
  onOpenDrawer: () => void;
  onSignOut?: () => void;
}) {
  return (
    <header
      data-print="hide"
      className={cn(
        'sticky top-0 z-20 flex h-[var(--shell-topbar-height)] items-center gap-2',
        'border-b border-border bg-surface/85 px-3 backdrop-blur-md sm:px-4',
      )}
    >
      <IconButton
        label="Open navigation menu"
        variant="ghost"
        icon={<Menu aria-hidden className="size-5" />}
        onClick={onOpenDrawer}
        className="md:hidden"
      />

      <Link href="/dashboard" className="flex items-center gap-2 rounded-xs md:hidden">
        <span className="text-body font-semibold text-ink">Timesheet</span>
      </Link>

      <div className="flex-1" />

      {view.runningTimer && <RunningTimerPill view={view.runningTimer} />}

      <IconButton
        label="Search"
        variant="ghost"
        icon={<Search aria-hidden className="size-4.5" />}
      />

      <Link
        href="/notifications"
        aria-label={
          view.unreadNotificationCount > 0
            ? `Notifications, ${view.unreadNotificationCount} unread`
            : 'Notifications'
        }
        className="relative inline-grid size-10 place-items-center rounded-md text-ink transition-colors hover:bg-surface-sunken"
      >
        <Bell aria-hidden className="size-4.5" />
        {view.unreadNotificationCount > 0 && (
          <span className="absolute top-1 right-1">
            <CountBadge count={view.unreadNotificationCount} />
          </span>
        )}
      </Link>

      <DropdownMenu
        label="Account menu"
        items={[
          { key: 'profile', label: 'Profile', icon: <User aria-hidden className="size-4" />, onSelect: () => {} },
          { key: 'settings', label: 'Settings', icon: <Settings aria-hidden className="size-4" />, onSelect: () => {} },
          {
            key: 'sign-out',
            label: 'Sign out',
            icon: <LogOut aria-hidden className="size-4" />,
            onSelect: () => onSignOut?.(),
            destructive: true,
          },
        ]}
        trigger={
          <button
            type="button"
            aria-label={`Account menu for ${view.viewer.displayName}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-md px-1 transition-colors hover:bg-surface-sunken"
          >
            <Avatar name={view.viewer.displayName} src={view.viewer.avatarUrl} size="sm" />
            <span className="hidden text-left lg:block">
              <span className="block text-caption font-medium text-ink">
                {view.viewer.displayName}
              </span>
              <span className="block text-caption text-ink-subtle">
                {view.viewer.roleLabel}
              </span>
            </span>
          </button>
        }
      />
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile bottom navigation                                                   */
/* -------------------------------------------------------------------------- */

function BottomNav({
  groups,
  pathname,
}: {
  groups: readonly NavGroupView[];
  pathname: string;
}) {
  const items = selectBottomNavItems(groups);
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Primary"
      data-print="hide"
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 flex h-[var(--shell-bottom-nav-height)] items-stretch',
        'border-t border-border bg-surface/95 backdrop-blur-md md:hidden safe-bottom',
      )}
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 px-1',
              'text-[0.6875rem] transition-colors',
              active ? 'text-accent' : 'text-ink-muted',
            )}
          >
            <NavIcon iconKey={item.iconKey} className="size-5" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export interface AppShellProps {
  view: AppShellView;
  children: React.ReactNode;
  onSignOut?: () => void;
}

/**
 * The application frame: sidebar at `md` and up, drawer plus bottom navigation
 * below it.
 *
 * The drawer closes on route change, on Escape, and on backdrop click, and the
 * skip link is the first focusable element on every page so a keyboard user is
 * never forced through the whole navigation to reach content.
 */
export function AppShell({ view, children, onSignOut }: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Close the drawer when the route changes. Adjusted during render rather
  // than in an effect so the new page never flashes behind an open drawer.
  const [lastPathname, setLastPathname] = React.useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setDrawerOpen(false);
  }

  React.useEffect(() => {
    if (!drawerOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main-content" className="skip-link">
        <span className="rounded-md bg-primary px-3 py-2 text-body-sm text-ink-inverse shadow-md">
          Skip to main content
        </span>
      </a>

      <div className="flex flex-1">
        {/* Desktop sidebar. */}
        <aside
          data-print="hide"
          className={cn(
            'sticky top-0 hidden h-dvh w-[var(--shell-sidebar-width)] shrink-0 flex-col',
            'border-r border-border bg-surface md:flex',
          )}
        >
          <div className="flex h-[var(--shell-topbar-height)] shrink-0 items-center gap-2.5 border-b border-border px-4">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-caption font-bold text-ink-inverse"
            >
              T
            </span>
            <span className="min-w-0">
              <span className="block truncate text-body-sm font-semibold text-ink">
                Timesheet
              </span>
              <span className="block truncate text-caption text-ink-subtle">
                {view.viewer.roleLabel}
              </span>
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NavList groups={view.navigation} pathname={pathname} />
          </div>
        </aside>

        {/* Mobile drawer. */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="presentation">
            <div
              className="absolute inset-0 bg-surface-inverse/40 animate-[fade-in_150ms_ease-out]"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className={cn(
                'absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col bg-surface shadow-lg',
                'animate-[slide-in-left_200ms_cubic-bezier(0,0,0.15,1)]',
              )}
            >
              <div className="flex h-[var(--shell-topbar-height)] shrink-0 items-center justify-between border-b border-border px-4">
                <span className="text-body-sm font-semibold text-ink">Menu</span>
                <IconButton
                  label="Close navigation menu"
                  variant="ghost"
                  size="sm"
                  icon={<X aria-hidden className="size-4" />}
                  onClick={() => setDrawerOpen(false)}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NavList
                  groups={view.navigation}
                  pathname={pathname}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Content column. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            view={view}
            onOpenDrawer={() => setDrawerOpen(true)}
            onSignOut={onSignOut}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 pb-[var(--shell-bottom-nav-height)] md:pb-0"
          >
            {children}
          </main>
        </div>
      </div>

      <BottomNav groups={view.navigation} pathname={pathname} />
    </div>
  );
}

/** A floating start-timer action for mobile, above the bottom navigation. */
export function TimerFab({ onStart }: { onStart: () => void }) {
  return (
    <Button
      variant="accent"
      onClick={onStart}
      data-print="hide"
      iconLeading={<Play aria-hidden className="size-4" />}
      className={cn(
        'fixed right-4 z-20 shadow-lg md:hidden',
        'bottom-[calc(var(--shell-bottom-nav-height)+1rem)]',
      )}
    >
      Start timer
    </Button>
  );
}
