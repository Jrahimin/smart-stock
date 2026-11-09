"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { GuideMobileSheet } from "@/features/guide/components/guide-mobile-sheet";
import { GuideTourNudge } from "@/features/guide/components/guide-tour-nudge";
import { getDashboardMobileGuideSteps } from "@/features/guide/config/mobile-intro-guide";
import { getWealthMobileGuideSteps } from "@/features/guide/config/wealth-overview-guide";
import { getTaxPlannerMobileGuideSteps } from "@/features/guide/config/tax-planner-guide";
import { getGuideControls, getGuideNudgeCopy } from "@/features/guide/dialogs/dashboard-dialogs";
import { getWealthGuideControls, getWealthGuideNudgeCopy } from "@/features/guide/dialogs/wealth-dialogs";
import { getTaxPlannerGuideControls, getTaxPlannerGuideNudgeCopy } from "@/features/guide/dialogs/tax-planner-dialogs";
import type { ProductGuideStepState } from "@/features/guide/components/dashboard-desktop-guide";
import { useMobileGuideController, type ProductGuideJourney } from "@/features/guide/hooks/use-dashboard-sidebar-guide-controller";
import { getVisibleTarget, useGuideTargetLayout } from "@/features/guide/hooks/use-guide-target-layout";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

const DRAWER_OPEN_DELAY_MS = 150;
const guideMotionEase = [0.22, 1, 0.36, 1] as const;

type DashboardMobileGuideProps = {
  locale?: AppLocale;
  onMobileNavigationOpenChange: (isOpen: boolean) => void;
  journey?: ProductGuideJourney;
  onGuideStepChange?: (state: ProductGuideStepState) => void;
};

export function DashboardMobileGuide({
  locale = DEFAULT_LOCALE,
  onMobileNavigationOpenChange,
  journey = "dashboard",
  onGuideStepChange,
}: DashboardMobileGuideProps) {
  const isWealthJourney = journey === "wealth";
  const isTaxPlannerJourney = journey === "tax-planner";
  const isProductJourney = isWealthJourney || isTaxPlannerJourney;
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
  } = useMobileGuideController(journey);

  const guideControls = useMemo(() => isTaxPlannerJourney ? getTaxPlannerGuideControls(locale) : isWealthJourney ? getWealthGuideControls(locale) : getGuideControls(locale), [isTaxPlannerJourney, isWealthJourney, locale]);
  const guideNudgeCopy = useMemo(() => isTaxPlannerJourney ? getTaxPlannerGuideNudgeCopy(locale) : isWealthJourney ? getWealthGuideNudgeCopy(locale) : getGuideNudgeCopy(locale), [isTaxPlannerJourney, isWealthJourney, locale]);
  const dashboardMobileGuideSteps = useMemo(() => isTaxPlannerJourney ? getTaxPlannerMobileGuideSteps(locale) : isWealthJourney ? getWealthMobileGuideSteps(locale) : getDashboardMobileGuideSteps(locale), [isTaxPlannerJourney, isWealthJourney, locale]);

  const currentStep = dashboardMobileGuideSteps[stepIndex];
  const isLastStep = stepIndex === dashboardMobileGuideSteps.length - 1;
  const isDimOnlyStep = !currentStep?.target;
  const preferSidebar = currentStep?.highlightStyle === "navigation";
  const targetSnapshot = useGuideTargetLayout(currentStep?.target ?? null, isGuideActive && !isDimOnlyStep, {
    preferSidebar,
    alignDashboard: isProductJourney ? undefined : "mobile",
  });
  const spotlightRect = targetSnapshot?.spotlightRect ?? null;
  const isNavigationStep = isProductJourney ? stepIndex > 0 : preferSidebar;

  // Reserve space only during this tour so the final help target can sit above
  // the sheet. Normal planner composition is unchanged after dismissal.
  useLayoutEffect(() => {
    if (!isTaxPlannerJourney || !isGuideActive) return;
    const workspace = document.querySelector<HTMLElement>(".wealth-tax-planner-workspace");
    const sheet = document.querySelector<HTMLElement>(".guide-mobile-sheet");
    if (!workspace || !sheet) return;
    const previous = workspace.style.paddingBottom;
    const reserve = () => { workspace.style.paddingBottom = sheet.getBoundingClientRect().height + 96 + "px"; };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(sheet);
    return () => {
      observer.disconnect();
      workspace.style.paddingBottom = previous;
      requestAnimationFrame(() => {
        // Finish opens permanent help: keep that dialog's focus. Skipping
        // instead returns keyboard users to the always-visible tour launcher.
        if (!document.querySelector('dialog[open], [role="dialog"]')) {
          document.querySelector<HTMLElement>(".mobile-app-header-guide-button")?.focus({ preventScroll: true });
        }
      });
    };
  }, [isTaxPlannerJourney, isGuideActive]);

  useLayoutEffect(() => {
    if (!isTaxPlannerJourney || !isGuideActive || !currentStep?.target) return;
    const frame = requestAnimationFrame(() => {
      const target = getVisibleTarget(currentStep.target!);
      if (target) window.scrollBy({ top: target.getBoundingClientRect().top - 88, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isTaxPlannerJourney, isGuideActive, currentStep?.target]);

  useEffect(() => {
    if (!isWealthJourney) return;
    window.dispatchEvent(new CustomEvent("wealth-overview-guide:calculators", { detail: { open: isGuideActive && currentStep?.id === "calculators" } }));
    return () => {
      window.dispatchEvent(new CustomEvent("wealth-overview-guide:calculators", { detail: { open: false } }));
    };
  }, [currentStep?.id, isGuideActive, isWealthJourney]);

  useEffect(() => {
    onGuideStepChange?.({ active: isGuideActive, stepId: isGuideActive ? currentStep?.id ?? null : null });
  }, [currentStep?.id, isGuideActive, onGuideStepChange]);

  useEffect(() => {
    return () => {
      if (drawerTransitionTimeoutRef.current !== null) {
        window.clearTimeout(drawerTransitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isGuideActive && !isProductJourney) {
      onMobileNavigationOpenChange(false);
    }
  }, [isGuideActive, isProductJourney, onMobileNavigationOpenChange]);

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
    moveToStep(Math.max(0, stepIndex - 1));
  }

  function moveNext() {
    if (isLastStep) {
      if (!isProductJourney) onMobileNavigationOpenChange(false);
      finishGuide({
        status: suppressContextualPrompts ? "dismissed" : "completed",
        suppressContextualPrompts,
      });
      return;
    }

    moveToStep(stepIndex + 1);
  }

  function moveToStep(nextIndex: number) {
    if (isDrawerTransitioning) return;
    const nextStep = dashboardMobileGuideSteps[nextIndex];
    const nextDrawer = Boolean(nextStep && "openDrawer" in nextStep && nextStep.openDrawer);
    const currentDrawer = Boolean(currentStep && "openDrawer" in currentStep && currentStep.openDrawer);
    const drawerOpens = !isProductJourney && nextDrawer && !currentDrawer;
    if (drawerOpens && !reduceMotion) {
      setIsDrawerTransitioning(true);
      drawerTransitionTimeoutRef.current = window.setTimeout(() => {
        onMobileNavigationOpenChange(true);
        setStepIndex(nextIndex);
        setIsDrawerTransitioning(false);
        drawerTransitionTimeoutRef.current = null;
      }, DRAWER_OPEN_DELAY_MS);
      return;
    }

    if (!isProductJourney && nextDrawer !== currentDrawer) {
      onMobileNavigationOpenChange(nextDrawer);
    }
    setStepIndex(nextIndex);
  }

  function handleSkip() {
    if (!isProductJourney) onMobileNavigationOpenChange(false);
    skipGuide();
  }

  const motionDuration = !isProductJourney ? 0 : reduceMotion ? 0.01 : 0.42;
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
            {...guideNudgeCopy}
            locale={locale}
            onAccept={acceptGuideNudge}
            onDismiss={dismissGuideNudge}
            onSnooze={snoozeGuideNudge}
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
            data-dashboard-tour={isProductJourney ? undefined : ""}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={`guide-mobile-layer-${guideRun.id}`}
            transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: guideMotionEase }}
          >
            <div aria-hidden="true" className="guide-mobile-interaction-layer" />
            {isProductJourney || !showSpotlight ? <div aria-hidden="true" className="guide-mobile-dim" /> : null}
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
              controls={guideControls}
              dialog={currentStep.dialog}
              isDrawerTransitioning={isDrawerTransitioning}
              isLastStep={isLastStep}
              isSkipConfirmationOpen={skipConfirmationOpen}
              isWelcomeStep={stepIndex === 0}
              locale={locale}
              nextLabel={!isProductJourney && currentStep.id === "smart-signals" ? guideControls.startMenuTour : undefined}
              phase={isProductJourney ? undefined : stepIndex < 5
                ? { label: guideControls.dashboardPhase, index: stepIndex, count: 5 }
                : { label: guideControls.menuPhase, index: stepIndex - 5, count: dashboardMobileGuideSteps.length - 5 }}
              onCancelSkip={() => setSkipConfirmationOpen(false)}
              onClose={isTaxPlannerJourney ? handleSkip : () => setSkipConfirmationOpen(true)}
              onConfirmSkip={handleSkip}
              onNext={moveNext}
              onPrevious={movePrevious}
              onSkip={isTaxPlannerJourney ? handleSkip : () => setSkipConfirmationOpen(true)}
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
