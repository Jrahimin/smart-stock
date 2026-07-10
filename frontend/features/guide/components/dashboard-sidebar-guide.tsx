"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { GuideCharacter } from "@/features/guide/components/guide-character";
import { GuideDialogBubble } from "@/features/guide/components/guide-dialog-bubble";
import {
  DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT,
  DASHBOARD_SIDEBAR_GUIDE_VERSION,
  dashboardSidebarGuideSteps,
} from "@/features/guide/config/dashboard-sidebar-guide";
import { useGuideContentBounds } from "@/features/guide/hooks/use-guide-content-bounds";
import {
  scrollGuideTargetIntoView,
  useGuideTargetAvailable,
  useGuideTargetLayout,
} from "@/features/guide/hooks/use-guide-target-layout";
import {
  isTallGuideTarget,
  resolveCenteredClusterLayout,
  resolveSidebarAdjacentClusterLayout,
  resolveTargetAdjacentClusterLayout,
  type GuideBounds,
  type GuideBox,
  type GuideRect,
} from "@/features/guide/lib/guide-positioning";
import {
  clearGuidePreference,
  isGuideReplaySessionActive,
  markGuideReplaySession,
  readGuidePreference,
  shouldAutoStartGuide,
  writeGuidePreference,
} from "@/features/guide/lib/guide-preference-storage";
import {
  getDashboardSidebarGuidePreference,
  saveDashboardSidebarGuidePreference,
} from "@/features/guide/services/guide-preference-api";
import type { GuideCompletion, GuideStep } from "@/features/guide/types/guide-types";
import { useAuth } from "@/features/auth/context/auth-context";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type DashboardSidebarGuideProps = {
  onMobileNavigationOpenChange: (isOpen: boolean) => void;
};

type GuideLayout = {
  bubble: GuideBox;
  character: GuideBox | null;
  characterFacing: "left" | "right";
  layoutMode: "default" | "beside-target" | "center-cluster" | "sidebar-adjacent";
  showFloatingCharacter: boolean;
};

const guideMotionEase = [0.22, 1, 0.36, 1] as const;

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function useViewport() {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return viewport;
}

function getGuidePhase(stepIndex: number) {
  const isDashboardPhase = stepIndex < DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT;
  return {
    label: isDashboardPhase ? "ড্যাশবোর্ড" : "মেনু",
    stepIndex: isDashboardPhase ? stepIndex : stepIndex - DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT,
    stepCount: isDashboardPhase
      ? DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT
      : dashboardSidebarGuideSteps.length - DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT,
  };
}

function buildGuideLayout(input: {
  bounds: GuideBounds | undefined;
  bubbleHeight: number;
  bubbleWidth: number;
  characterHeight: number;
  characterWidth: number;
  currentStep: GuideStep;
  isMobile: boolean;
  isNavigationStep: boolean;
  sidebarRight: number | null;
  targetRect: GuideRect;
  viewportHeight: number;
  viewportWidth: number;
}): GuideLayout | null {
  const {
    bounds,
    bubbleHeight,
    bubbleWidth,
    characterHeight,
    characterWidth,
    currentStep,
    isMobile,
    isNavigationStep,
    sidebarRight,
    targetRect,
    viewportHeight,
    viewportWidth,
  } = input;

  const showFloatingCharacter = !isMobile;
  const useCenterCluster =
    !isMobile &&
    bounds &&
    currentStep.layoutMode === "center-cluster" &&
    isTallGuideTarget(targetRect, viewportHeight);
  const useSidebarCluster = !isMobile && sidebarRight !== null && currentStep.layoutMode === "sidebar-adjacent";

  if (useCenterCluster && bounds) {
    const cluster = resolveCenteredClusterLayout(
      bounds,
      viewportHeight,
      bubbleWidth,
      bubbleHeight,
      characterWidth,
      characterHeight,
    );

    return {
      bubble: cluster.bubble,
      character: cluster.character,
      characterFacing: "left",
      layoutMode: "center-cluster",
      showFloatingCharacter,
    };
  }

  if (useSidebarCluster && sidebarRight !== null) {
    const cluster = resolveSidebarAdjacentClusterLayout(
      targetRect,
      sidebarRight,
      viewportWidth,
      viewportHeight,
      bubbleWidth,
      bubbleHeight,
      characterWidth,
      characterHeight,
    );

    return {
      bubble: cluster.bubble,
      character: cluster.character,
      characterFacing: cluster.characterFacing,
      layoutMode: "sidebar-adjacent",
      showFloatingCharacter,
    };
  }

  const besideTarget = resolveTargetAdjacentClusterLayout(
    targetRect,
    viewportWidth,
    viewportHeight,
    bounds,
    bubbleWidth,
    bubbleHeight,
    characterWidth,
    characterHeight,
    {
      anchorY: currentStep.characterAnchor ?? "center",
      preferSide: "right",
    },
  );

  return {
    bubble: besideTarget.bubble,
    character: besideTarget.character,
    characterFacing: besideTarget.characterFacing,
    layoutMode: "beside-target",
    showFloatingCharacter,
  };
}

export function DashboardSidebarGuide({ onMobileNavigationOpenChange }: DashboardSidebarGuideProps) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobileViewport();
  const viewport = useViewport();
  const contentBounds = useGuideContentBounds(true, isMobile);
  const firstTargetAvailable = useGuideTargetAvailable('[data-guide="market-pulse"]');
  const [preferenceResolved, setPreferenceResolved] = useState(false);
  const [shouldStart, setShouldStart] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [suppressContextualPrompts, setSuppressContextualPrompts] = useState(false);
  const [skipConfirmationOpen, setSkipConfirmationOpen] = useState(false);
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);
  const expandedSidebarForGuideRef = useRef(false);
  const hasAutoStartedRef = useRef(false);

  const currentStep = dashboardSidebarGuideSteps[stepIndex];
  const preferSidebar = currentStep?.highlightStyle === "navigation";
  const targetSnapshot = useGuideTargetLayout(currentStep?.target ?? null, isOpen, { preferSidebar });
  const targetRect = targetSnapshot?.targetRect ?? null;
  const spotlightRect = targetSnapshot?.spotlightRect ?? null;
  const sidebarRight = targetSnapshot?.sidebarRight ?? null;
  const isLastStep = stepIndex === dashboardSidebarGuideSteps.length - 1;
  const isNavigationStep = Boolean(currentStep?.mobileNavigationStep);
  const phase = getGuidePhase(stepIndex);

  useEffect(() => {
    if (pathname !== "/dashboard") {
      hasAutoStartedRef.current = false;
      setIsOpen(false);
      onMobileNavigationOpenChange(false);
      return;
    }

    if (isAuthLoading) {
      return;
    }

    let cancelled = false;

    async function resolvePreference() {
      const localPreference = readGuidePreference(DASHBOARD_SIDEBAR_GUIDE_VERSION);

      if (isAuthenticated) {
        try {
          const serverPreference = await getDashboardSidebarGuidePreference();
          if (cancelled) {
            return;
          }

          if (serverPreference.state && !localPreference && !isGuideReplaySessionActive()) {
            writeGuidePreference(
              DASHBOARD_SIDEBAR_GUIDE_VERSION,
              {
                status: serverPreference.state === "COMPLETED" ? "completed" : "dismissed",
                suppressContextualPrompts: serverPreference.state === "DISMISSED",
              },
              { preserveReplaySession: true },
            );
          } else if (!serverPreference.state && localPreference) {
            void saveDashboardSidebarGuidePreference(
              localPreference.status === "dismissed" || localPreference.suppressContextualPrompts
                ? "DISMISSED"
                : "COMPLETED",
            );
          }
        } catch {
          // Fall back to local preference only.
        }
      }

      if (!cancelled) {
        setShouldStart(shouldAutoStartGuide(DASHBOARD_SIDEBAR_GUIDE_VERSION));
        setPreferenceResolved(true);
      }
    }

    void resolvePreference();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isAuthLoading, onMobileNavigationOpenChange, pathname]);

  useEffect(() => {
    if (pathname !== "/dashboard") {
      return;
    }

    if (!preferenceResolved || !shouldStart || !firstTargetAvailable || hasAutoStartedRef.current) {
      return;
    }

    hasAutoStartedRef.current = true;
    setStepIndex(0);
    setIsOpen(true);
  }, [firstTargetAvailable, pathname, preferenceResolved, shouldStart]);

  useEffect(() => {
    const replayGuide = () => {
      if (pathname !== "/dashboard" || !firstTargetAvailable) {
        return;
      }

      clearGuidePreference();
      markGuideReplaySession();
      hasAutoStartedRef.current = true;
      setStepIndex(0);
      setSuppressContextualPrompts(false);
      setSkipConfirmationOpen(false);
      setShouldStart(true);
      setIsOpen(true);
    };

    window.addEventListener("dashboard-sidebar-guide:replay", replayGuide);
    return () => window.removeEventListener("dashboard-sidebar-guide:replay", replayGuide);
  }, [firstTargetAvailable, pathname]);

  useEffect(() => {
    if (!isOpen) {
      onMobileNavigationOpenChange(false);
      return;
    }

    onMobileNavigationOpenChange(isMobile && isNavigationStep);
  }, [isMobile, isNavigationStep, isOpen, onMobileNavigationOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      expandedSidebarForGuideRef.current = false;
      return;
    }

    if (isMobile || stepIndex < DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT) {
      return;
    }

    if (sidebarCollapsed && !expandedSidebarForGuideRef.current) {
      toggleSidebar();
      expandedSidebarForGuideRef.current = true;
    }
  }, [isMobile, isOpen, sidebarCollapsed, stepIndex, toggleSidebar]);

  useLayoutEffect(() => {
    if (!isOpen || !currentStep || !targetSnapshot?.activeElement || !targetRect || viewport.height === 0) {
      return;
    }

    scrollGuideTargetIntoView(targetSnapshot.activeElement, {
      navigation: currentStep.highlightStyle === "navigation",
      tall:
        isTallGuideTarget(targetRect, viewport.height) || currentStep.layoutMode === "center-cluster",
      reduceMotion: Boolean(reduceMotion),
    });
  }, [currentStep, isOpen, reduceMotion, targetRect, targetSnapshot?.activeElement, viewport.height]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSkipConfirmationOpen(true);
      } else if (event.key === "ArrowRight" && !skipConfirmationOpen) {
        event.preventDefault();
        moveNext();
      } else if (event.key === "ArrowLeft" && !skipConfirmationOpen && stepIndex > 0) {
        event.preventDefault();
        setStepIndex((index) => index - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, skipConfirmationOpen, stepIndex]);

  const layout = useMemo(() => {
    if (!currentStep || !targetRect || viewport.width === 0) {
      return null;
    }

    const bounds = isMobile ? undefined : contentBounds ?? undefined;
    const bubbleWidth = Math.min(isMobile ? 360 : 380, (bounds?.right ?? viewport.width) - (bounds?.left ?? 0) - 32);

    return buildGuideLayout({
      bounds,
      bubbleHeight: isLastStep ? 248 : 220,
      bubbleWidth,
      characterHeight: isNavigationStep ? 250 : 280,
      characterWidth: isNavigationStep ? 180 : 200,
      currentStep,
      isMobile,
      isNavigationStep,
      sidebarRight,
      targetRect,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
  }, [
    contentBounds,
    currentStep,
    isLastStep,
    isMobile,
    isNavigationStep,
    sidebarRight,
    targetRect,
    viewport.height,
    viewport.width,
  ]);

  const motionDuration = reduceMotion ? 0.01 : 0.42;

  function finishGuide(completion: GuideCompletion) {
    writeGuidePreference(DASHBOARD_SIDEBAR_GUIDE_VERSION, completion);
    if (isAuthenticated) {
      void saveDashboardSidebarGuidePreference(
        completion.status === "dismissed" || completion.suppressContextualPrompts ? "DISMISSED" : "COMPLETED",
      );
    }
    hasAutoStartedRef.current = false;
    setSkipConfirmationOpen(false);
    setIsOpen(false);
    setShouldStart(false);
    onMobileNavigationOpenChange(false);
  }

  function moveNext() {
    if (isLastStep) {
      finishGuide({ status: "completed", suppressContextualPrompts });
      return;
    }

    setStepIndex((index) => index + 1);
  }

  if (!isOpen || !currentStep || !layout?.bubble || !spotlightRect || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence mode="wait">
      <motion.div
        animate={{ opacity: 1 }}
        className="product-guide-root"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        key="product-guide-layer"
        transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: guideMotionEase }}
      >
        <div aria-hidden="true" className="product-guide-interaction-layer" />
        <motion.div
          animate={{
            height: spotlightRect.height + 10,
            left: spotlightRect.left - 5,
            opacity: 1,
            scale: 1,
            top: spotlightRect.top - 5,
            width: spotlightRect.width + 10,
          }}
          aria-hidden="true"
          className={`product-guide-spotlight product-guide-spotlight-${currentStep.highlightStyle}`}
          initial={false}
          transition={{ duration: motionDuration, ease: guideMotionEase }}
        />

        {layout.showFloatingCharacter && layout.character ? (
          <motion.div
            animate={{
              left: layout.character.left,
              opacity: 1,
              top: layout.character.top,
            }}
            aria-hidden="true"
            className="product-guide-character-wrap"
            initial={false}
            style={{ width: layout.character.width }}
            transition={{ duration: motionDuration, ease: guideMotionEase }}
          >
            <GuideCharacter facing={layout.characterFacing} pose={currentStep.characterPose} />
          </motion.div>
        ) : null}

        <motion.div
          animate={{
            left: isMobile ? undefined : layout.bubble.left,
            opacity: 1,
            top: isMobile ? undefined : layout.bubble.top,
            width: isMobile ? undefined : layout.bubble.width,
          }}
          className={`product-guide-dialog-wrap${isMobile ? " product-guide-dialog-wrap-mobile" : ""}`}
          initial={false}
          transition={{ duration: motionDuration, ease: guideMotionEase }}
        >
          <GuideDialogBubble
            characterPose={currentStep.characterPose}
            dialog={currentStep.dialog}
            isLastStep={isLastStep}
            isSkipConfirmationOpen={skipConfirmationOpen}
            onCancelSkip={() => setSkipConfirmationOpen(false)}
            onConfirmSkip={() => finishGuide({ status: "dismissed", suppressContextualPrompts: true })}
            onNext={moveNext}
            onPrevious={() => setStepIndex((index) => Math.max(0, index - 1))}
            onSkip={() => setSkipConfirmationOpen(true)}
            onSuppressContextualPromptsChange={setSuppressContextualPrompts}
            phaseLabel={phase.label}
            phaseStepCount={phase.stepCount}
            phaseStepIndex={phase.stepIndex}
            position={{ ...layout.bubble, left: 0, top: 0 }}
            showInlineCharacter={isMobile}
            stepCount={dashboardSidebarGuideSteps.length}
            stepIndex={stepIndex}
            suppressContextualPrompts={suppressContextualPrompts}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
