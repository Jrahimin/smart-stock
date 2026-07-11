import { backendApiGet, backendApiPut } from "@/lib/api/backend-api-client";

type ServerGuideState = "COMPLETED" | "DISMISSED";

type DashboardSidebarGuidePreferenceResponse = {
  key: "dashboard_sidebar_guide";
  state: ServerGuideState | null;
  updated_at: string | null;
};

type DashboardMobileGuidePreferenceResponse = {
  key: "dashboard_mobile_intro";
  state: ServerGuideState | null;
  updated_at: string | null;
};

const DESKTOP_GUIDE_PREFERENCE_PATH = "/preferences/dashboard-sidebar-guide";
const MOBILE_GUIDE_PREFERENCE_PATH = "/preferences/dashboard-mobile-guide";

export function getDashboardSidebarGuidePreference() {
  return backendApiGet<DashboardSidebarGuidePreferenceResponse>(DESKTOP_GUIDE_PREFERENCE_PATH, undefined, {
    cache: "no-store",
  });
}

export function saveDashboardSidebarGuidePreference(state: ServerGuideState) {
  return backendApiPut<DashboardSidebarGuidePreferenceResponse>(DESKTOP_GUIDE_PREFERENCE_PATH, { state });
}

export function getDashboardMobileGuidePreference() {
  return backendApiGet<DashboardMobileGuidePreferenceResponse>(MOBILE_GUIDE_PREFERENCE_PATH, undefined, {
    cache: "no-store",
  });
}

export function saveDashboardMobileGuidePreference(state: ServerGuideState) {
  return backendApiPut<DashboardMobileGuidePreferenceResponse>(MOBILE_GUIDE_PREFERENCE_PATH, { state });
}
