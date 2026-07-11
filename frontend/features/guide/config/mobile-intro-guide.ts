import { mobileIntroDialogs } from "@/features/guide/dialogs/mobile-intro.bn";
import type { GuideCharacterPose, GuideDialog, GuideHighlightStyle } from "@/features/guide/types/guide-types";

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

export const dashboardMobileGuideSteps: readonly DashboardMobileGuideStep[] = [
  {
    id: "welcome",
    dialog: mobileIntroDialogs.welcome,
    characterPose: "welcome",
    openDrawer: false,
    target: null,
  },
  {
    id: "main-menu",
    dialog: mobileIntroDialogs.mainMenu,
    characterPose: "point-right",
    openDrawer: true,
    target: '[data-guide="primary-navigation"]',
    highlightStyle: "navigation",
  },
  {
    id: "wealth",
    dialog: mobileIntroDialogs.wealth,
    characterPose: "point-right",
    openDrawer: true,
    target: '[data-guide="nav-wealth-workspace"]',
    highlightStyle: "navigation",
  },
  {
    id: "trading",
    dialog: mobileIntroDialogs.trading,
    characterPose: "point-right",
    openDrawer: true,
    target: '[data-guide="trading-workspace"]',
    highlightStyle: "navigation",
  },
  {
    id: "finish",
    dialog: mobileIntroDialogs.finish,
    characterPose: "farewell",
    openDrawer: false,
    target: null,
  },
];
