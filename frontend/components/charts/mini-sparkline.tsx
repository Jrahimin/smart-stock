type MiniSparklineProps = {
  points: number[];
  tone: "positive" | "negative" | "neutral";
  compact?: boolean;
};

export function MiniSparkline({ points, tone, compact = false }: MiniSparklineProps) {
  if (points.length < 2) {
    return null;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = compact ? 64 : 88;
  const height = compact ? 22 : 28;
  const polyline = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className={`pulse-sparkline pulse-sparkline-${tone}${compact ? " pulse-sparkline-compact" : ""}`}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <polyline fill="none" points={polyline} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function resolveSparklineTone(direction: string | null | undefined): "positive" | "negative" | "neutral" {
  if (direction === "improving" || direction === "accumulation") {
    return "positive";
  }
  if (direction === "deteriorating" || direction === "distribution") {
    return "negative";
  }
  return "neutral";
}
