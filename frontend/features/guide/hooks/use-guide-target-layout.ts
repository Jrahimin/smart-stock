"use client";

import { useLayoutEffect, useMemo, useReducer, useState } from "react";

import {
  clipRectToViewport,
  type GuideRect,
} from "@/features/guide/lib/guide-positioning";

export const DASHBOARD_GUIDE_DIALOG_HEIGHT = 320;

export type GuideTargetSnapshot = {
  activeElement: HTMLElement | null;
  sidebarRight: number | null;
  spotlightRect: GuideRect;
  targetRect: GuideRect;
};

type GuideTargetOptions = {
  preferSidebar?: boolean;
  requireReady?: boolean;
  alignDashboard?: "desktop" | "mobile";
};

function isElementVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function isGuideReadyTarget(element: HTMLElement) {
  return element.getAttribute("data-guide-ready") === "true";
}

export function getVisibleTarget(selector: string, options?: GuideTargetOptions): HTMLElement | null {
  const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const visible = matches.filter((element) => {
    if (!isElementVisible(element)) {
      return false;
    }

    if (options?.requireReady && !isGuideReadyTarget(element)) {
      return false;
    }

    return true;
  });

  if (options?.preferSidebar) {
    const sidebarTarget = visible.find((element) => element.closest(".terminal-sidebar-desktop"));
    if (sidebarTarget) {
      return sidebarTarget;
    }

    const drawerTarget = visible.find((element) => element.closest(".mobile-nav-drawer-root"));
    if (drawerTarget) {
      return drawerTarget;
    }
  }

  const mainContentTarget = visible.find((element) => !element.closest(".mobile-nav-drawer-root"));
  return mainContentTarget ?? visible[0] ?? null;
}

function toGuideRect(rect: DOMRect): GuideRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getGuideExtent(target: HTMLElement) {
  const id = target.dataset.guideExtent;
  return id ? document.getElementById(id) : null;
}

function getGuideAnchorRect(target: HTMLElement): GuideRect {
  const start = target.getBoundingClientRect();
  const end = getGuideExtent(target)?.getBoundingClientRect();
  if (!end?.height) return toGuideRect(start);
  const top = Math.min(start.top, end.top);
  const right = Math.max(start.right, end.right);
  const bottom = Math.max(start.bottom, end.bottom);
  const left = Math.min(start.left, end.left);
  return { top, right, bottom, left, width: right - left, height: bottom - top };
}

function measureSidebarRight() {
  const sidebar = document.querySelector<HTMLElement>(".terminal-sidebar-desktop");
  if (!sidebar) {
    return null;
  }

  const rect = sidebar.getBoundingClientRect();
  return rect.width > 0 ? rect.right : null;
}

export function buildTargetSnapshot(target: HTMLElement): GuideTargetSnapshot {
  const targetRect = getGuideAnchorRect(target);
  const clipped = clipRectToViewport(targetRect, window.innerWidth, window.innerHeight);

  return {
    activeElement: target,
    sidebarRight: measureSidebarRight(),
    spotlightRect: clipped ?? targetRect,
    targetRect,
  };
}

export function measureGuideTargetSnapshot(
  selector: string,
  options?: GuideTargetOptions,
): GuideTargetSnapshot | null {
  if (typeof document === "undefined") {
    return null;
  }

  const target = getVisibleTarget(selector, options);
  return target ? buildTargetSnapshot(target) : null;
}

function isTargetVisibleInViewport(target: HTMLElement, topInset = 72, bottomInset = 16) {
  const rect = getGuideAnchorRect(target);
  const viewportHeight = window.innerHeight;

  if (rect.height > viewportHeight * 0.45) {
    return rect.top >= topInset && rect.top < viewportHeight - bottomInset;
  }

  return rect.top >= topInset && rect.bottom <= viewportHeight - bottomInset;
}

export function scrollGuideTargetIntoView(
  target: HTMLElement,
  options: { navigation: boolean; tall: boolean; reduceMotion: boolean },
) {
  const behavior = options.reduceMotion ? "auto" : "smooth";

  if (options.navigation) {
    const sidebar = target.closest<HTMLElement>(".terminal-sidebar, .mobile-nav-drawer-root");
    if (sidebar) {
      const sidebarRect = sidebar.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const padding = 12;
      const isOutsideSidebar =
        targetRect.top < sidebarRect.top + padding || targetRect.bottom > sidebarRect.bottom - padding;

      if (isOutsideSidebar) {
        const targetOffset = targetRect.top - sidebarRect.top + sidebar.scrollTop;
        const scrollTop = targetOffset - sidebar.clientHeight / 2 + targetRect.height / 2;
        sidebar.scrollTo({ top: Math.max(0, scrollTop), behavior });
      }
      return;
    }
  }

  const topInset = 72;
  const bottomInset = 16;
  const rect = getGuideAnchorRect(target);
  const viewportHeight = window.innerHeight;
  const isTall = rect.height > viewportHeight * 0.45;
  const needsScroll = isTall
    ? rect.top < topInset || rect.top > viewportHeight - bottomInset
    : rect.top < topInset || rect.bottom > viewportHeight - bottomInset;

  if (!needsScroll) {
    return;
  }

  target.scrollIntoView({
    behavior,
    block: options.tall ? "start" : "center",
    inline: "nearest",
  });
}

export function isGuideTargetVisibleInViewport(target: HTMLElement) {
  return isTargetVisibleInViewport(target);
}

export function useGuideTargetLayout(
  selector: string | null,
  enabled: boolean,
  options?: GuideTargetOptions,
) {
  const [revision, bumpRevision] = useReducer((count: number) => count + 1, 0);
  const preferSidebar = options?.preferSidebar ?? false;
  const alignDashboard = options?.alignDashboard;

  const snapshot = useMemo(() => {
    if (!enabled || !selector) {
      return null;
    }

    return measureGuideTargetSnapshot(selector, { preferSidebar });
  }, [enabled, preferSidebar, revision, selector]);

  useLayoutEffect(() => {
    if (!enabled || !selector) {
      return;
    }

    let frameId = 0;
    let targetObserver: ResizeObserver | null = null;
    let sidebarObserver: ResizeObserver | null = null;

    const remeasure = () => {
      bumpRevision();
    };

    const attachTargetObserver = () => {
      targetObserver?.disconnect();
      const target = getVisibleTarget(selector, { preferSidebar });
      if (!target) {
        return;
      }

      targetObserver = new ResizeObserver(() => {
        window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(remeasure);
      });
      targetObserver.observe(target);
      const extent = getGuideExtent(target);
      if (extent) targetObserver.observe(extent);
    };

    // Measure the new anchor after scrolling, before the first frame of the step.
    // Sidebar and drawer geometry is observed independently below.
    if (alignDashboard) {
      const target = getVisibleTarget(selector, { preferSidebar });
      if (target && !preferSidebar) {
        if (alignDashboard === "mobile") {
          target.scrollIntoView({ behavior: "instant", block: "start", inline: "nearest" });
        } else if (target.dataset.guideExtent) {
          // Keep the whole example visible. Prefer the space above it; on a
          // short viewport scroll it near the top and place the guide below.
          const rect = getGuideAnchorRect(target);
          const room = DASHBOARD_GUIDE_DIALOG_HEIGHT + 46;
          const maxTop = window.innerHeight - rect.height - 30;
          const top = maxTop >= room ? Math.min(maxTop, Math.max(room, window.innerHeight * 0.64)) : 76;
          window.scrollBy({ top: rect.top - top, behavior: "instant" });
        } else {
          scrollGuideTargetIntoView(target, { navigation: false, tall: false, reduceMotion: true });
          // A centered anchor can leave too little vertical room on either
          // side of a wide target. Make room below it before placing the pair.
          const rect = target.getBoundingClientRect();
          // Allow for the viewport inset, cluster gap, and fractional layout pixels.
          const room = DASHBOARD_GUIDE_DIALOG_HEIGHT + 46;
          if (rect.top < room && window.innerHeight - rect.bottom < room) {
            const scrollBy = rect.bottom - (window.innerHeight - room);
            if (rect.top - scrollBy >= 64) window.scrollBy({ top: scrollBy, behavior: "instant" });
          }
        }
      }
      remeasure();
    }
    attachTargetObserver();

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(remeasure);
    };

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    const sidebar = document.querySelector(".terminal-sidebar-desktop, .terminal-sidebar");
    if (sidebar) {
      sidebarObserver = new ResizeObserver(scheduleUpdate);
      sidebarObserver.observe(sidebar);
    }
    const main = alignDashboard ? document.querySelector(".terminal-main") : null;
    if (main) {
      sidebarObserver ??= new ResizeObserver(scheduleUpdate);
      sidebarObserver.observe(main);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      targetObserver?.disconnect();
      sidebarObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [alignDashboard, enabled, preferSidebar, selector]);

  useLayoutEffect(() => {
    const activeElement = snapshot?.activeElement;
    if (!activeElement) {
      return;
    }

    activeElement.classList.add("product-guide-target-active");
    return () => {
      activeElement.classList.remove("product-guide-target-active");
    };
  }, [snapshot?.activeElement]);

  return snapshot;
}

export function useGuideTargetAvailable(selector: string, options?: GuideTargetOptions) {
  const [available, setAvailable] = useState(false);
  const preferSidebar = options?.preferSidebar ?? false;
  const requireReady = options?.requireReady ?? false;

  useLayoutEffect(() => {
    const update = () =>
      setAvailable(getVisibleTarget(selector, { preferSidebar, requireReady }) !== null);
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-guide-ready"] });
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [preferSidebar, requireReady, selector]);

  return available;
}
