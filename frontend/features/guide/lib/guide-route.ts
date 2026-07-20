/** Routes that render the market dashboard and should run the onboarding guide. */
export function isDashboardGuideRoute(pathname: string) {
  return pathname === "/";
}

/** The Wealth onboarding guide is intentionally limited to its overview route. */
export function isWealthOverviewGuideRoute(pathname: string) {
  return pathname === "/wealth";
}

/** The Tax Planner guide only runs on the planner workspace, not other Wealth tools. */
export function isTaxPlannerGuideRoute(pathname: string) {
  return pathname === "/wealth/tools/tax-planner";
}
