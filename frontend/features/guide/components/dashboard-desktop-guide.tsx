"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { GuideCharacter } from "@/features/guide/components/guide-character";
import { GuideDialogBubble } from "@/features/guide/components/guide-dialog-bubble";
import { GuideTourNudge } from "@/features/guide/components/guide-tour-nudge";
import {
  DASHBOARD_GUIDE_DASHBOARD_STEP_COUNT,
  DASHBOARD_GUIDE_SIDEBAR_EXPAND_STEP_INDEX,
  dashboardSidebarGuideSteps,
} from "@/features/guide/config/dashboard-sidebar-guide";
import { useDashboardDesktopGuideController } from "@/features/guide/hooks/use-dashboard-sidebar-guide-controller";
import { useGuideContentBounds } from "@/features/guide/hooks/use-guide-content-bounds";
import {
  isGuideTargetVisibleInViewport,
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
import type { GuideStep } from "@/features/guide/types/guide-types";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type GuideLayout = {
  bubble: GuideBox;
  character: GuideBox | null;
  characterFacing: "left" | "right";
  layoutMode: "default" | "beside-target" | "center-cluster" | "sidebar-adjacent";
  showFloatingCharacter: boolean;
};

const guideMotionEase = [0.22, 1, 0.36, 1] as const;

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
    sidebarRight,
    targetRect,
    viewportHeight,
    viewportWidth,
  } = input;

  const showFloatingCharacter = true;
  const useCenterCluster =
    bounds &&
    currentStep.layoutMode === "center-cluster" &&
    isTallGuideTarget(targetRect, viewportHeight);
  const useSidebarCluster = sidebarRight !== null && currentStep.layoutMode === "sidebar-adjacent";

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

export function DashboardDesktopGuide() {
  const reduceMotion = useReducedMotion();
  const viewport = useViewport();
  const contentBounds = useGuideContentBounds(true, false);
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);
  const expandedSidebarForGuideRef = useRef(false);

  const {
    acceptGuideNudge,
    acknowledgeGuideAutoStart,
    dismissGuideNudge,
    finishGuide,
    guideRun,
    isGuideActive,
    nudgeOpen,
    setSkipConfirmationOpen,
    setStepIndex,
    setSuppressContextualPrompts,
    skipConfirmationOpen,
    skipGuide,
    snoozeGuideNudge,
    stepIndex,
    suppressContextualPrompts,
  } = useDashboardDesktopGuideController();

  const currentStep = dashboardSidebarGuideSteps[stepIndex];
  const isDimOnlyStep = !currentStep?.target;
  const preferSidebar = currentStep?.highlightStyle === "navigation";
  const targetSnapshot = useGuideTargetLayout(currentStep?.target ?? null, isGuideActive && !isDimOnlyStep, {
    preferSidebar,
  });
  const targetRect = targetSnapshot?.targetRect ?? null;
  const spotlightRect = targetSnapshot?.spotlightRect ?? null;
  const sidebarRight = targetSnapshot?.sidebarRight ?? null;
  const isLastStep = stepIndex === dashboardSidebarGuideSteps.length - 1;
  const isNavigationStep = currentStep?.highlightStyle === "navigation";
  const phase = getGuidePhase(stepIndex);
  const pulseTargetReady = useGuideTargetAvailable('[data-guide="market-pulse"]', { requireReady: true });
  const isWaitingForPulse = currentStep?.id === "market-pulse" && !pulseTargetReady;
  const showFullDim = isDimOnlyStep || isWaitingForPulse;
  const nextDisabled = isWaitingForPulse;

  useEffect(() => {
    if (!isGuideActive) {
      expandedSidebarForGuideRef.current = false;
      return;
    }

    if (stepIndex < DASHBOARD_GUIDE_SIDEBAR_EXPAND_STEP_INDEX) {
      return;
    }

    if (sidebarCollapsed && !expandedSidebarForGuideRef.current) {
      toggleSidebar();
      expandedSidebarForGuideRef.current = true;
    }
  }, [isGuideActive, sidebarCollapsed, stepIndex, toggleSidebar]);

  useLayoutEffect(() => {
    if (
      !isGuideActive ||
      !currentStep ||
      showFullDim ||
      !targetSnapshot?.activeElement ||
      !targetRect ||
      viewport.height === 0
    ) {
      return;
    }

    const target = targetSnapshot.activeElement;
    const scrollTall =
      currentStep.id === "market-discovery" || currentStep.layoutMode === "center-cluster";

    if (!isGuideTargetVisibleInViewport(target)) {
      scrollGuideTargetIntoView(target, {
        navigation: currentStep.highlightStyle === "navigation",
        tall: scrollTall,
        reduceMotion: true,
      });
    }
  }, [currentStep, isGuideActive, showFullDim, targetRect, targetSnapshot?.activeElement, viewport.height]);

  useEffect(() => {
    if (!isGuideActive) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSkipConfirmationOpen(true);
      } else if (event.key === "ArrowRight" && !skipConfirmationOpen && !nextDisabled) {
        event.preventDefault();
        moveNext();
      } else if (event.key === "ArrowLeft" && !skipConfirmationOpen && stepIndex > 0) {
        event.preventDefault();
        setStepIndex((index) => index - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isGuideActive, nextDisabled, setSkipConfirmationOpen, setStepIndex, skipConfirmationOpen, stepIndex]);

  const layout = useMemo(() => {
    if (!currentStep || viewport.width === 0) {
      return null;
    }

    const bounds =
      contentBounds ??
      (showFullDim
        ? {
            left: 0,
            top: 0,
            right: viewport.width,
            bottom: viewport.height,
          }
        : undefined);
    const bubbleWidth = Math.min(380, (bounds?.right ?? viewport.width) - (bounds?.left ?? 0) - 32);
    const bubbleHeight = isLastStep ? 248 : 220;
    const characterHeight = isNavigationStep ? 250 : 280;
    const characterWidth = isNavigationStep ? 180 : 200;

    if (showFullDim && bounds) {
      const cluster = resolveCenteredClusterLayout(
        bounds,
        viewport.height,
        bubbleWidth,
        bubbleHeight,
        characterWidth,
        characterHeight,
      );

      return {
        bubble: cluster.bubble,
        character: cluster.character,
        characterFacing: "left" as const,
        layoutMode: "center-cluster" as const,
        showFloatingCharacter: true,
      };
    }

    if (!targetRect) {
      return null;
    }

    return buildGuideLayout({
      bounds,
      bubbleHeight,
      bubbleWidth,
      characterHeight,
      characterWidth,
      currentStep,
      isNavigationStep: Boolean(isNavigationStep),
      sidebarRight,
      targetRect: spotlightRect ?? targetRect,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
  }, [
    contentBounds,
    currentStep,
    isLastStep,
    isNavigationStep,
    showFullDim,
    sidebarRight,
    spotlightRect,
    targetRect,
    viewport.height,
    viewport.width,
  ]);

  const motionDuration = reduceMotion ? 0.01 : 0.42;
  const canRenderGuide = Boolean(
    isGuideActive && guideRun && currentStep && layout?.bubble && (showFullDim || spotlightRect),
  );
  const showSpotlight = Boolean(!showFullDim && spotlightRect && currentStep.highlightStyle);

  useLayoutEffect(() => {
    if (canRenderGuide && guideRun?.trigger === "auto") {
      acknowledgeGuideAutoStart();
    }
  }, [acknowledgeGuideAutoStart, canRenderGuide, guideRun]);

  function moveNext() {
    if (isLastStep) {
      finishGuide({
        status: suppressContextualPrompts ? "dismissed" : "completed",
        suppressContextualPrompts,
      });
      return;
    }

    setStepIndex((index) => index + 1);
  }

  const nudgeLayer =
    nudgeOpen && typeof document !== "undefined"
      ? createPortal(
          <GuideTourNudge onAccept={acceptGuideNudge} onDismiss={dismissGuideNudge} onSnooze={snoozeGuideNudge} />,
          document.body,
        )
      : null;

  if (!canRenderGuide || !guideRun || !currentStep || !layout?.bubble || typeof document === "undefined") {
    return nudgeLayer;
  }

  return (
    <>
      {nudgeLayer}
      {createPortal(
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1 }}
            className="product-guide-root"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={`product-guide-layer-${guideRun.id}`}
            transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: guideMotionEase }}
          >
            <div aria-hidden="true" className="product-guide-interaction-layer" />
            {showFullDim ? <div aria-hidden="true" className="product-guide-dim" /> : null}
            {showSpotlight && spotlightRect ? (
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
            ) : null}

            {layout.showFloatingCharacter && layout.character ? (
              <motion.div
                animate={{ left: layout.character.left, opacity: 1, top: layout.character.top }}
                aria-hidden="true"
                className="product-guide-character-wrap"
                initial={false}
                key={`${guideRun.id}-${currentStep.id}`}
                style={{ width: layout.character.width }}
                transition={{ duration: motionDuration, ease: guideMotionEase }}
              >
                <GuideCharacter facing={layout.characterFacing} pose={currentStep.characterPose} />
              </motion.div>
            ) : null}

            <motion.div
              animate={{
                left: layout.bubble.left,
                opacity: 1,
                top: layout.bubble.top,
                width: layout.bubble.width,
              }}
              className="product-guide-dialog-wrap"
              initial={false}
              transition={{ duration: motionDuration, ease: guideMotionEase }}
            >
              <GuideDialogBubble
                characterPose={currentStep.characterPose}
                dialog={currentStep.dialog}
                isLastStep={isLastStep}
                isSkipConfirmationOpen={skipConfirmationOpen}
                nextDisabled={nextDisabled}
                onCancelSkip={() => setSkipConfirmationOpen(false)}
                onConfirmSkip={skipGuide}
                onNext={moveNext}
                onPrevious={() => setStepIndex((index) => Math.max(0, index - 1))}
                onSkip={() => setSkipConfirmationOpen(true)}
                onSuppressContextualPromptsChange={setSuppressContextualPrompts}
                phaseLabel={phase.label}
                phaseStepCount={phase.stepCount}
                phaseStepIndex={phase.stepIndex}
                position={{ ...layout.bubble, left: 0, top: 0 }}
                showInlineCharacter={false}
                stepCount={dashboardSidebarGuideSteps.length}
                stepIndex={stepIndex}
                suppressContextualPrompts={suppressContextualPrompts}
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
