"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { GuideMobileSheet } from "@/features/guide/components/guide-mobile-sheet";
import { GuideTourNudge } from "@/features/guide/components/guide-tour-nudge";
import { dashboardMobileGuideSteps } from "@/features/guide/config/mobile-intro-guide";
import { mobileIntroDialogs } from "@/features/guide/dialogs/mobile-intro.bn";
import { useDashboardMobileGuideController } from "@/features/guide/hooks/use-dashboard-sidebar-guide-controller";
import { useGuideTargetLayout } from "@/features/guide/hooks/use-guide-target-layout";

const DRAWER_OPEN_DELAY_MS = 150;
const guideMotionEase = [0.22, 1, 0.36, 1] as const;

type DashboardMobileGuideProps = {
  onMobileNavigationOpenChange: (isOpen: boolean) => void;
};

export function DashboardMobileGuide({ onMobileNavigationOpenChange }: DashboardMobileGuideProps) {
  const reduceMotion = useReducedMotion();
  const drawerTransitionTimeoutRef = useRef<number | null>(null);
  const [isDrawerTransitioning, setIsDrawerTransitioning] = useState(false);

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
  } = useDashboardMobileGuideController();

  const currentStep = dashboardMobileGuideSteps[stepIndex];
  const isLastStep = stepIndex === dashboardMobileGuideSteps.length - 1;
  const isDimOnlyStep = !currentStep?.target;
  const preferSidebar = currentStep?.highlightStyle === "navigation";
  const targetSnapshot = useGuideTargetLayout(currentStep?.target ?? null, isGuideActive && !isDimOnlyStep, {
    preferSidebar,
  });
  const spotlightRect = targetSnapshot?.spotlightRect ?? null;
  const isNavigationStep = stepIndex >= 1 && stepIndex <= 3;

  useEffect(() => {
    return () => {
      if (drawerTransitionTimeoutRef.current !== null) {
        window.clearTimeout(drawerTransitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isGuideActive) {
      onMobileNavigationOpenChange(false);
    }
  }, [isGuideActive, onMobileNavigationOpenChange]);

  useEffect(() => {
    if (!isGuideActive) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSkipConfirmationOpen(true);
      } else if (event.key === "ArrowRight" && !skipConfirmationOpen && !isDrawerTransitioning) {
        event.preventDefault();
        moveNext();
      } else if (event.key === "ArrowLeft" && !skipConfirmationOpen && stepIndex > 0) {
        event.preventDefault();
        movePrevious();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerTransitioning, isGuideActive, setSkipConfirmationOpen, skipConfirmationOpen, stepIndex]);

  function movePrevious() {
    if (stepIndex === 1) {
      onMobileNavigationOpenChange(false);
    }

    setStepIndex((index) => Math.max(0, index - 1));
  }

  function moveNext() {
    if (isLastStep) {
      onMobileNavigationOpenChange(false);
      finishGuide({
        status: suppressContextualPrompts ? "dismissed" : "completed",
        suppressContextualPrompts,
      });
      return;
    }

    if (stepIndex === 0) {
      setIsDrawerTransitioning(true);
      drawerTransitionTimeoutRef.current = window.setTimeout(() => {
        onMobileNavigationOpenChange(true);
        setStepIndex(1);
        setIsDrawerTransitioning(false);
        drawerTransitionTimeoutRef.current = null;
      }, DRAWER_OPEN_DELAY_MS);
      return;
    }

    if (stepIndex === 3) {
      onMobileNavigationOpenChange(false);
    }

    setStepIndex((index) => index + 1);
  }

  function handleSkip() {
    onMobileNavigationOpenChange(false);
    skipGuide();
  }

  const motionDuration = reduceMotion ? 0.01 : 0.42;
  const canRenderGuide = Boolean(isGuideActive && guideRun && currentStep);
  const showSpotlight = Boolean(!isDimOnlyStep && spotlightRect);

  useLayoutEffect(() => {
    if (canRenderGuide && guideRun?.trigger === "auto") {
      acknowledgeGuideAutoStart();
    }
  }, [acknowledgeGuideAutoStart, canRenderGuide, guideRun]);

  const nudgeLayer =
    nudgeOpen && typeof document !== "undefined"
      ? createPortal(
          <GuideTourNudge
            eyebrow={mobileIntroDialogs.nudge.eyebrow}
            message={mobileIntroDialogs.nudge.message}
            onAccept={acceptGuideNudge}
            onDismiss={dismissGuideNudge}
            onSnooze={snoozeGuideNudge}
            title={mobileIntroDialogs.nudge.title}
          />,
          document.body,
        )
      : null;

  if (!canRenderGuide || !guideRun || !currentStep || typeof document === "undefined") {
    return nudgeLayer;
  }

  return (
    <>
      {nudgeLayer}
      {createPortal(
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1 }}
            className="guide-mobile-root"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={`guide-mobile-layer-${guideRun.id}`}
            transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: guideMotionEase }}
          >
            <div aria-hidden="true" className="guide-mobile-interaction-layer" />
            <div aria-hidden="true" className="guide-mobile-dim" />
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
                className={`guide-mobile-spotlight guide-mobile-spotlight-${currentStep.highlightStyle ?? "region"}`}
                initial={false}
                transition={{ duration: motionDuration, ease: guideMotionEase }}
              />
            ) : null}

            <GuideMobileSheet
              characterPose={currentStep.characterPose}
              compact={isNavigationStep}
              dialog={currentStep.dialog}
              isDrawerTransitioning={isDrawerTransitioning}
              isLastStep={isLastStep}
              isSkipConfirmationOpen={skipConfirmationOpen}
              isWelcomeStep={stepIndex === 0}
              onCancelSkip={() => setSkipConfirmationOpen(false)}
              onClose={() => setSkipConfirmationOpen(true)}
              onConfirmSkip={handleSkip}
              onNext={moveNext}
              onPrevious={movePrevious}
              onSkip={() => setSkipConfirmationOpen(true)}
              onSuppressContextualPromptsChange={setSuppressContextualPrompts}
              stepCount={dashboardMobileGuideSteps.length}
              stepIndex={stepIndex}
              suppressContextualPrompts={suppressContextualPrompts}
            />
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
