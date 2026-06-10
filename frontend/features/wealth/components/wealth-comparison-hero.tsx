"use client";

import { useId } from "react";

import type { ComparisonNarrativeBeat } from "@/features/wealth/view-models/wealth-comparison-view-model";

type WealthComparisonHeroProps = {
  beats: ComparisonNarrativeBeat[];
  subtitle: string;
  title: string;
};

export function WealthComparisonHero({ beats, subtitle, title }: WealthComparisonHeroProps) {
  const gradientId = useId();

  return (
    <header className="wealth-comparison-hero-canvas" aria-label="Comparison story introduction">
      <div aria-hidden="true" className="wealth-comparison-hero-glow" />
      <div aria-hidden="true" className="wealth-comparison-hero-abstract">
        <svg preserveAspectRatio="xMaxYMid slice" viewBox="0 0 420 320">
          <defs>
            <linearGradient id={`${gradientId}-veil`} x1="0" x2="1" y1="0.5" y2="0.5">
              <stop offset="0%" style={{ stopColor: "var(--panel)", stopOpacity: 1 }} />
              <stop offset="48%" style={{ stopColor: "var(--panel)", stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id={`${gradientId}-path-fdr`} x1="0" x2="1" y1="0.5" y2="0.5">
              <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.35 }} />
              <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0.9 }} />
            </linearGradient>
            <linearGradient id={`${gradientId}-path-dps`} x1="0" x2="1" y1="0.5" y2="0.5">
              <stop offset="0%" style={{ stopColor: "var(--positive)", stopOpacity: 0.3 }} />
              <stop offset="100%" style={{ stopColor: "var(--positive)", stopOpacity: 0.88 }} />
            </linearGradient>
            <radialGradient cx="50%" cy="50%" id={`${gradientId}-fork-glow`} r="50%">
              <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.2 }} />
              <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
            </radialGradient>
          </defs>

          <circle cx="108" cy="248" fill={`url(#${gradientId}-fork-glow)`} r="56" />

          <path
            className="wealth-comparison-hero-path wealth-comparison-hero-path-fdr"
            d="M 108 248 L 148 228 C 210 198, 278 168, 408 118"
            fill="none"
            stroke={`url(#${gradientId}-path-fdr)`}
          />
          <path
            className="wealth-comparison-hero-path wealth-comparison-hero-path-dps"
            d="M 108 248 L 148 262 C 220 288, 300 272, 408 198"
            fill="none"
            stroke={`url(#${gradientId}-path-dps)`}
          />

          <circle className="wealth-comparison-hero-fork" cx="108" cy="248" r="6" />
          <circle className="wealth-comparison-hero-path-node wealth-comparison-hero-path-node-fdr" cx="408" cy="118" r="5" />
          <circle className="wealth-comparison-hero-path-node wealth-comparison-hero-path-node-dps" cx="408" cy="198" r="5" />

          <rect fill={`url(#${gradientId}-veil)`} height="320" width="420" x="0" y="0" />
        </svg>
      </div>

      <div className="wealth-comparison-hero-copy">
        <p className="eyebrow">Future simulator</p>
        <h1>{title}</h1>
        <p className="wealth-comparison-hero-subtitle">{subtitle}</p>
        <p className="wealth-comparison-hero-prelude">You are about to explore two possible futures.</p>
      </div>

      <ol className="wealth-comparison-narrative-beats" aria-label="Story beats">
        {beats.map((beat) => (
          <li
            className={`wealth-comparison-narrative-beat ${beat.isHere ? "wealth-comparison-narrative-beat-here" : ""} ${beat.isFuture ? "wealth-comparison-narrative-beat-future" : ""}`}
            key={beat.id}
          >
            <span>{beat.when}</span>
            <strong>{beat.headline}</strong>
            <p>{beat.detail}</p>
          </li>
        ))}
      </ol>
    </header>
  );
}
