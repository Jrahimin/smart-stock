"use client";

import { guideCharacterAssetByPose } from "@/features/guide/character/guide-character-assets";
import { getGuideLauncherCopy } from "@/features/guide/dialogs/dashboard-dialogs";
import { useDashboardGuideLauncherProminent } from "@/features/guide/hooks/use-dashboard-sidebar-guide-controller";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

const GUIDE_OPEN_EVENT = "dashboard-sidebar-guide:open";

export function openDashboardSidebarGuide() {
  window.dispatchEvent(new Event(GUIDE_OPEN_EVENT));
}

type DashboardGuideLauncherProps = {
  className?: string;
  locale?: AppLocale;
};

export function DashboardGuideLauncher({
  className = "market-dashboard-guide-button",
  locale = DEFAULT_LOCALE,
}: DashboardGuideLauncherProps) {
  const prominent = useDashboardGuideLauncherProminent();
  const copy = getGuideLauncherCopy(locale);

  return (
    <button
      aria-label={copy.ariaLabel}
      className={`${className}${prominent ? " market-dashboard-guide-button--prominent" : ""}`}
      onClick={openDashboardSidebarGuide}
      title={copy.title}
      type="button"
    >
      <span aria-hidden="true" className="market-dashboard-guide-button-avatar">
        <img alt="" className="market-dashboard-guide-button-mascot" src={guideCharacterAssetByPose.welcome} />
      </span>
    </button>
  );
}
