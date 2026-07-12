"use client";

import { useEffect, useState } from "react";

import { DashboardDesktopGuide } from "@/features/guide/components/dashboard-desktop-guide";
import { DashboardMobileGuide } from "@/features/guide/components/dashboard-mobile-guide";

import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type DashboardSidebarGuideProps = {
  onMobileNavigationOpenChange: (isOpen: boolean) => void;
  dashboardLocale?: AppLocale;
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

export function DashboardSidebarGuide({
  onMobileNavigationOpenChange,
  dashboardLocale = DEFAULT_LOCALE,
}: DashboardSidebarGuideProps) {
  const isMobile = useIsMobileViewport();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (isMobile) {
    return (
      <DashboardMobileGuide locale={dashboardLocale} onMobileNavigationOpenChange={onMobileNavigationOpenChange} />
    );
  }

  return <DashboardDesktopGuide locale={dashboardLocale} />;
}
