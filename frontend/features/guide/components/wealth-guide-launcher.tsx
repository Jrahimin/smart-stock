"use client";

import { guideCharacterAssetByPose } from "@/features/guide/character/guide-character-assets";
import { getWealthGuideLauncherCopy } from "@/features/guide/dialogs/wealth-dialogs";
import { useWealthGuideLauncherProminent } from "@/features/guide/hooks/use-dashboard-sidebar-guide-controller";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export function openWealthOverviewGuide() { window.dispatchEvent(new Event("wealth-overview-guide:open")); }

export function WealthGuideLauncher({ className = "market-dashboard-guide-button", locale = DEFAULT_LOCALE }: { className?: string; locale?: AppLocale }) {
  const prominent = useWealthGuideLauncherProminent();
  const copy = getWealthGuideLauncherCopy(locale);
  return <button aria-label={copy.ariaLabel} className={`${className}${prominent ? " market-dashboard-guide-button--prominent" : ""}`} onClick={openWealthOverviewGuide} title={copy.title} type="button"><span aria-hidden="true" className="market-dashboard-guide-button-avatar"><img alt="" className="market-dashboard-guide-button-mascot" src={guideCharacterAssetByPose.welcome} /></span></button>;
}
