"use client";

type CircularProgressRingProps = {
  label: string;
  score: number;
  tone?: "opportunity" | "risk" | "breakout" | "neutral";
  icon?: string;
  size?: number;
  onClick?: () => void;
  title?: string;
};

export function CircularProgressRing({
  label,
  score,
  tone = "neutral",
  icon,
  size = 88,
  onClick,
  title,
}: CircularProgressRingProps) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const offset = circumference - (progress / 100) * circumference;
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      className={`circular-progress-ring circular-progress-${tone} ${onClick ? "circular-progress-clickable" : ""}`}
      onClick={onClick}
      title={title}
      type={onClick ? "button" : undefined}
    >
      <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <circle
          className="circular-progress-track-circle"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="circular-progress-value-circle"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={stroke}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="circular-progress-center">
        {icon ? <span className="circular-progress-icon">{icon}</span> : null}
        <strong>{Math.round(progress)}</strong>
      </div>
      {label ? <span className="circular-progress-label">{label}</span> : null}
    </Wrapper>
  );
}
