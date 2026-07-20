import { getWealthGuideDialogs } from "@/features/guide/dialogs/wealth-dialogs";
import type { GuideCharacterPose, GuideDialog, GuideHighlightStyle, GuideStep } from "@/features/guide/types/guide-types";
import type { AppLocale } from "@/lib/locale/app-locale";

export const WEALTH_OVERVIEW_DESKTOP_GUIDE_VERSION = 1;
export const WEALTH_OVERVIEW_MOBILE_GUIDE_VERSION = 1;

export type WealthMobileGuideStep = {
  id: string;
  dialog: GuideDialog;
  characterPose: GuideCharacterPose;
  target: string | null;
  highlightStyle?: GuideHighlightStyle;
};

export function getWealthDesktopGuideSteps(locale: AppLocale): readonly GuideStep[] {
  const dialog = getWealthGuideDialogs(locale);
  return [
    { id: "welcome", target: null, dialog: dialog.welcome, characterPose: "welcome", layoutMode: "center-cluster" },
    { id: "menu", target: '[data-guide="wealth-menu"]', dialog: dialog.menu, characterPose: "point-left", highlightStyle: "navigation", layoutMode: "beside-target", characterAnchor: "upper" },
    { id: "calculators", target: '[data-guide="wealth-calculators-menu"]', dialog: dialog.calculators, characterPose: "point-left", highlightStyle: "navigation", layoutMode: "beside-target", characterAnchor: "upper" },
    { id: "tax-planner", target: '[data-guide="wealth-tax-planner"]', dialog: dialog.taxPlanner, characterPose: "point-left", highlightStyle: "navigation", layoutMode: "beside-target" },
    { id: "other-tools", target: '[data-guide="wealth-other-tools"]', dialog: dialog.otherTools, characterPose: "farewell", highlightStyle: "navigation", layoutMode: "beside-target" },
  ];
}

export function getWealthMobileGuideSteps(locale: AppLocale): readonly WealthMobileGuideStep[] {
  return getWealthDesktopGuideSteps(locale).map((step) => ({
    id: step.id,
    dialog: step.dialog,
    characterPose: step.characterPose,
    target: step.target,
    highlightStyle: step.highlightStyle,
  }));
}
