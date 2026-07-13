"use client";

import type { StockSectionDefinition, StockSectionId } from "@/features/stock-workspace/types/stock-section-types";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type StockSectionNavProps = {
  sections: StockSectionDefinition[];
  activeSection: StockSectionId;
  onNavigate: (sectionId: StockSectionId) => void;
  copy: StockWorkspaceLanguage["nav"];
};

export function StockSectionNav({ sections, activeSection, onNavigate, copy }: StockSectionNavProps) {
  if (!sections.length) {
    return null;
  }

  return (
    <nav aria-label={copy.ariaLabel} className="stock-section-nav">
      <div className="stock-section-nav-track">
        {sections.map((section) => {
          const isActive = section.id === activeSection;

          return (
            <button
              aria-current={isActive ? "true" : undefined}
              className={`stock-section-nav-item ${isActive ? "stock-section-nav-item-active" : ""}`.trim()}
              key={section.id}
              onClick={() => onNavigate(section.id)}
              type="button"
            >
              {section.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
