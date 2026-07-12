/** Routes that render the market dashboard and should run the onboarding guide. */
export function isDashboardGuideRoute(pathname: string) {
  return pathname === "/";
}
