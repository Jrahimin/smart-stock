"use client";

import { useEffect, useState } from "react";

import { DashboardDesktopGuide, type ProductGuideStepState } from "@/features/guide/components/dashboard-desktop-guide";
import { DashboardMobileGuide } from "@/features/guide/components/dashboard-mobile-guide";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function TaxPlannerGuide({
  locale = DEFAULT_LOCALE,
  onGuideStepChange,
}: {
  locale?: AppLocale;
  onGuideStepChange?: (state: ProductGuideStepState) => void;
}) {
  const isMobile = useIsMobileViewport();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (isMobile) {
    return <DashboardMobileGuide journey="tax-planner" locale={locale} onGuideStepChange={onGuideStepChange} onMobileNavigationOpenChange={() => undefined} />;
  }
  return <DashboardDesktopGuide journey="tax-planner" locale={locale} onGuideStepChange={onGuideStepChange} />;
}
