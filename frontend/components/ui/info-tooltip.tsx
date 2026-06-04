"use client";

import type { ReactNode } from "react";

type InfoTooltipProps = {
  label: string;
  content: string;
  children?: ReactNode;
};

export function InfoTooltip({ label, content, children }: InfoTooltipProps) {
  return (
    <span className="info-tooltip">
      {children}
      <button aria-label={label} className="info-tooltip-trigger" title={content} type="button">
        i
      </button>
    </span>
  );
}
