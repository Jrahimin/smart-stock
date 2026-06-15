"use client";

import { ChevronsLeft, ChevronsRight, LogIn, LogOut, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { GlobalCommandPalette } from "@/components/command/global-command-palette";
import { SidebarThemeToggle } from "@/components/layout/sidebar-theme-toggle";
import { TerminalSidebarNav } from "@/components/layout/terminal-sidebar-nav";
import { useAuth } from "@/features/auth/context/auth-context";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type TerminalAppShellProps = {
  children: ReactNode;
};

export function TerminalAppShell({ children }: TerminalAppShellProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);
  const theme = useWorkspaceStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className={sidebarCollapsed ? "terminal-shell terminal-shell-collapsed" : "terminal-shell"}>
      <aside className="terminal-sidebar">
        <div className="terminal-sidebar-top">
          <Link aria-label="Smart Stock home" className="terminal-brand" href="/dashboard">
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
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sidebar-toggle-button"
            onClick={toggleSidebar}
            type="button"
          >
            {sidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        </div>
        <div className="terminal-sidebar-primary">
          <TerminalSidebarNav collapsed={sidebarCollapsed} pathname={pathname} />
        </div>
        <div aria-hidden="true" className="terminal-sidebar-spacer" />
        <div className="terminal-sidebar-utilities">
          <SidebarThemeToggle collapsed={sidebarCollapsed} />
          <div className="terminal-sidebar-footer">
          {isLoading ? null : isAuthenticated && user ? (
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
                {!sidebarCollapsed ? <span className="terminal-user-name">{user.display_name}</span> : null}
              </Link>
              <button
                className="terminal-auth-button terminal-logout-button"
                onClick={() => void logout()}
                title="Sign out"
                type="button"
              >
                <LogOut aria-hidden="true" size={18} />
                {!sidebarCollapsed ? <span>Logout</span> : null}
              </button>
            </>
          ) : (
            <Link className="terminal-auth-button terminal-login-button" href="/login" title="Sign in">
              <LogIn aria-hidden="true" size={18} />
              {!sidebarCollapsed ? <span>Login</span> : null}
            </Link>
          )}
          </div>
        </div>
      </aside>
      <main className="terminal-main">
        {children}
      </main>
      <GlobalCommandPalette />
    </div>
  );
}
