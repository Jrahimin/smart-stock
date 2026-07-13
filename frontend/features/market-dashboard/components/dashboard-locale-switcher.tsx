"use client";

import { useRouter } from "next/navigation";

import type { AppLocale } from "@/lib/locale/app-locale";
import { writeAppLocaleCookie } from "@/lib/locale/app-locale";

type DashboardLocaleSwitcherProps = {
  locale: AppLocale;
  ariaLabel?: string;
};

export function DashboardLocaleSwitcher({ locale, ariaLabel = "Dashboard language" }: DashboardLocaleSwitcherProps) {
  const router = useRouter();

  function selectLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) {
      return;
    }

    writeAppLocaleCookie(nextLocale);
    router.refresh();
  }

  return (
    <div aria-label={ariaLabel} className="dashboard-locale-switcher" role="group">
      <button
        aria-pressed={locale === "en"}
        className={locale === "en" ? "dashboard-locale-switcher-button is-active" : "dashboard-locale-switcher-button"}
        onClick={() => selectLocale("en")}
        type="button"
      >
        EN
      </button>
      <button
        aria-pressed={locale === "bn"}
        className={locale === "bn" ? "dashboard-locale-switcher-button is-active" : "dashboard-locale-switcher-button"}
        onClick={() => selectLocale("bn")}
        type="button"
      >
        বাং
      </button>
    </div>
  );
}
