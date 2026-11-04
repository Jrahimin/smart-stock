import { getDashboardGuideDialogs, getMobileIntroDialogs } from "@/features/guide/dialogs/dashboard-dialogs";
import { SECTOR_TILES_GUIDE_TARGET } from "@/features/guide/config/dashboard-sidebar-guide";
import type { GuideCharacterPose, GuideDialog, GuideHighlightStyle } from "@/features/guide/types/guide-types";
import type { AppLocale } from "@/lib/locale/app-locale";

export const DASHBOARD_MOBILE_GUIDE_VERSION = 1;

export type DashboardMobileGuideStep = {
  id: string;
  dialog: GuideDialog;
  characterPose: GuideCharacterPose;
  openDrawer: boolean;
  target: string | null;
  highlightStyle?: GuideHighlightStyle;
};

export function getDashboardMobileGuideSteps(locale: AppLocale): readonly DashboardMobileGuideStep[] {
  const dialogs = getMobileIntroDialogs(locale);
  const dashboard = getDashboardGuideDialogs(locale);

  return [
    {
      id: "welcome",
      dialog: dialogs.welcome,
      characterPose: "welcome",
      openDrawer: false,
      target: null,
    },
    { id: "market-pulse-link", dialog: dashboard.pulseLink, characterPose: "point-left", openDrawer: false, target: '[data-guide="market-pulse-link"]' },
    { id: "sector-map", dialog: dashboard.map, characterPose: "point-left", openDrawer: false, target: '[data-guide="sector-map"]' },
    { id: "sector-map-tiles", dialog: dashboard.tiles, characterPose: "point-left", openDrawer: false, target: SECTOR_TILES_GUIDE_TARGET },
    { id: "smart-signals", dialog: dashboard.signals, characterPose: "thinking", openDrawer: false, target: '[data-guide="smart-signals"]' },
    {
      id: "main-menu",
      dialog: dialogs.mainMenu,
      characterPose: "point-right",
      openDrawer: true,
      target: '[data-guide="nav-dashboard"]',
      highlightStyle: "navigation",
    },
    {
      id: "wealth",
      dialog: dialogs.wealth,
      characterPose: "point-right",
      openDrawer: true,
      target: '[data-guide="nav-wealth-workspace"]',
      highlightStyle: "navigation",
    },
    {
      id: "trading",
      dialog: dialogs.trading,
      characterPose: "point-right",
      openDrawer: true,
      target: '[data-guide="trading-workspace"]',
      highlightStyle: "navigation",
    },
    {
      id: "finish",
      dialog: dialogs.finish,
      characterPose: "farewell",
      openDrawer: false,
      target: null,
    },
  ];
}
