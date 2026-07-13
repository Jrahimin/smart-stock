"use client";

import { useRouter } from "next/navigation";

import type { AppLocale } from "@/lib/locale/app-locale";
import { writeAppLocaleCookie } from "@/lib/locale/app-locale";

type DashboardLocaleSwitcherProps = {
  locale: AppLocale;
  ariaLabel?: string;
  variant?: "default" | "compact";
};

export function DashboardLocaleSwitcher({
  locale,
  ariaLabel = "Dashboard language",
  variant = "default",
}: DashboardLocaleSwitcherProps) {
  const router = useRouter();

  function selectLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) {
      return;
    }

    writeAppLocaleCookie(nextLocale);
    router.refresh();
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`dashboard-locale-switcher ${variant === "compact" ? "dashboard-locale-switcher-compact" : ""}`.trim()}
      role="group"
    >
      <span aria-hidden="true" className="dashboard-locale-switcher-icon">
        <svg fill="none" height="13" viewBox="0 0 24 24" width="13">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 12h18M12 3c2.8 2.4 4.2 5.6 4.2 9s-1.4 6.6-4.2 9M12 3c-2.8 2.4-4.2 5.6-4.2 9s1.4 6.6 4.2 9" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </span>
      <button
        aria-pressed={locale === "en"}
        className={`dashboard-locale-switcher-button dashboard-locale-switcher-button-en ${locale === "en" ? "is-active" : ""}`.trim()}
        onClick={() => selectLocale("en")}
        type="button"
      >
        EN
      </button>
      <button
        aria-pressed={locale === "bn"}
        className={`dashboard-locale-switcher-button dashboard-locale-switcher-button-bn ${locale === "bn" ? "is-active" : ""}`.trim()}
        onClick={() => selectLocale("bn")}
        type="button"
      >
        বাং
      </button>
    </div>
  );
}
