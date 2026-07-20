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

type WealthDesktopGuidePreferenceResponse = { key: "wealth_overview_desktop_guide"; state: ServerGuideState | null; updated_at: string | null };
type WealthMobileGuidePreferenceResponse = { key: "wealth_overview_mobile_guide"; state: ServerGuideState | null; updated_at: string | null };

const DESKTOP_GUIDE_PREFERENCE_PATH = "/preferences/dashboard-sidebar-guide";
const MOBILE_GUIDE_PREFERENCE_PATH = "/preferences/dashboard-mobile-guide";
const WEALTH_DESKTOP_GUIDE_PREFERENCE_PATH = "/preferences/wealth-overview-desktop-guide";
const WEALTH_MOBILE_GUIDE_PREFERENCE_PATH = "/preferences/wealth-overview-mobile-guide";

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

export function getWealthDesktopGuidePreference() {
  return backendApiGet<WealthDesktopGuidePreferenceResponse>(WEALTH_DESKTOP_GUIDE_PREFERENCE_PATH, undefined, { cache: "no-store" });
}
export function saveWealthDesktopGuidePreference(state: ServerGuideState) {
  return backendApiPut<WealthDesktopGuidePreferenceResponse>(WEALTH_DESKTOP_GUIDE_PREFERENCE_PATH, { state });
}
export function getWealthMobileGuidePreference() {
  return backendApiGet<WealthMobileGuidePreferenceResponse>(WEALTH_MOBILE_GUIDE_PREFERENCE_PATH, undefined, { cache: "no-store" });
}
export function saveWealthMobileGuidePreference(state: ServerGuideState) {
  return backendApiPut<WealthMobileGuidePreferenceResponse>(WEALTH_MOBILE_GUIDE_PREFERENCE_PATH, { state });
}
