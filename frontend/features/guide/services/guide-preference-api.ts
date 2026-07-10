import { backendApiGet, backendApiPut } from "@/lib/api/backend-api-client";

type ServerGuideState = "COMPLETED" | "DISMISSED";

type DashboardSidebarGuidePreferenceResponse = {
  key: "dashboard_sidebar_guide";
  state: ServerGuideState | null;
  updated_at: string | null;
};

const GUIDE_PREFERENCE_PATH = "/preferences/dashboard-sidebar-guide";

export function getDashboardSidebarGuidePreference() {
  return backendApiGet<DashboardSidebarGuidePreferenceResponse>(GUIDE_PREFERENCE_PATH, undefined, { cache: "no-store" });
}

export function saveDashboardSidebarGuidePreference(state: ServerGuideState) {
  return backendApiPut<DashboardSidebarGuidePreferenceResponse>(GUIDE_PREFERENCE_PATH, { state });
}
