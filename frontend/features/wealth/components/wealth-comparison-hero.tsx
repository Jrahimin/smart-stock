"use client";

import { useId } from "react";

import type { WealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { ComparisonNarrativeBeat } from "@/features/wealth/view-models/wealth-comparison-view-model";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthComparisonHeroProps = {
  beats: ComparisonNarrativeBeat[];
  subtitle: string;
  title: string;
  copy?: Pick<WealthToolsLanguage["comparison"], "scenarioTitle" | "heroEyebrow" | "prelude">;
  locale: AppLocale;
};

export function WealthComparisonHero({ beats, subtitle, title, copy, locale }: WealthComparisonHeroProps) {
  const gradientId = useId();

  return (
    <header className="wealth-comparison-hero-canvas" aria-label={copy?.scenarioTitle ?? "Comparison story introduction"}>
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
        <p className="eyebrow">{copy?.heroEyebrow ?? "Future simulator"}</p>
        <h1>{title}</h1>
        <p className="wealth-comparison-hero-subtitle">{subtitle}</p>
        <p className="wealth-comparison-hero-prelude">{copy?.prelude ?? "You are about to explore two possible futures."}</p>
      </div>

      <ol className="wealth-comparison-narrative-beats" aria-label={locale === "bn" ? "গল্পের গুরুত্বপূর্ণ মুহূর্ত" : "Story beats"}>
        {beats.map((beat, index) => {
          const displayBeat = locale === "bn" ? localizeBeat(beat, index) : beat;
          return (
          <li
            className={`wealth-comparison-narrative-beat ${displayBeat.isHere ? "wealth-comparison-narrative-beat-here" : ""} ${displayBeat.isFuture ? "wealth-comparison-narrative-beat-future" : ""}`}
            key={displayBeat.id}
          >
            <span>{displayBeat.when}</span>
            <strong>{displayBeat.headline}</strong>
            <p>{displayBeat.detail}</p>
          </li>
          );
        })}
      </ol>
    </header>
  );
}

function localizeBeat(beat: ComparisonNarrativeBeat, index: number): ComparisonNarrativeBeat {
  const copy = [
    { when: "আজ", headline: "আজ থেকেই শুরু", detail: "আজকের সিদ্ধান্তেই দুই পথ তৈরি হচ্ছে।" },
    { when: "শুরুতে", headline: "FDR এগিয়ে", detail: "শুরুতেই পুরো amount কাজে লাগায় বলে FDR আগে এগোতে পারে।" },
    { when: beat.when, headline: "সময় গেলে ছবিটা বদলায়", detail: "নিয়মিত saving চললে DPS ধীরে ধীরে gap কমাতে পারে।" },
  ][index];
  return copy ? { ...beat, ...copy } : beat;
}
