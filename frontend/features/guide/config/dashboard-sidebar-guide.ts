import type { AppLocale } from "@/lib/locale/app-locale";
import {
  getDashboardGuideDialogs,
  getSidebarGuideDialogs,
} from "@/features/guide/dialogs/dashboard-dialogs";
import type { GuideStep } from "@/features/guide/types/guide-types";

export const DASHBOARD_SIDEBAR_GUIDE_VERSION = 2;
export const DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT = 6;
/** Step index where the desktop sidebar should expand (sidebar-introduction). */
export const DASHBOARD_GUIDE_SIDEBAR_EXPAND_STEP_INDEX = DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT - 1;

export function getDashboardSidebarGuideSteps(locale: AppLocale): readonly GuideStep[] {
  const dashboardDialogs = getDashboardGuideDialogs(locale);
  const sidebarDialogs = getSidebarGuideDialogs(locale);

  return [
    {
      id: "welcome",
      target: null,
      dialog: dashboardDialogs.welcome,
      characterPose: "welcome",
      layoutMode: "center-cluster",
    },
    {
      id: "market-pulse",
      target: '[data-guide="market-pulse"]',
      dialog: dashboardDialogs.pulse,
      characterPose: "point-left",
      preferredCharacterPlacements: ["right", "top-right"],
      preferredBubblePlacements: ["top-right", "right"],
      highlightStyle: "region",
      layoutMode: "beside-target",
      characterAnchor: "upper",
    },
    {
      id: "market-breadth",
      target: '[data-guide="market-breadth"]',
      dialog: dashboardDialogs.breadth,
      characterPose: "point-left",
      preferredCharacterPlacements: ["right", "top-right"],
      preferredBubblePlacements: ["top-right", "right"],
      highlightStyle: "card",
      layoutMode: "beside-target",
      characterAnchor: "center",
    },
    {
      id: "smart-signals",
      target: '[data-guide="smart-signals"]',
      dialog: dashboardDialogs.signals,
      characterPose: "thinking",
      preferredCharacterPlacements: ["right", "top-right"],
      preferredBubblePlacements: ["top-right", "right"],
      highlightStyle: "card",
      layoutMode: "beside-target",
      characterAnchor: "upper",
    },
    {
      id: "market-discovery",
      target: '[data-guide="market-discovery"]',
      dialog: dashboardDialogs.discovery,
      characterPose: "point-left",
      preferredCharacterPlacements: ["right", "top-right"],
      preferredBubblePlacements: ["top-right", "right"],
      highlightStyle: "region",
      layoutMode: "beside-target",
      characterAnchor: "upper",
    },
    {
      id: "sidebar-introduction",
      target: '[data-guide="primary-navigation"]',
      dialog: dashboardDialogs.sidebar,
      characterPose: "point-right",
      preferredCharacterPlacements: ["right"],
      preferredBubblePlacements: ["right"],
      highlightStyle: "navigation",
      layoutMode: "sidebar-adjacent",
      characterAnchor: "upper",
    },
    {
      id: "nav-wealth-workspace",
      target: '[data-guide="nav-wealth-workspace"]',
      dialog: sidebarDialogs.wealthWorkspace,
      characterPose: "point-right",
      preferredCharacterPlacements: ["right"],
      preferredBubblePlacements: ["right"],
      highlightStyle: "navigation",
      layoutMode: "sidebar-adjacent",
    },
    {
      id: "nav-dashboard",
      target: '[data-guide="nav-dashboard"]',
      dialog: sidebarDialogs.dashboard,
      characterPose: "point-right",
      preferredCharacterPlacements: ["right"],
      preferredBubblePlacements: ["right"],
      highlightStyle: "navigation",
      layoutMode: "sidebar-adjacent",
    },
    {
      id: "nav-market-pulse",
      target: '[data-guide="nav-market-pulse"]',
      dialog: sidebarDialogs.marketPulse,
      characterPose: "point-right",
      preferredCharacterPlacements: ["right"],
      preferredBubblePlacements: ["right"],
      highlightStyle: "navigation",
      layoutMode: "sidebar-adjacent",
    },
    {
      id: "nav-stocks",
      target: '[data-guide="nav-stocks"]',
      dialog: sidebarDialogs.stocks,
      characterPose: "point-right",
      preferredCharacterPlacements: ["right"],
      preferredBubblePlacements: ["right"],
      highlightStyle: "navigation",
      layoutMode: "sidebar-adjacent",
    },
    {
      id: "nav-scanner",
      target: '[data-guide="nav-scanner"]',
      dialog: sidebarDialogs.scanner,
      characterPose: "point-right",
      preferredCharacterPlacements: ["right"],
      preferredBubblePlacements: ["right"],
      highlightStyle: "navigation",
      layoutMode: "sidebar-adjacent",
    },
    {
      id: "nav-signals",
      target: '[data-guide="nav-signals"]',
      dialog: sidebarDialogs.signals,
      characterPose: "point-right",
      preferredCharacterPlacements: ["right"],
      preferredBubblePlacements: ["right"],
      highlightStyle: "navigation",
      layoutMode: "sidebar-adjacent",
    },
    {
      id: "nav-watchlist",
      target: '[data-guide="nav-watchlist"]',
      dialog: sidebarDialogs.watchlist,
      characterPose: "farewell",
      preferredCharacterPlacements: ["right"],
      preferredBubblePlacements: ["right"],
      highlightStyle: "navigation",
      layoutMode: "sidebar-adjacent",
    },
  ];
}
