"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DashboardLocaleSwitcher } from "@/features/market-dashboard/components/dashboard-locale-switcher";
import { WEALTH_CALCULATOR_NAV_ITEMS } from "@/features/wealth/catalog/wealth-catalog";
import { getWealthLandingLanguage, type WealthLandingLanguage } from "@/features/wealth/wealth-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthSubNavKey = "overview" | "taxPlanner" | "snapshot" | "timeTravel" | "compare";

const WEALTH_SUB_NAV_ITEMS: Array<{
  href: string;
  key: WealthSubNavKey;
  icon: string;
  match: (path: string) => boolean;
}> = [
  { href: "/wealth", key: "overview", icon: "⌂", match: (path: string) => path === "/wealth" },
  {
    href: "/wealth/tools/tax-planner",
    key: "taxPlanner",
    icon: "◇",
    match: (path: string) => path.startsWith("/wealth/tools/tax-planner"),
  },
  {
    href: "/wealth/snapshot",
    key: "snapshot",
    icon: "◈",
    match: (path: string) => path.startsWith("/wealth/snapshot"),
  },
  {
    href: "/wealth/calendar",
    key: "timeTravel",
    icon: "◷",
    match: (path: string) => path.startsWith("/wealth/calendar"),
  },
  {
    href: "/wealth/compare/dps-vs-fdr",
    key: "compare",
    icon: "⇄",
    match: (path: string) => path.startsWith("/wealth/compare"),
  },
] as const;

export function WealthSubNav({ locale }: { locale?: AppLocale }) {
  const pathname = usePathname();
  const language = getWealthLandingLanguage(locale ?? "en");
  const [overview, taxPlanner, snapshot, calendar, compare] = WEALTH_SUB_NAV_ITEMS;

  return (
    <div className="wealth-sub-nav-shell">
      <span className="wealth-sub-nav-brand">
        <span aria-hidden="true" className="wealth-sub-nav-brand-icon">
          ◆
        </span>
        <span className="wealth-sub-nav-brand-text">Wealth Workspace</span>
      </span>

      <span aria-hidden="true" className="wealth-sub-nav-divider" />

      <nav aria-label={language.nav.ariaLabel} className="wealth-sub-nav">
        <WealthSubNavLink item={overview} label={language.nav[overview.key]} pathname={pathname} />
        <WealthCalculatorsNavItem copy={language.nav} pathname={pathname} />
        <WealthSubNavLink item={taxPlanner} label={language.nav[taxPlanner.key]} pathname={pathname} />
        <WealthSubNavLink item={snapshot} label={language.nav[snapshot.key]} pathname={pathname} />
        <WealthSubNavLink item={calendar} label={language.nav[calendar.key]} pathname={pathname} />
        <WealthSubNavLink item={compare} label={language.nav[compare.key]} pathname={pathname} />
        {locale ? <DashboardLocaleSwitcher ariaLabel={language.nav.localeSwitcherAria} locale={locale} /> : null}
      </nav>
    </div>
  );
}

function WealthSubNavLink({
  item,
  label,
  pathname,
}: {
  item: (typeof WEALTH_SUB_NAV_ITEMS)[number];
  label: string;
  pathname: string;
}) {
  const isActive = item.match(pathname);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`wealth-sub-nav-item ${isActive ? "wealth-sub-nav-item-active" : ""}`}
      href={item.href}
    >
      <span aria-hidden="true" className="wealth-sub-nav-inline-icon">
        {item.icon}
      </span>
      <span className="wealth-sub-nav-item-label">{label}</span>
    </Link>
  );
}

function WealthCalculatorsNavItem({ pathname, copy }: { pathname: string; copy: WealthLandingLanguage["nav"] }) {
  const [isOpen, setIsOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const isActive = pathname.startsWith("/wealth/tools") && !pathname.startsWith("/wealth/tools/tax-planner");
  const activeCalculator =
    WEALTH_CALCULATOR_NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    null;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className={`wealth-sub-nav-dropdown ${isOpen ? "wealth-sub-nav-dropdown-open" : ""}`} ref={shellRef}>
      <button
        aria-current={isActive ? "page" : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`wealth-sub-nav-item wealth-sub-nav-item-trigger ${isActive ? "wealth-sub-nav-item-active" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        onMouseEnter={() => setIsOpen(true)}
        type="button"
      >
        <span aria-hidden="true" className="wealth-sub-nav-inline-icon">
          {activeCalculator?.icon ?? "✦"}
        </span>
        <span className="wealth-sub-nav-trigger-label">
          {activeCalculator ? `${copy.calculators} · ${activeCalculator.label}` : copy.calculators}
        </span>
        <span aria-hidden="true" className="wealth-sub-nav-chevron">
          ▾
        </span>
      </button>

      {isOpen ? (
        <div className="wealth-sub-nav-menu-shell" onMouseLeave={() => setIsOpen(false)}>
          <div className="wealth-sub-nav-menu" role="menu">
            {WEALTH_CALCULATOR_NAV_ITEMS.map((item) => {
              const isItemActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  className={`wealth-sub-nav-menu-item ${isItemActive ? "wealth-sub-nav-menu-item-active" : ""}`}
                  href={item.href}
                  key={item.href}
                  onClick={() => setIsOpen(false)}
                  role="menuitem"
                >
                  <span className="wealth-sub-nav-menu-label">{item.label}</span>
                  <span aria-hidden="true" className="wealth-sub-nav-menu-icon">
                    {item.icon}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
