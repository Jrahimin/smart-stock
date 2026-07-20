"use client";

import { ChevronsLeft, ChevronsRight, LogIn, LogOut, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { GlobalCommandPalette } from "@/components/command/global-command-palette";
import { MobileAppHeader } from "@/components/layout/mobile-app-header";
import { MobileNavigationDrawer } from "@/components/layout/mobile-navigation-drawer";
import { SidebarThemeToggle } from "@/components/layout/sidebar-theme-toggle";
import { TerminalSidebarNav } from "@/components/layout/terminal-sidebar-nav";
import { useAuth } from "@/features/auth/context/auth-context";
import { DashboardSidebarGuide } from "@/features/guide/components/dashboard-sidebar-guide";
import { isDashboardGuideRoute, isTaxPlannerGuideRoute, isWealthOverviewGuideRoute } from "@/features/guide/lib/guide-route";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type TerminalAppShellProps = {
  children: ReactNode;
  dashboardLocale?: AppLocale;
};

export function TerminalAppShell({ children, dashboardLocale = DEFAULT_LOCALE }: TerminalAppShellProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const collapseSidebar = useWorkspaceStore((state) => state.collapseSidebar);
  const theme = useWorkspaceStore((state) => state.theme);
  const [storeHydrated, setStoreHydrated] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [guideMobileNavigationOpen, setGuideMobileNavigationOpen] = useState(false);
  const [isSidebarHoverExpanded, setSidebarHoverExpanded] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setStoreHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = dashboardLocale;
  }, [dashboardLocale]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const isSidebarCollapsed = (storeHydrated ? sidebarCollapsed : true) && !isSidebarHoverExpanded;
  const isMobileNavigationOpen = mobileNavOpen || guideMobileNavigationOpen;
  const mobileGuideLauncher = isDashboardGuideRoute(pathname) ? "dashboard" : isWealthOverviewGuideRoute(pathname) ? "wealth" : isTaxPlannerGuideRoute(pathname) ? "tax-planner" : null;

  const handleMobileNavClose = () => {
    setMobileNavOpen(false);
    setGuideMobileNavigationOpen(false);
  };

  return (
    <div className={isSidebarCollapsed ? "terminal-shell terminal-shell-collapsed" : "terminal-shell"}>
      <MobileAppHeader
        guideLocale={dashboardLocale}
        isMenuOpen={isMobileNavigationOpen}
        menuButtonRef={menuButtonRef}
        onMenuToggle={() => setMobileNavOpen((open) => !open)}
        guideLauncher={mobileGuideLauncher}
      />
      <MobileNavigationDrawer
        guideActive={guideMobileNavigationOpen}
        isOpen={isMobileNavigationOpen}
        menuButtonRef={menuButtonRef}
        onClose={handleMobileNavClose}
        storeHydrated={storeHydrated}
      />
      <aside
        className="terminal-sidebar terminal-sidebar-desktop"
        onMouseEnter={() => setSidebarHoverExpanded(true)}
        onMouseLeave={() => setSidebarHoverExpanded(false)}
      >
        <div className="terminal-sidebar-top">
          <Link aria-label="Smart Stock home" className="terminal-brand" href="/">
            <Image
              alt="Stock Intelligence"
              className="terminal-brand-wide"
              height={64}
              priority
              src="/stock-icon-wide.png"
              width={256}
            />
            <Image
              alt=""
              aria-hidden="true"
              className="terminal-brand-icon"
              height={40}
              src="/stock-icon.png"
              width={40}
            />
          </Link>
          <button
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sidebar-toggle-button"
            onClick={() => {
              if (isSidebarCollapsed) {
                setSidebarHoverExpanded(true);
                return;
              }

              collapseSidebar();
              setSidebarHoverExpanded(false);
            }}
            type="button"
          >
            {isSidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        </div>
        <div className="terminal-sidebar-primary">
          <TerminalSidebarNav collapsed={isSidebarCollapsed} pathname={pathname} />
        </div>
        <div aria-hidden="true" className="terminal-sidebar-spacer" />
        <div className="terminal-sidebar-utilities">
          <SidebarThemeToggle collapsed={isSidebarCollapsed} ready={storeHydrated} />
          <div className="terminal-sidebar-footer">
          {!storeHydrated || isLoading ? null : isAuthenticated && user ? (
            <>
              <Link
                aria-current={pathname === "/profile" ? "page" : undefined}
                className={`terminal-user-chip ${pathname === "/profile" ? "is-active" : ""}`}
                href="/profile"
                title="Open profile"
              >
                {user.profile_pic_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="terminal-user-avatar" src={user.profile_pic_url} />
                ) : (
                  <User aria-hidden="true" size={18} />
                )}
                {!isSidebarCollapsed ? <span className="terminal-user-name">{user.display_name}</span> : null}
              </Link>
              <button
                className="terminal-auth-button terminal-logout-button"
                onClick={() => void logout()}
                title="Sign out"
                type="button"
              >
                <LogOut aria-hidden="true" size={18} />
                {!isSidebarCollapsed ? <span>Logout</span> : null}
              </button>
            </>
          ) : storeHydrated ? (
            <Link className="terminal-auth-button terminal-login-button" href="/login" title="Sign in">
              <LogIn aria-hidden="true" size={18} />
              {!isSidebarCollapsed ? <span>Login</span> : null}
            </Link>
          ) : null}
          </div>
        </div>
      </aside>
      <main className="terminal-main">
        {children}
      </main>
      <DashboardSidebarGuide dashboardLocale={dashboardLocale} onMobileNavigationOpenChange={setGuideMobileNavigationOpen} />
      <GlobalCommandPalette />
    </div>
  );
}
