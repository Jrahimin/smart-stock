"use client";

import { useEffect, useState } from "react";

import { DashboardDesktopGuide } from "@/features/guide/components/dashboard-desktop-guide";
import { DashboardMobileGuide } from "@/features/guide/components/dashboard-mobile-guide";

type DashboardSidebarGuideProps = {
  onMobileNavigationOpenChange: (isOpen: boolean) => void;
};

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia("(max-width: 1023px)").matches;
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function DashboardSidebarGuide({ onMobileNavigationOpenChange }: DashboardSidebarGuideProps) {
  const isMobile = useIsMobileViewport();

  if (isMobile) {
    return <DashboardMobileGuide onMobileNavigationOpenChange={onMobileNavigationOpenChange} />;
  }

  return <DashboardDesktopGuide />;
}
