"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type TaxInfoTooltipProps = {
  align?: "center" | "end" | "start";
  ariaLabel: string;
  children: ReactNode;
  panelClassName?: string;
  title?: string;
};

const HOVER_CLOSE_DELAY_MS = 140;

export function TaxInfoTooltip({
  align = "center",
  ariaLabel,
  children,
  panelClassName = "",
  title,
}: TaxInfoTooltipProps) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [canPortal, setCanPortal] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const panelId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const open = pinned || hovered;

  useEffect(() => {
    setCanPortal(true);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverCloseTimerRef.current) {
        window.clearTimeout(hoverCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pinned) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setPinned(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPinned(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [pinned]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      return;
    }

    function updatePosition() {
      const button = buttonRef.current;
      const panel = panelRef.current;
      if (!button || !panel) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const margin = 8;

      let top = rect.bottom + margin;
      let left =
        align === "end"
          ? rect.right - panelWidth
          : align === "start"
            ? rect.left
            : rect.left + rect.width / 2 - panelWidth / 2;

      if (top + panelHeight > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - panelHeight - margin);
      }

      left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));

      setPopoverStyle({
        left: `${left}px`,
        position: "fixed",
        top: `${top}px`,
        transform: "none",
        zIndex: 10000,
      });
    }

    updatePosition();

    const panel = panelRef.current;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && panel ? new ResizeObserver(updatePosition) : null;
    resizeObserver?.observe(panel);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, children, open]);

  function cancelHoverClose() {
    if (hoverCloseTimerRef.current) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }

  function scheduleHoverClose() {
    if (pinned) {
      return;
    }

    cancelHoverClose();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setHovered(false);
      hoverCloseTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }

  function handleRootMouseEnter() {
    cancelHoverClose();
    setHovered(true);
  }

  const popoverNode = (
    <div
      className={`wealth-tax-info-popover wealth-tax-info-popover--portaled ${panelClassName} wealth-tax-info-popover--open`.trim()}
      id={panelId}
      onMouseEnter={cancelHoverClose}
      onMouseLeave={scheduleHoverClose}
      ref={panelRef}
      role="tooltip"
      style={popoverStyle}
    >
      {children}
    </div>
  );

  return (
    <span
      className="wealth-tax-info-tooltip"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) {
          setHovered(false);
        }
      }}
      onFocus={() => setHovered(true)}
      onMouseEnter={handleRootMouseEnter}
      onMouseLeave={scheduleHoverClose}
      ref={rootRef}
    >
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={ariaLabel}
        className="wealth-tax-info-icon"
        onClick={() => setPinned((value) => !value)}
        ref={buttonRef}
        title={title}
        type="button"
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
          <circle cx="8" cy="8" fill="none" r="6.5" stroke="currentColor" strokeWidth="1.25" />
          <path
            d="M8 7.1V11.2M8 5.2h.01"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.35"
          />
        </svg>
      </button>
      {canPortal && open ? createPortal(popoverNode, document.body) : null}
    </span>
  );
}
