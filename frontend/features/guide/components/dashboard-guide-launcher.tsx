"use client";

import { guideCharacterAssetByPose } from "@/features/guide/character/guide-character-assets";
import { useDashboardGuideLauncherProminent } from "@/features/guide/hooks/use-dashboard-sidebar-guide-controller";

const GUIDE_OPEN_EVENT = "dashboard-sidebar-guide:open";

export function openDashboardSidebarGuide() {
  window.dispatchEvent(new Event(GUIDE_OPEN_EVENT));
}

type DashboardGuideLauncherProps = {
  className?: string;
};

export function DashboardGuideLauncher({ className = "market-dashboard-guide-button" }: DashboardGuideLauncherProps) {
  const prominent = useDashboardGuideLauncherProminent();

  return (
    <button
      aria-label="গাইড ট্যুর শুরু করুন"
      className={`${className}${prominent ? " market-dashboard-guide-button--prominent" : ""}`}
      onClick={openDashboardSidebarGuide}
      title="ট্যুর গাইড"
      type="button"
    >
      <span aria-hidden="true" className="market-dashboard-guide-button-avatar">
        <img alt="" className="market-dashboard-guide-button-mascot" src={guideCharacterAssetByPose.welcome} />
      </span>
    </button>
  );
}
