"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ComparisonCard } from "@/features/wealth/components/comparison-card";
import { MoneySnapshotCard } from "@/features/wealth/components/money-snapshot-card";
import { ScenarioLauncher } from "@/features/wealth/components/scenario-launcher";
import { WealthInsightCard } from "@/features/wealth/components/wealth-insight-card";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import {
  WEALTH_COMPARISON_CARDS,
  WEALTH_EDUCATION_BITES,
  WEALTH_INTENT_OPTIONS,
  WEALTH_SCENARIO_LAUNCHERS,
} from "@/features/wealth/catalog/wealth-catalog";
import { useWealthDashboard } from "@/features/wealth/hooks/use-wealth-dashboard";
import { readLocalMoneySnapshot } from "@/features/wealth/lib/local-money-snapshot";
import { useAuth } from "@/features/auth/context/auth-context";

export function WealthWorkspaceView() {
  const { isAuthenticated } = useAuth();
  const { dashboard, seasonalContext } = useWealthDashboard();
  const localDraft = useMemo(() => readLocalMoneySnapshot(), []);

  return (
    <div className="wealth-workspace-view">
      <WealthSubNav />

      <header className="wealth-hero-card">
        <p className="eyebrow">My Money</p>
        <h1>Explore your money decisions before you make them</h1>
        <p>Understand today&apos;s choice. See tomorrow&apos;s impact. No forms. No accounting. Just clarity.</p>
        <div className="wealth-intent-row">
          {WEALTH_INTENT_OPTIONS.map((intent) => (
            <Link className="wealth-chip" href={intent.href} key={intent.href}>
              {intent.label}
            </Link>
          ))}
        </div>
      </header>

      {seasonalContext ? (
        <section className="wealth-seasonal-card">
          <div>
            <p className="eyebrow">Today&apos;s Money Lens</p>
            <h2>{seasonalContext.title}</h2>
            <p>{seasonalContext.description}</p>
          </div>
          <Link className="wealth-primary-button" href={seasonalContext.cta_href}>
            {seasonalContext.cta_label}
          </Link>
        </section>
      ) : null}

      <ScenarioLauncher scenarios={WEALTH_SCENARIO_LAUNCHERS} />

      <section className="wealth-section">
        <div className="wealth-section-heading">
          <p className="eyebrow">Compare choices</p>
          <h2>Which path feels more interesting?</h2>
        </div>
        <div className="wealth-comparison-strip">
          {WEALTH_COMPARISON_CARDS.map((comparison) => (
            <ComparisonCard
              description={comparison.description}
              accent={comparison.accent}
              cue={comparison.cue}
              key={comparison.slug}
              slug={comparison.slug}
              title={comparison.title}
            />
          ))}
        </div>
      </section>

      <MoneySnapshotCard
        dashboard={dashboard}
        isAuthenticated={isAuthenticated}
        localScenarioCount={localDraft.savedScenarioTitles.length}
      />

      {dashboard?.insights?.length ? (
        <section className="wealth-section">
          <div className="wealth-section-heading">
            <p className="eyebrow">Gentle observations</p>
            <h2>What your picture suggests so far</h2>
          </div>
          <div className="wealth-insight-grid">
            {dashboard.insights.map((insight) => (
              <WealthInsightCard insight={insight} key={insight.id} />
            ))}
          </div>
        </section>
      ) : (
        <section className="wealth-education-strip">
          {WEALTH_EDUCATION_BITES.map((bite) => (
            <article className="wealth-education-card" key={bite}>
              <p>{bite}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
