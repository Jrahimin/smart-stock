"use client";

import {
  ChevronDown,
  LogIn,
  LogOut,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";

import {
  MOBILE_NAV_DRAWER_ID,
} from "@/components/layout/mobile-app-header";
import { SidebarThemeToggle } from "@/components/layout/sidebar-theme-toggle";
import { WealthWorkspaceNavPill } from "@/components/layout/wealth-workspace-nav-pill";
import { useAuth } from "@/features/auth/context/auth-context";
import {
  adminNavigationItems,
  isNavigationItemActive,
  marketNavigationItems,
} from "@/lib/navigation/terminal-navigation-config";

type MobileNavigationDrawerProps = {
  guideActive?: boolean;
  isOpen: boolean;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  storeHydrated: boolean;
};

function guideTargetForHref(href: string) {
  return `nav-${href.slice(1)}`;
}

export function MobileNavigationDrawer({
  guideActive = false,
  isOpen,
  menuButtonRef,
  onClose,
  storeHydrated,
}: MobileNavigationDrawerProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  const isWealthActive = isNavigationItemActive(pathname, "/wealth");
  const isAdminSection = pathname === "/admin" || pathname.startsWith("/admin/");
  const canAccessAdmin =
    mounted && !isLoading && (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN");
  const [opsExpanded, setOpsExpanded] = useState(isAdminSection);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isAdminSection) {
      setOpsExpanded(true);
    }
  }, [isAdminSection]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (!guideActive) {
      closeButtonRef.current?.focus();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
      if (!guideActive) {
        menuButtonRef?.current?.focus();
      }
    };
  }, [guideActive, isOpen, menuButtonRef, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="mobile-nav-drawer-root">
      <button aria-label="Close navigation menu" className="mobile-nav-drawer-backdrop" onClick={onClose} type="button" />
      <aside
        aria-label="Navigation menu"
        aria-modal={guideActive ? undefined : true}
        className="mobile-nav-drawer-panel"
        id={MOBILE_NAV_DRAWER_ID}
        role={guideActive ? "navigation" : "dialog"}
      >
        <header className="mobile-nav-drawer-header">
          <Link className="mobile-nav-drawer-brand" href="/dashboard" onClick={onClose}>
            <Image alt="Stock Intelligence" height={40} src="/stock-icon-wide.png" width={160} />
          </Link>
          <button
            ref={closeButtonRef}
            aria-label="Close menu"
            className="mobile-nav-drawer-close"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <nav aria-label="Primary navigation" className="mobile-nav-drawer-body" data-guide="primary-navigation">
          {canAccessAdmin ? (
            <section className="mobile-nav-drawer-section">
              <p className="mobile-nav-drawer-section-label terminal-nav-section-label-ops">Operations</p>
              <div className="terminal-nav-ops-group">
                <div className="mobile-nav-ops-row">
                  <Link
                    aria-current={isAdminSection ? "page" : undefined}
                    className={isAdminSection ? "mobile-nav-link active terminal-nav-link-ops" : "mobile-nav-link terminal-nav-link-ops"}
                    href="/admin"
                    onClick={onClose}
                  >
                    <ShieldCheck aria-hidden="true" className="terminal-nav-icon terminal-nav-icon-blue" size={18} />
                    <span>Operations</span>
                  </Link>
                  <button
                    aria-expanded={opsExpanded}
                    aria-label={opsExpanded ? "Collapse operations menu" : "Expand operations menu"}
                    className={`mobile-nav-ops-toggle terminal-nav-ops-toggle ${opsExpanded ? "terminal-nav-ops-toggle-open" : ""}`}
                    onClick={() => setOpsExpanded((current) => !current)}
                    type="button"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                {opsExpanded ? (
                  <div className="mobile-nav-sub-list terminal-nav-sub-list">
                    {adminNavigationItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                      return (
                        <Link
                          aria-current={isActive ? "page" : undefined}
                          className={isActive ? "mobile-nav-sub-link active terminal-nav-sub-link" : "mobile-nav-sub-link terminal-nav-sub-link"}
                          href={item.href}
                          key={item.href}
                          onClick={onClose}
                        >
                          <Icon aria-hidden="true" size={14} />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div aria-hidden="true" className="terminal-nav-divider" />
            </section>
          ) : null}

          <section className="mobile-nav-drawer-section">
            <p className="mobile-nav-drawer-section-label terminal-nav-section-label-wealth">Wealth</p>
            <WealthWorkspaceNavPill collapsed={false} isActive={isWealthActive} onNavigate={onClose} />
          </section>

          <section className="mobile-nav-drawer-section">
            <p className="mobile-nav-drawer-section-label terminal-nav-section-label-market">Smart Stock</p>
            {marketNavigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = isNavigationItemActive(pathname, item.href);

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={isActive ? `mobile-nav-link active terminal-nav-link-${item.tone}` : `mobile-nav-link terminal-nav-link-${item.tone}`}
                    data-guide={guideTargetForHref(item.href)}
                  href={item.href}
                  key={item.href}
                  onClick={onClose}
                >
                  <Icon aria-hidden="true" className={`terminal-nav-icon terminal-nav-icon-${item.tone}`} size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </section>

          <section className="mobile-nav-drawer-section">
            <p className="mobile-nav-drawer-section-label">Account</p>
            {!storeHydrated || isLoading ? null : isAuthenticated && user ? (
              <>
                <Link
                  aria-current={pathname === "/profile" ? "page" : undefined}
                  className={pathname === "/profile" ? "mobile-nav-link active" : "mobile-nav-link"}
                  href="/profile"
                  onClick={onClose}
                >
                  {user.profile_pic_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="mobile-nav-user-avatar" src={user.profile_pic_url} />
                  ) : (
                    <User aria-hidden="true" size={18} />
                  )}
                  <span>Profile</span>
                  <span className="mobile-nav-user-name">{user.display_name}</span>
                </Link>
                <button
                  className="mobile-nav-link mobile-nav-logout-button"
                  onClick={() => {
                    onClose();
                    void logout();
                  }}
                  type="button"
                >
                  <LogOut aria-hidden="true" size={18} />
                  <span>Logout</span>
                </button>
              </>
            ) : storeHydrated ? (
              <Link className="mobile-nav-link mobile-nav-login-link" href="/login" onClick={onClose}>
                <LogIn aria-hidden="true" size={18} />
                <span>Login</span>
              </Link>
            ) : null}
          </section>

          <section className="mobile-nav-drawer-section">
            <p className="mobile-nav-drawer-section-label">Settings</p>
            <SidebarThemeToggle collapsed={false} ready={storeHydrated} />
          </section>
        </nav>
      </aside>
    </div>
  );
}
