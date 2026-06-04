"use client";

type ScoreProgressBarProps = {
  label: string;
  score: number;
  tone?: "opportunity" | "risk" | "neutral";
  onInfoClick?: () => void;
};

export function ScoreProgressBar({ label, score, tone = "neutral", onInfoClick }: ScoreProgressBarProps) {
  return (
    <div className={`score-progress-bar score-progress-${tone}`}>
      <div className="score-progress-header">
        <span>{label}</span>
        <strong>{score}/100</strong>
        {onInfoClick ? (
          <button aria-label={`${label} breakdown`} className="score-info-button" onClick={onInfoClick} type="button">
            i
          </button>
        ) : null}
      </div>
      <div aria-hidden="true" className="score-progress-track">
        <div className="score-progress-fill" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}
