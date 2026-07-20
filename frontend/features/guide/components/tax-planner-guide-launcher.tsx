"use client";

import { guideCharacterAssetByPose } from "@/features/guide/character/guide-character-assets";
import { getTaxPlannerGuideLauncherCopy } from "@/features/guide/dialogs/tax-planner-dialogs";
import { useTaxPlannerGuideLauncherProminent } from "@/features/guide/hooks/use-dashboard-sidebar-guide-controller";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export function openTaxPlannerGuide() {
  window.dispatchEvent(new Event("tax-planner-guide:open"));
}

export function TaxPlannerGuideLauncher({ className = "market-dashboard-guide-button", locale = DEFAULT_LOCALE }: { className?: string; locale?: AppLocale }) {
  const prominent = useTaxPlannerGuideLauncherProminent();
  const copy = getTaxPlannerGuideLauncherCopy(locale);
  return <button aria-label={copy.ariaLabel} className={`${className}${prominent ? " market-dashboard-guide-button--prominent" : ""}`} onClick={openTaxPlannerGuide} title={copy.title} type="button"><span aria-hidden="true" className="market-dashboard-guide-button-avatar"><img alt="" className="market-dashboard-guide-button-mascot" src={guideCharacterAssetByPose.welcome} /></span></button>;
}
