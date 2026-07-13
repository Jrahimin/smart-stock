import { getMobileIntroDialogs } from "@/features/guide/dialogs/dashboard-dialogs";
import type { GuideCharacterPose, GuideDialog, GuideHighlightStyle } from "@/features/guide/types/guide-types";
import type { AppLocale } from "@/lib/locale/app-locale";

export const DASHBOARD_MOBILE_GUIDE_VERSION = 1;
export const DASHBOARD_MOBILE_GUIDE_STEP_COUNT = 5;

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

  return [
    {
      id: "welcome",
      dialog: dialogs.welcome,
      characterPose: "welcome",
      openDrawer: false,
      target: null,
    },
    {
      id: "main-menu",
      dialog: dialogs.mainMenu,
      characterPose: "point-right",
      openDrawer: true,
      target: '[data-guide="primary-navigation"]',
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
