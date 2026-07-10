"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { DASHBOARD_SIDEBAR_GUIDE_VERSION } from "@/features/guide/config/dashboard-sidebar-guide";
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
} from "@/features/guide/lib/guide-preference-storage";
import {
  getDashboardSidebarGuidePreference,
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

function createGuideRun(trigger: GuideRunTrigger): GuideRun {
  return { id: Date.now(), trigger };
}

function refreshGate(serverState?: "COMPLETED" | "DISMISSED" | null): GuideGate {
  const options = serverState ? { serverState } : undefined;
  return {
    autoStartEligible: isGuideAutoStartEligible(DASHBOARD_SIDEBAR_GUIDE_VERSION, options),
    launcherProminent: isGuideLauncherProminent(DASHBOARD_SIDEBAR_GUIDE_VERSION),
    nudgeEligible: isGuideNudgeEligible(DASHBOARD_SIDEBAR_GUIDE_VERSION, options),
    ready: true,
  };
}

export function useDashboardSidebarGuideController() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const pulseTargetReady = useGuideTargetAvailable('[data-guide="market-pulse"]', { requireReady: true });

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

  const syncGate = useCallback((serverState?: "COMPLETED" | "DISMISSED" | null) => {
    setGate(refreshGate(serverState));
  }, []);

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
      let serverState: "COMPLETED" | "DISMISSED" | null = null;

      try {
        const serverPreference = await getDashboardSidebarGuidePreference();
        if (cancelled) {
          return;
        }

        serverState = serverPreference.state;
        mergeServerPreference(DASHBOARD_SIDEBAR_GUIDE_VERSION, serverPreference.state);

        const localCompletion = resolveGuideCompletion(DASHBOARD_SIDEBAR_GUIDE_VERSION, { serverState });
        if (!serverPreference.state && localCompletion) {
          void saveDashboardSidebarGuidePreference(toServerGuideState(localCompletion));
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
  }, [isAuthenticated, isAuthLoading, isDashboard, syncGate]);

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
      !pulseTargetReady ||
      guideRun ||
      nudgeOpen ||
      autoStartScheduledRef.current
    ) {
      return;
    }

    autoStartScheduledRef.current = true;
    const timeoutId = window.setTimeout(() => {
      if (userInteractedRef.current) {
        markGuideAutoStartedThisSession(DASHBOARD_SIDEBAR_GUIDE_VERSION);
        syncGate();
        return;
      }

      markGuideAutoStartShown(DASHBOARD_SIDEBAR_GUIDE_VERSION);
      markGuideAutoStartedThisSession(DASHBOARD_SIDEBAR_GUIDE_VERSION);
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
    pulseTargetReady,
    startGuideRun,
    syncGate,
  ]);

  useEffect(() => {
    if (
      !isDashboard ||
      !gate.ready ||
      !gate.nudgeEligible ||
      !pulseTargetReady ||
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

      recordGuideNudgeShown(DASHBOARD_SIDEBAR_GUIDE_VERSION);
      setNudgeOpen(true);
      syncGate();
    }, GUIDE_AUTO_START_DELAY_MS + 600);

    return () => {
      window.clearTimeout(timeoutId);
      nudgeScheduledRef.current = false;
    };
  }, [gate.nudgeEligible, gate.ready, guideRun, isDashboard, nudgeOpen, pulseTargetReady, syncGate]);

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
      writeGuidePreference(DASHBOARD_SIDEBAR_GUIDE_VERSION, completion);
      if (isAuthenticated) {
        void saveDashboardSidebarGuidePreference(toServerGuideState(completion));
      }

      markGuideAutoStartedThisSession(DASHBOARD_SIDEBAR_GUIDE_VERSION);
      syncGate();
    },
    [isAuthenticated, syncGate],
  );

  const skipGuide = useCallback(() => {
    if (suppressContextualPrompts) {
      recordGuideHardDismiss(DASHBOARD_SIDEBAR_GUIDE_VERSION);
      if (isAuthenticated) {
        void saveDashboardSidebarGuidePreference("DISMISSED");
      }
    } else {
      persistGuideOutcome({ status: "skipped", suppressContextualPrompts: false });
    }

    markGuideAutoStartedThisSession(DASHBOARD_SIDEBAR_GUIDE_VERSION);
    stopGuideRun();
    syncGate();
  }, [isAuthenticated, persistGuideOutcome, stopGuideRun, suppressContextualPrompts, syncGate]);

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
    recordGuideNudgeSnooze(DASHBOARD_SIDEBAR_GUIDE_VERSION);
    setNudgeOpen(false);
    syncGate();
  }, [syncGate]);

  const dismissGuideNudge = useCallback(() => {
    recordGuideHardDismiss(DASHBOARD_SIDEBAR_GUIDE_VERSION);
    if (isAuthenticated) {
      void saveDashboardSidebarGuidePreference("DISMISSED");
    }

    setNudgeOpen(false);
    syncGate();
  }, [isAuthenticated, syncGate]);

  return {
    acceptGuideNudge,
    dismissGuideNudge,
    finishGuide,
    guideRun,
    isDashboard,
    isGuideActive,
    launcherProminent: gate.launcherProminent,
    nudgeOpen,
    pulseTargetReady,
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

export function useDashboardGuideLauncherProminent() {
  const pathname = usePathname();
  const [prominent, setProminent] = useState(false);
  const storageKey = getGuidePreferenceStorageKey(DASHBOARD_SIDEBAR_GUIDE_VERSION);

  useEffect(() => {
    if (pathname !== "/dashboard") {
      setProminent(false);
      return;
    }

    setProminent(isGuideLauncherProminent(DASHBOARD_SIDEBAR_GUIDE_VERSION));
  }, [pathname]);

  useEffect(() => {
    const refresh = () => {
      if (pathname !== "/dashboard") {
        return;
      }

      setProminent(isGuideLauncherProminent(DASHBOARD_SIDEBAR_GUIDE_VERSION));
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
  }, [pathname, storageKey]);

  return prominent;
}
