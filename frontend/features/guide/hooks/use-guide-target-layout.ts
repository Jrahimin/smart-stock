"use client";

import { useLayoutEffect, useMemo, useReducer, useState } from "react";

import {
  clipRectToViewport,
  type GuideRect,
} from "@/features/guide/lib/guide-positioning";

export type GuideTargetSnapshot = {
  activeElement: HTMLElement | null;
  sidebarRight: number | null;
  spotlightRect: GuideRect;
  targetRect: GuideRect;
};

type GuideTargetOptions = {
  preferSidebar?: boolean;
};

function isElementVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

export function getVisibleTarget(selector: string, options?: GuideTargetOptions): HTMLElement | null {
  const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const visible = matches.filter(isElementVisible);

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

function measureSidebarRight() {
  const sidebar = document.querySelector<HTMLElement>(".terminal-sidebar-desktop");
  if (!sidebar) {
    return null;
  }

  const rect = sidebar.getBoundingClientRect();
  return rect.width > 0 ? rect.right : null;
}

export function buildTargetSnapshot(target: HTMLElement): GuideTargetSnapshot {
  const targetRect = toGuideRect(target.getBoundingClientRect());
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

  if (options.tall) {
    const topInset = 72;
    if (target.getBoundingClientRect().top < topInset) {
      target.scrollIntoView({ behavior, block: "start", inline: "nearest" });
    }
    return;
  }

  target.scrollIntoView({ behavior, block: "center", inline: "nearest" });
}

export function useGuideTargetLayout(
  selector: string | null,
  enabled: boolean,
  options?: GuideTargetOptions,
) {
  const [revision, bumpRevision] = useReducer((count: number) => count + 1, 0);
  const preferSidebar = options?.preferSidebar ?? false;

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

    const update = () => {
      bumpRevision();
      targetObserver?.disconnect();

      const target = getVisibleTarget(selector, { preferSidebar });
      const nextObserver = target ? new ResizeObserver(() => window.requestAnimationFrame(update)) : null;
      targetObserver = nextObserver;
      if (target && nextObserver) {
        nextObserver.observe(target);
      }
    };

    update();

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(update);
    };

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    const sidebar = document.querySelector(".terminal-sidebar-desktop, .terminal-sidebar");
    if (sidebar) {
      sidebarObserver = new ResizeObserver(scheduleUpdate);
      sidebarObserver.observe(sidebar);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      targetObserver?.disconnect();
      sidebarObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [enabled, preferSidebar, selector]);

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

  useLayoutEffect(() => {
    const update = () => setAvailable(getVisibleTarget(selector, { preferSidebar }) !== null);
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [preferSidebar, selector]);

  return available;
}
