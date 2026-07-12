"use client";

import { Menu, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RefObject } from "react";

import { DashboardGuideLauncher } from "@/features/guide/components/dashboard-guide-launcher";

export const MOBILE_NAV_MENU_BUTTON_ID = "mobile-nav-menu-button";
export const MOBILE_NAV_DRAWER_ID = "mobile-nav-drawer";

type MobileAppHeaderProps = {
  isMenuOpen: boolean;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  onMenuToggle: () => void;
  showGuideLauncher?: boolean;
};

export function MobileAppHeader({
  isMenuOpen,
  menuButtonRef,
  onMenuToggle,
  showGuideLauncher = false,
}: MobileAppHeaderProps) {
  const router = useRouter();

  function handleSearchShortcut() {
    const searchInput = document.querySelector<HTMLInputElement>(".explorer-command-search input");
    if (searchInput) {
      searchInput.focus({ preventScroll: true });
      searchInput.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    router.push("/stocks");
  }

  return (
    <header className="mobile-app-header">
      <button
        ref={menuButtonRef}
        aria-controls={MOBILE_NAV_DRAWER_ID}
        aria-expanded={isMenuOpen}
        aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        className="mobile-app-header-menu-button"
        id={MOBILE_NAV_MENU_BUTTON_ID}
        onClick={onMenuToggle}
        type="button"
      >
        <Menu aria-hidden="true" size={22} strokeWidth={2.1} />
      </button>
      <Link aria-label="Smart Stock home" className="mobile-app-header-brand" href="/">
        <Image alt="" aria-hidden="true" className="mobile-app-header-brand-icon" height={32} src="/stock-icon.png" width={32} />
        <span className="mobile-app-header-brand-text">Stock Intelligence</span>
      </Link>
      <div className="mobile-app-header-actions">
        {showGuideLauncher ? <DashboardGuideLauncher className="mobile-app-header-guide-button" /> : null}
        <button
          aria-label="Search stocks and symbols"
          className="mobile-app-header-search-button"
          onClick={handleSearchShortcut}
          type="button"
        >
          <Search aria-hidden="true" size={20} strokeWidth={2.1} />
        </button>
      </div>
    </header>
  );
}
