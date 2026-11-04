"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DashboardDesktopGuide, type ProductGuideStepState } from "@/features/guide/components/dashboard-desktop-guide";
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
  const wasActive = useRef(false);
  const handleStepChange = useCallback(({ active }: ProductGuideStepState) => {
    if (!active && wasActive.current) {
      const launcher = Array.from(document.querySelectorAll<HTMLElement>("[data-dashboard-guide-launcher]"))
        .find((button) => button.getClientRects().length > 0);
      launcher?.focus({ preventScroll: true });
    }
    wasActive.current = active;
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (isMobile) {
    return (
      <DashboardMobileGuide locale={dashboardLocale} onMobileNavigationOpenChange={onMobileNavigationOpenChange} onGuideStepChange={handleStepChange} />
    );
  }

  return <DashboardDesktopGuide locale={dashboardLocale} onGuideStepChange={handleStepChange} />;
}
