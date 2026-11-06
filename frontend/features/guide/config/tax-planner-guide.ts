import { getTaxPlannerGuideDialogs } from "@/features/guide/dialogs/tax-planner-dialogs";
import type { GuideCharacterPose, GuideDialog, GuideHighlightStyle, GuideStep } from "@/features/guide/types/guide-types";
import type { AppLocale } from "@/lib/locale/app-locale";

export const TAX_PLANNER_DESKTOP_GUIDE_VERSION = 1;
export const TAX_PLANNER_MOBILE_GUIDE_VERSION = 1;

export type TaxPlannerMobileGuideStep = {
  id: string;
  dialog: GuideDialog;
  characterPose: GuideCharacterPose;
  target: string | null;
  highlightStyle?: GuideHighlightStyle;
};

export function getTaxPlannerDesktopGuideSteps(locale: AppLocale): readonly GuideStep[] {
  const dialog = getTaxPlannerGuideDialogs(locale);
  return [
    { id: "welcome", target: '[data-guide="tax-planner-year"]', dialog: dialog.welcome, characterPose: "welcome", highlightStyle: "region", layoutMode: "beside-target", characterAnchor: "upper" },
    { id: "quick", target: '[data-guide="tax-planner-quick"]', dialog: dialog.quick, characterPose: "point-left", highlightStyle: "region", layoutMode: "beside-target", characterAnchor: "upper" },
    { id: "detailed", target: '[data-guide="tax-planner-detailed"]', dialog: dialog.detailed, characterPose: "thinking", highlightStyle: "region", layoutMode: "beside-target", characterAnchor: "upper" },
    { id: "rebate", target: '[data-guide="tax-planner-result"]', dialog: dialog.rebate, characterPose: "point-left", highlightStyle: "region", layoutMode: "beside-target", characterAnchor: "upper" },
    { id: "finish", target: '[data-guide="tax-planner-help"]', dialog: dialog.finish, characterPose: "farewell", highlightStyle: "region", layoutMode: "beside-target", characterAnchor: "upper" },
  ];
}

export function getTaxPlannerMobileGuideSteps(locale: AppLocale): readonly TaxPlannerMobileGuideStep[] {
  return getTaxPlannerDesktopGuideSteps(locale).map((step) => ({ id: step.id, dialog: step.dialog, characterPose: step.characterPose, target: step.target, highlightStyle: step.highlightStyle }));
}
