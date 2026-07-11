"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { DASHBOARD_SIDEBAR_GUIDE_VERSION } from "@/features/guide/config/dashboard-sidebar-guide";
import { DASHBOARD_MOBILE_GUIDE_VERSION } from "@/features/guide/config/mobile-intro-guide";
import {
  GUIDE_AUTO_START_DELAY_MS,
  GUIDE_SERVER_SYNC_TIMEOUT_MS,
  GUIDE_USER_ACTIVITY_GUARD_MS,
} from "@/features/guide/lib/guide-preference-constants";
import {
  getGuidePreferenceStorageKey,
  isGuideAutoStartEligible,
  isGuideLauncherProminent,
  isGuideNudgeEligible,
  markGuideAutoStartShown,
  markGuideAutoStartedThisSession,
  mergeServerPreference,
  recordGuideHardDismiss,
  recordGuideNudgeShown,
  recordGuideNudgeSnooze,
  resolveGuideCompletion,
  toServerGuideState,
  writeGuidePreference,
  type GuidePreferenceScope,
  type GuideServerState,
} from "@/features/guide/lib/guide-preference-storage";
import {
  getDashboardMobileGuidePreference,
  getDashboardSidebarGuidePreference,
  saveDashboardMobileGuidePreference,
  saveDashboardSidebarGuidePreference,
} from "@/features/guide/services/guide-preference-api";
import type { GuideCompletion } from "@/features/guide/types/guide-types";
import { useAuth } from "@/features/auth/context/auth-context";
import { useGuideTargetAvailable } from "@/features/guide/hooks/use-guide-target-layout";

export type GuideRunTrigger = "auto" | "manual" | "nudge";

export type GuideRun = {
  id: number;
  trigger: GuideRunTrigger;
};

type GuideGate = {
  autoStartEligible: boolean;
  nudgeEligible: boolean;
  launcherProminent: boolean;
  ready: boolean;
};

type GuideControllerConfig = {
  scope: GuidePreferenceScope;
  requirePulseTarget: boolean;
  getServerPreference: () => Promise<{ state: GuideServerState | null }>;
  saveServerPreference: (state: GuideServerState) => Promise<unknown>;
};

const DESKTOP_GUIDE_SCOPE: GuidePreferenceScope = { surface: "desktop", version: DASHBOARD_SIDEBAR_GUIDE_VERSION };
const MOBILE_GUIDE_SCOPE: GuidePreferenceScope = { surface: "mobile", version: DASHBOARD_MOBILE_GUIDE_VERSION };

function createGuideRun(trigger: GuideRunTrigger): GuideRun {
  return { id: Date.now(), trigger };
}

function refreshGate(scope: GuidePreferenceScope, serverState?: GuideServerState | null): GuideGate {
  const options = serverState ? { serverState } : undefined;
  return {
    autoStartEligible: isGuideAutoStartEligible(scope, options),
    launcherProminent: isGuideLauncherProminent(scope),
    nudgeEligible: isGuideNudgeEligible(scope, options),
    ready: true,
  };
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia("(max-width: 1023px)").matches;
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function useDashboardGuideController(config: GuideControllerConfig) {
  const { scope, requirePulseTarget, getServerPreference, saveServerPreference } = config;
  const pathname = usePathname();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const pulseTargetReady = useGuideTargetAvailable('[data-guide="market-pulse"]', { requireReady: true });
  const readinessTargetReady = requirePulseTarget ? pulseTargetReady : true;

  const userInteractedRef = useRef(false);
  const autoStartScheduledRef = useRef(false);
  const nudgeScheduledRef = useRef(false);
  const [gate, setGate] = useState<GuideGate>(() => ({
    autoStartEligible: false,
    launcherProminent: false,
    nudgeEligible: false,
    ready: false,
  }));
  const [guideRun, setGuideRun] = useState<GuideRun | null>(null);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [suppressContextualPrompts, setSuppressContextualPrompts] = useState(false);
  const [skipConfirmationOpen, setSkipConfirmationOpen] = useState(false);

  const isDashboard = pathname === "/dashboard";
  const isGuideActive = guideRun !== null;

  const startGuideRun = useCallback((trigger: GuideRunTrigger) => {
    setNudgeOpen(false);
    setSkipConfirmationOpen(false);
    setSuppressContextualPrompts(false);
    setStepIndex(0);
    setGuideRun(createGuideRun(trigger));
  }, []);

  const stopGuideRun = useCallback(() => {
    setGuideRun(null);
    setSkipConfirmationOpen(false);
  }, []);

  const syncGate = useCallback(
    (serverState?: GuideServerState | null) => {
      setGate(refreshGate(scope, serverState));
    },
    [scope],
  );

  useLayoutEffect(() => {
    if (!isDashboard) {
      stopGuideRun();
      setNudgeOpen(false);
      return;
    }

    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated) {
      syncGate();
    }
  }, [isAuthenticated, isAuthLoading, isDashboard, stopGuideRun, syncGate]);

  useEffect(() => {
    if (!isDashboard || isAuthLoading || !isAuthenticated) {
      return;
    }

    let cancelled = false;
    let resolved = false;

    const timeoutId = window.setTimeout(() => {
      if (cancelled || resolved) {
        return;
      }

      resolved = true;
      syncGate(null);
    }, GUIDE_SERVER_SYNC_TIMEOUT_MS);

    async function syncServerPreference() {
      let serverState: GuideServerState | null = null;

      try {
        const serverPreference = await getServerPreference();
        if (cancelled) {
          return;
        }

        serverState = serverPreference.state;
        mergeServerPreference(scope, serverPreference.state);

        const localCompletion = resolveGuideCompletion(scope, { serverState });
        if (!serverPreference.state && localCompletion) {
          void saveServerPreference(toServerGuideState(localCompletion));
        }
      } catch {
        if (!cancelled && !resolved) {
          resolved = true;
          window.clearTimeout(timeoutId);
          syncGate(null);
        }
        return;
      }

      if (!cancelled && !resolved) {
        resolved = true;
        window.clearTimeout(timeoutId);
        syncGate(serverState);
      }
    }

    void syncServerPreference();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [getServerPreference, isAuthenticated, isAuthLoading, isDashboard, saveServerPreference, scope, syncGate]);

  useEffect(() => {
    if (!isDashboard || isAuthLoading) {
      return;
    }

    userInteractedRef.current = false;
    const startedAt = Date.now();

    const markInteraction = () => {
      if (Date.now() - startedAt <= GUIDE_USER_ACTIVITY_GUARD_MS) {
        userInteractedRef.current = true;
      }
    };

    window.addEventListener("pointerdown", markInteraction, true);
    window.addEventListener("keydown", markInteraction, true);
    window.addEventListener("wheel", markInteraction, { capture: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", markInteraction, true);
      window.removeEventListener("keydown", markInteraction, true);
      window.removeEventListener("wheel", markInteraction, true);
    };
  }, [isAuthLoading, isDashboard]);

  useEffect(() => {
    if (
      !isDashboard ||
      !gate.ready ||
      !gate.autoStartEligible ||
      !readinessTargetReady ||
      guideRun ||
      nudgeOpen ||
      autoStartScheduledRef.current
    ) {
      return;
    }

    autoStartScheduledRef.current = true;
    const timeoutId = window.setTimeout(() => {
      if (userInteractedRef.current) {
        markGuideAutoStartedThisSession(scope);
        syncGate();
        return;
      }

      markGuideAutoStartShown(scope);
      markGuideAutoStartedThisSession(scope);
      syncGate();
      startGuideRun("auto");
    }, GUIDE_AUTO_START_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      autoStartScheduledRef.current = false;
    };
  }, [
    gate.autoStartEligible,
    gate.ready,
    guideRun,
    isDashboard,
    nudgeOpen,
    readinessTargetReady,
    scope,
    startGuideRun,
    syncGate,
  ]);

  useEffect(() => {
    if (
      !isDashboard ||
      !gate.ready ||
      !gate.nudgeEligible ||
      !readinessTargetReady ||
      guideRun ||
      nudgeOpen ||
      nudgeScheduledRef.current
    ) {
      return;
    }

    nudgeScheduledRef.current = true;
    const timeoutId = window.setTimeout(() => {
      if (userInteractedRef.current || guideRun) {
        return;
      }

      recordGuideNudgeShown(scope);
      setNudgeOpen(true);
      syncGate();
    }, GUIDE_AUTO_START_DELAY_MS + 600);

    return () => {
      window.clearTimeout(timeoutId);
      nudgeScheduledRef.current = false;
    };
  }, [gate.nudgeEligible, gate.ready, guideRun, isDashboard, nudgeOpen, readinessTargetReady, scope, syncGate]);

  useEffect(() => {
    const openManualGuide = () => {
      if (pathname !== "/dashboard") {
        return;
      }

      setNudgeOpen(false);
      startGuideRun("manual");
    };

    window.addEventListener("dashboard-sidebar-guide:open", openManualGuide);
    window.addEventListener("dashboard-sidebar-guide:replay", openManualGuide);
    return () => {
      window.removeEventListener("dashboard-sidebar-guide:open", openManualGuide);
      window.removeEventListener("dashboard-sidebar-guide:replay", openManualGuide);
    };
  }, [pathname, startGuideRun]);

  const persistGuideOutcome = useCallback(
    (completion: GuideCompletion) => {
      writeGuidePreference(scope, completion);
      if (isAuthenticated) {
        void saveServerPreference(toServerGuideState(completion));
      }

      markGuideAutoStartedThisSession(scope);
      syncGate();
    },
    [isAuthenticated, saveServerPreference, scope, syncGate],
  );

  const skipGuide = useCallback(() => {
    if (suppressContextualPrompts) {
      recordGuideHardDismiss(scope);
      if (isAuthenticated) {
        void saveServerPreference("DISMISSED");
      }
    } else {
      persistGuideOutcome({ status: "skipped", suppressContextualPrompts: false });
    }

    markGuideAutoStartedThisSession(scope);
    stopGuideRun();
    syncGate();
  }, [isAuthenticated, persistGuideOutcome, saveServerPreference, scope, stopGuideRun, suppressContextualPrompts, syncGate]);

  const finishGuide = useCallback(
    (completion: GuideCompletion) => {
      persistGuideOutcome(completion);
      stopGuideRun();
    },
    [persistGuideOutcome, stopGuideRun],
  );

  const acceptGuideNudge = useCallback(() => {
    setNudgeOpen(false);
    startGuideRun("nudge");
  }, [startGuideRun]);

  const snoozeGuideNudge = useCallback(() => {
    recordGuideNudgeSnooze(scope);
    setNudgeOpen(false);
    syncGate();
  }, [scope, syncGate]);

  const dismissGuideNudge = useCallback(() => {
    recordGuideHardDismiss(scope);
    if (isAuthenticated) {
      void saveServerPreference("DISMISSED");
    }

    setNudgeOpen(false);
    syncGate();
  }, [isAuthenticated, saveServerPreference, scope, syncGate]);

  return {
    acceptGuideNudge,
    dismissGuideNudge,
    finishGuide,
    guideRun,
    isDashboard,
    isGuideActive,
    launcherProminent: gate.launcherProminent,
    nudgeOpen,
    pulseTargetReady: readinessTargetReady,
    setSkipConfirmationOpen,
    setStepIndex,
    setSuppressContextualPrompts,
    skipConfirmationOpen,
    skipGuide,
    snoozeGuideNudge,
    stepIndex,
    suppressContextualPrompts,
  };
}

export function useDashboardDesktopGuideController() {
  return useDashboardGuideController({
    scope: DESKTOP_GUIDE_SCOPE,
    requirePulseTarget: true,
    getServerPreference: getDashboardSidebarGuidePreference,
    saveServerPreference: saveDashboardSidebarGuidePreference,
  });
}

export function useDashboardMobileGuideController() {
  return useDashboardGuideController({
    scope: MOBILE_GUIDE_SCOPE,
    requirePulseTarget: false,
    getServerPreference: getDashboardMobileGuidePreference,
    saveServerPreference: saveDashboardMobileGuidePreference,
  });
}

export function useDashboardSidebarGuideController() {
  return useDashboardDesktopGuideController();
}

export function useDashboardGuideLauncherProminent() {
  const pathname = usePathname();
  const isMobile = useIsMobileViewport();
  const scope = isMobile ? MOBILE_GUIDE_SCOPE : DESKTOP_GUIDE_SCOPE;
  const [prominent, setProminent] = useState(false);
  const storageKey = getGuidePreferenceStorageKey(scope);

  useEffect(() => {
    if (pathname !== "/dashboard") {
      setProminent(false);
      return;
    }

    setProminent(isGuideLauncherProminent(scope));
  }, [pathname, scope]);

  useEffect(() => {
    const refresh = () => {
      if (pathname !== "/dashboard") {
        return;
      }

      setProminent(isGuideLauncherProminent(scope));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        refresh();
      }
    };

    window.addEventListener("dashboard-sidebar-guide:preference-changed", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("dashboard-sidebar-guide:preference-changed", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [pathname, scope, storageKey]);

  return prominent;
}
