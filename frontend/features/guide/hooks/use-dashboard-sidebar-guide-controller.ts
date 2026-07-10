"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { DASHBOARD_SIDEBAR_GUIDE_VERSION } from "@/features/guide/config/dashboard-sidebar-guide";
import {
  isGuideAutoStartEligible,
  resolveGuideCompletion,
  writeGuidePreference,
} from "@/features/guide/lib/guide-preference-storage";
import {
  getDashboardSidebarGuidePreference,
  saveDashboardSidebarGuidePreference,
} from "@/features/guide/services/guide-preference-api";
import type { GuideCompletion } from "@/features/guide/types/guide-types";
import { useAuth } from "@/features/auth/context/auth-context";
import { useGuideTargetAvailable } from "@/features/guide/hooks/use-guide-target-layout";

export type GuideRunTrigger = "auto" | "manual";

export type GuideRun = {
  id: number;
  trigger: GuideRunTrigger;
};

type GuideGate = {
  autoStartEligible: boolean;
  ready: boolean;
};

function createGuideRun(trigger: GuideRunTrigger): GuideRun {
  return { id: Date.now(), trigger };
}

export function useDashboardSidebarGuideController() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const pulseTargetReady = useGuideTargetAvailable('[data-guide="market-pulse"]', { requireReady: true });

  const autoStartConsumedRef = useRef(false);
  const [gate, setGate] = useState<GuideGate>(() => ({
    autoStartEligible: false,
    ready: false,
  }));
  const [guideRun, setGuideRun] = useState<GuideRun | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [suppressContextualPrompts, setSuppressContextualPrompts] = useState(false);
  const [skipConfirmationOpen, setSkipConfirmationOpen] = useState(false);

  const isDashboard = pathname === "/dashboard";
  const isGuideActive = guideRun !== null;

  const startGuideRun = useCallback((trigger: GuideRunTrigger) => {
    setSkipConfirmationOpen(false);
    setSuppressContextualPrompts(false);
    setStepIndex(0);
    setGuideRun(createGuideRun(trigger));
  }, []);

  const stopGuideRun = useCallback(() => {
    setGuideRun(null);
    setSkipConfirmationOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (!isDashboard) {
      stopGuideRun();
      return;
    }

    if (isAuthLoading) {
      return;
    }

    setGate({
      autoStartEligible: isGuideAutoStartEligible(DASHBOARD_SIDEBAR_GUIDE_VERSION),
      ready: true,
    });
  }, [isAuthLoading, isDashboard, stopGuideRun]);

  useEffect(() => {
    if (!isDashboard || isAuthLoading || !isAuthenticated) {
      return;
    }

    let cancelled = false;

    async function syncServerPreference() {
      const localCompletion = resolveGuideCompletion(DASHBOARD_SIDEBAR_GUIDE_VERSION);
      let serverState: "COMPLETED" | "DISMISSED" | null = null;

      try {
        const serverPreference = await getDashboardSidebarGuidePreference();
        if (cancelled) {
          return;
        }

        serverState = serverPreference.state;

        if (serverPreference.state && !localCompletion) {
          writeGuidePreference(
            DASHBOARD_SIDEBAR_GUIDE_VERSION,
            serverPreference.state === "COMPLETED"
              ? { status: "completed", suppressContextualPrompts: false }
              : { status: "dismissed", suppressContextualPrompts: true },
          );
        } else if (!serverPreference.state && localCompletion) {
          void saveDashboardSidebarGuidePreference(
            localCompletion.status === "dismissed" || localCompletion.suppressContextualPrompts
              ? "DISMISSED"
              : "COMPLETED",
          );
        }
      } catch {
        // Fall back to local completion only.
      }

      if (!cancelled) {
        setGate({
          autoStartEligible: isGuideAutoStartEligible(DASHBOARD_SIDEBAR_GUIDE_VERSION, { serverState }),
          ready: true,
        });
      }
    }

    void syncServerPreference();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isAuthLoading, isDashboard]);

  useEffect(() => {
    if (
      !isDashboard ||
      !gate.ready ||
      !gate.autoStartEligible ||
      !pulseTargetReady ||
      guideRun ||
      autoStartConsumedRef.current
    ) {
      return;
    }

    autoStartConsumedRef.current = true;
    startGuideRun("auto");
  }, [gate.autoStartEligible, gate.ready, guideRun, isDashboard, pulseTargetReady, startGuideRun]);

  useEffect(() => {
    const openManualGuide = () => {
      if (pathname !== "/dashboard") {
        return;
      }

      startGuideRun("manual");
    };

    window.addEventListener("dashboard-sidebar-guide:open", openManualGuide);
    window.addEventListener("dashboard-sidebar-guide:replay", openManualGuide);
    return () => {
      window.removeEventListener("dashboard-sidebar-guide:open", openManualGuide);
      window.removeEventListener("dashboard-sidebar-guide:replay", openManualGuide);
    };
  }, [pathname, startGuideRun]);

  const finishGuide = useCallback(
    (completion: GuideCompletion) => {
      writeGuidePreference(DASHBOARD_SIDEBAR_GUIDE_VERSION, completion);
      if (isAuthenticated) {
        void saveDashboardSidebarGuidePreference(
          completion.status === "dismissed" || completion.suppressContextualPrompts ? "DISMISSED" : "COMPLETED",
        );
      }

      autoStartConsumedRef.current = true;
      setGate({
        autoStartEligible: isGuideAutoStartEligible(DASHBOARD_SIDEBAR_GUIDE_VERSION),
        ready: true,
      });
      stopGuideRun();
    },
    [isAuthenticated, stopGuideRun],
  );

  return {
    finishGuide,
    guideRun,
    isDashboard,
    isGuideActive,
    pulseTargetReady,
    setSkipConfirmationOpen,
    setStepIndex,
    setSuppressContextualPrompts,
    skipConfirmationOpen,
    stepIndex,
    suppressContextualPrompts,
  };
}
