"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { WEALTH_CALCULATOR_NAV_ITEMS } from "@/features/wealth/catalog/wealth-catalog";

const WEALTH_SUB_NAV_ITEMS = [
  { href: "/wealth", label: "Overview", icon: "⌂", match: (path: string) => path === "/wealth" },
  {
    href: "/wealth/tools/tax-planner",
    label: "Tax Planner",
    icon: "◇",
    match: (path: string) => path.startsWith("/wealth/tools/tax-planner"),
  },
  {
    href: "/wealth/snapshot",
    label: "Snapshot",
    icon: "◈",
    match: (path: string) => path.startsWith("/wealth/snapshot"),
  },
  {
    href: "/wealth/calendar",
    label: "Time Travel",
    icon: "◷",
    match: (path: string) => path.startsWith("/wealth/calendar"),
  },
  {
    href: "/wealth/compare/dps-vs-fdr",
    label: "Compare",
    icon: "⇄",
    match: (path: string) => path.startsWith("/wealth/compare"),
  },
] as const;

export function WealthSubNav() {
  const pathname = usePathname();
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

      <nav aria-label="Wealth workspace" className="wealth-sub-nav">
        <WealthSubNavLink item={overview} pathname={pathname} />
        <WealthCalculatorsNavItem pathname={pathname} />
        <WealthSubNavLink item={taxPlanner} pathname={pathname} />
        <WealthSubNavLink item={snapshot} pathname={pathname} />
        <WealthSubNavLink item={calendar} pathname={pathname} />
        <WealthSubNavLink item={compare} pathname={pathname} />
      </nav>
    </div>
  );
}

function WealthSubNavLink({
  item,
  pathname,
}: {
  item: (typeof WEALTH_SUB_NAV_ITEMS)[number];
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
      <span className="wealth-sub-nav-item-label">{item.label}</span>
    </Link>
  );
}

function WealthCalculatorsNavItem({ pathname }: { pathname: string }) {
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
          {activeCalculator ? `Calculators · ${activeCalculator.label}` : "Calculators"}
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
