"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { StockSectionId } from "@/features/stock-workspace/types/stock-section-types";

type UseStockSectionNavOptions = {
  enabledSectionIds: StockSectionId[];
};

const NAV_SELECTOR = ".stock-section-nav";
/** How far below the sticky nav a section anchor may sit and still count as active. */
const ACTIVE_SECTION_TOLERANCE_PX = 120;

function prefersReducedMotion() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getSectionScrollOffset() {
  const nav = document.querySelector<HTMLElement>(NAV_SELECTOR);
  if (!nav) {
    return 48;
  }

  const navTop = Number.parseFloat(getComputedStyle(nav).top) || 0;
  return nav.getBoundingClientRect().height + navTop + 6;
}

/**
 * Pick the section whose anchor is closest to (and above) the sticky nav line.
 * Using the last section with top <= offset fails when a tall section (Technicals)
 * keeps its anchor far above the viewport while a later section is visible.
 */
function resolveActiveSection(sectionIds: StockSectionId[]) {
  const offset = getSectionScrollOffset();
  const activeUpperBound = offset + ACTIVE_SECTION_TOLERANCE_PX;

  let active = sectionIds[0] ?? "overview";
  let bestTop = Number.NEGATIVE_INFINITY;

  for (const sectionId of sectionIds) {
    const element = document.getElementById(sectionId);
    if (!element) {
      continue;
    }

    const top = element.getBoundingClientRect().top;
    if (top <= activeUpperBound && top > bestTop) {
      bestTop = top;
      active = sectionId;
    }
  }

  return active;
}

export function useStockSectionNav({ enabledSectionIds }: UseStockSectionNavOptions) {
  const [activeSection, setActiveSection] = useState<StockSectionId>(enabledSectionIds[0] ?? "overview");
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releaseProgrammaticScroll = useCallback(() => {
    isProgrammaticScrollRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabledSectionIds.length) {
      return;
    }

    let frame = 0;

    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) {
        return;
      }

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextActive = resolveActiveSection(enabledSectionIds);
        setActiveSection((current) => (current === nextActive ? current : nextActive));
      });
    };

    const handleScrollEnd = () => {
      if (!isProgrammaticScrollRef.current) {
        return;
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }

      releaseProgrammaticScroll();
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    window.addEventListener("scrollend", handleScrollEnd);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      window.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [enabledSectionIds, releaseProgrammaticScroll]);

  useEffect(() => {
    if (enabledSectionIds.length && !enabledSectionIds.includes(activeSection)) {
      setActiveSection(enabledSectionIds[0]);
    }
  }, [activeSection, enabledSectionIds]);

  useEffect(
    () => () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    },
    [],
  );

  const scrollToSection = useCallback(
    (sectionId: StockSectionId) => {
      const element = document.getElementById(sectionId);
      if (!element) {
        return;
      }

      const offset = getSectionScrollOffset();
      const top = element.getBoundingClientRect().top + window.scrollY - offset;

      isProgrammaticScrollRef.current = true;
      setActiveSection(sectionId);

      window.scrollTo({
        top: Math.max(0, top),
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Fallback when scrollend is unsupported; keep clicked tab active (do not re-resolve).
      scrollTimeoutRef.current = setTimeout(() => {
        releaseProgrammaticScroll();
      }, prefersReducedMotion() ? 0 : 700);
    },
    [releaseProgrammaticScroll],
  );

  return {
    activeSection,
    scrollToSection,
  };
}
