"use client";

import { useId } from "react";

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
  size = 96,
  onClick,
  title,
}: CircularProgressRingProps) {
  const gradientId = useId();
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const offset = circumference - (progress / 100) * circumference;
  const Wrapper = onClick ? "button" : "div";
  const usesGradient = tone === "opportunity" || tone === "risk";

  return (
    <Wrapper
      className={`circular-progress-ring circular-progress-${tone} ${onClick ? "circular-progress-clickable" : ""}`}
      onClick={onClick}
      title={title}
      type={onClick ? "button" : undefined}
    >
      <div className="circular-progress-chart" style={{ height: size, width: size }}>
        <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
          {usesGradient ? (
            <defs>
              <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
                {tone === "opportunity" ? (
                  <>
                    <stop offset="0%" stopColor="var(--positive)" />
                    <stop offset="100%" stopColor="color-mix(in srgb, var(--primary) 55%, var(--positive))" />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor="#ff9b8f" />
                    <stop offset="100%" stopColor="var(--negative)" />
                  </>
                )}
              </linearGradient>
            </defs>
          ) : null}
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
            style={usesGradient ? { stroke: `url(#${gradientId})` } : undefined}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="circular-progress-center">
          {icon ? <span className="circular-progress-icon">{icon}</span> : null}
          <strong>{Math.round(progress)}</strong>
        </div>
      </div>
      {label ? <span className="circular-progress-label">{label}</span> : null}
    </Wrapper>
  );
}
