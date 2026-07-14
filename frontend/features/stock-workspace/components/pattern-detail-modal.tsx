"use client";

import type { PatternDetectionDto } from "@/lib/api/stock-decision-support-types";
import { WorkspaceModal } from "@/components/ui/workspace-modal";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type PatternDetailModalProps = {
  pattern: PatternDetectionDto | null;
  isOpen: boolean;
  onClose: () => void;
  riskLabel?: string;
  copy: StockWorkspaceLanguage["pattern"];
};

function PatternIllustration({ name }: { name: string }) {
  const normalized = name.toLowerCase();
  if (normalized.includes("bull flag")) {
    return (
      <svg aria-hidden="true" className="pattern-illustration" viewBox="0 0 320 120">
        <polyline fill="none" points="20,90 80,35 130,35" stroke="currentColor" strokeWidth="3" />
        <rect fill="none" height="28" stroke="currentColor" strokeWidth="2" width="90" x="130" y="47" />
        <line stroke="currentColor" strokeDasharray="4 4" strokeWidth="2" x1="130" x2="320" y1="75" y2="75" />
      </svg>
    );
  }
  if (normalized.includes("double bottom")) {
    return (
      <svg aria-hidden="true" className="pattern-illustration" viewBox="0 0 320 120">
        <path d="M20 40 Q60 90 100 55 T180 55 T260 40" fill="none" stroke="currentColor" strokeWidth="3" />
        <line stroke="currentColor" strokeDasharray="4 4" strokeWidth="2" x1="20" x2="300" y1="55" y2="55" />
      </svg>
    );
  }
  if (normalized.includes("head")) {
    return (
      <svg aria-hidden="true" className="pattern-illustration" viewBox="0 0 320 120">
        <path d="M30 50 L90 35 L150 55 L210 30 L270 50" fill="none" stroke="currentColor" strokeWidth="3" />
        <line stroke="currentColor" strokeDasharray="4 4" strokeWidth="2" x1="30" x2="270" y1="55" y2="55" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="pattern-illustration" viewBox="0 0 320 120">
      <polyline fill="none" points="30,80 90,50 150,65 210,40 270,55" stroke="currentColor" strokeWidth="3" />
      <line stroke="currentColor" strokeDasharray="4 4" strokeWidth="2" x1="30" x2="270" y1="80" y2="80" />
    </svg>
  );
}

function buildTradingInterpretation(pattern: PatternDetectionDto, copy: StockWorkspaceLanguage["pattern"]): string[] {
  const lines = [
    pattern.direction === "bullish"
      ? copy.bullishInterpretation
      : pattern.direction === "bearish"
        ? copy.bearishInterpretation
        : copy.neutralInterpretation,
  ];
  if (pattern.breakout_level !== null) {
    lines.push(copy.breakoutAbove(pattern.breakout_level));
  }
  if (pattern.invalidation_level !== null) {
    lines.push(copy.invalidatedBelow(pattern.invalidation_level));
  }
  return lines;
}

export function PatternDetailModal({ pattern, isOpen, onClose, riskLabel = "Medium", copy }: PatternDetailModalProps) {
  if (!pattern) {
    return null;
  }

  const tone = pattern.direction === "bullish" ? "positive" : pattern.direction === "bearish" ? "negative" : "warning";

  return (
    <WorkspaceModal isOpen={isOpen} onClose={onClose} size="large" title="">
      <div className={`pattern-detail-modal-v2 pattern-detail-${tone}`}>
        <header className="pattern-detail-header">
          <div>
            <p className="pattern-detail-eyebrow">{pattern.status}</p>
            <h2>{pattern.name}</h2>
          </div>
          <div className="pattern-detail-meta">
            <span>{copy.confidence(pattern.pattern_match_score ?? pattern.confidence)}</span>
            <span>{copy.status}: {pattern.status}</span>
          </div>
        </header>

        <PatternIllustration name={pattern.name} />

        <section>
          <h3>{copy.whyMatched}</h3>
          <ul className="pattern-checklist">
            {pattern.matched_reasons.map((reason) => (
              <li key={reason}>✓ {reason}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3>{copy.tradingInterpretation}</h3>
          <ul className="pattern-interpretation-list">
            {buildTradingInterpretation(pattern, copy).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <div className="pattern-detail-stats">
          <div>
            <span>{copy.projectedTarget}</span>
            <strong>{pattern.target_estimate ?? "N/A"}</strong>
          </div>
          <div>
            <span>{copy.risk}</span>
            <strong>{riskLabel}</strong>
          </div>
        </div>

        <footer className="pattern-detail-footer">
          {copy.footer}
        </footer>
      </div>
    </WorkspaceModal>
  );
}
