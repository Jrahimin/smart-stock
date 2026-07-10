"use client";

import { useEffect, useState } from "react";

import type { GuideBounds } from "@/features/guide/lib/guide-positioning";

function measureContentBounds(isMobile: boolean): GuideBounds | null {
  if (typeof window === "undefined") {
    return null;
  }

  const main = document.querySelector<HTMLElement>(".terminal-main");
  if (!main) {
    return {
      left: 0,
      top: isMobile ? 56 : 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
  }

  const rect = main.getBoundingClientRect();
  const mobileHeader = document.querySelector<HTMLElement>(".mobile-app-header");
  const topInset = isMobile ? Math.max(rect.top, mobileHeader?.getBoundingClientRect().bottom ?? 56) : rect.top;

  return {
    left: rect.left,
    top: topInset,
    right: rect.right,
    bottom: rect.bottom,
  };
}

export function useGuideContentBounds(enabled: boolean, isMobile: boolean) {
  const [bounds, setBounds] = useState<GuideBounds | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBounds(null);
      return;
    }

    let frameId = 0;
    const update = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        setBounds(measureContentBounds(isMobile));
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    const main = document.querySelector(".terminal-main");
    const observer = main ? new ResizeObserver(update) : null;
    if (main) {
      observer?.observe(main);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [enabled, isMobile]);

  return bounds;
}
