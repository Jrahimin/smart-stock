"use client";

import { Route } from "lucide-react";

const GUIDE_OPEN_EVENT = "dashboard-sidebar-guide:open";

export function openDashboardSidebarGuide() {
  window.dispatchEvent(new Event(GUIDE_OPEN_EVENT));
}

type DashboardGuideLauncherProps = {
  className?: string;
};

export function DashboardGuideLauncher({ className = "market-dashboard-guide-button" }: DashboardGuideLauncherProps) {
  return (
    <button
      aria-label="নির্দেশিত ট্যুর খুলুন"
      className={className}
      onClick={openDashboardSidebarGuide}
      title="নির্দেশিত ট্যুর"
      type="button"
    >
      <Route aria-hidden="true" size={16} strokeWidth={2.2} />
    </button>
  );
}
