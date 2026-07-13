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
  WEALTH_INTENT_OPTIONS,
  WEALTH_SCENARIO_LAUNCHERS,
} from "@/features/wealth/catalog/wealth-catalog";
import { useWealthDashboard } from "@/features/wealth/hooks/use-wealth-dashboard";
import { readLocalMoneySnapshot } from "@/features/wealth/lib/local-money-snapshot";
import { useAuth } from "@/features/auth/context/auth-context";
import { getWealthLandingLanguage, getWealthSeasonalCopy } from "@/features/wealth/wealth-language";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/locale/app-locale";

export function WealthWorkspaceView({ locale = DEFAULT_LOCALE }: { locale?: AppLocale }) {
  const { isAuthenticated } = useAuth();
  const { dashboard, seasonalContext, isLoading, isError } = useWealthDashboard();
  const language = getWealthLandingLanguage(locale);
  const localizedSeasonalContext = seasonalContext ? getWealthSeasonalCopy(seasonalContext, locale) : null;
  const localDraft = useMemo(() => readLocalMoneySnapshot(), []);

  return (
    <div className="wealth-workspace-view">
      <WealthSubNav locale={locale} />

      {isLoading ? (
        <p className="wealth-muted-copy" role="status">
          {language.states.loading}
        </p>
      ) : null}
      {isError ? (
        <p className="wealth-error-copy" role="alert">
          {language.states.error}
        </p>
      ) : null}
      {isAuthenticated && !dashboard && !isLoading && !isError ? (
        <p className="wealth-muted-copy" role="status">
          {language.states.empty}
        </p>
      ) : null}

      <header className="wealth-hero-card">
        <p className="eyebrow">{language.hero.eyebrow}</p>
        <h1>{language.hero.title}</h1>
        <p>{language.hero.description}</p>
        <div className="wealth-intent-row">
          {WEALTH_INTENT_OPTIONS.map((intent) => (
            <Link className="wealth-chip" href={intent.href} key={intent.href}>
              {language.hero.intentLabels[intent.href]}
            </Link>
          ))}
        </div>
      </header>

      {localizedSeasonalContext ? (
        <section className="wealth-seasonal-card">
          <div>
            <p className="eyebrow">{language.seasonal.eyebrow}</p>
            <h2>{localizedSeasonalContext.title}</h2>
            <p>{localizedSeasonalContext.description}</p>
          </div>
          <Link className="wealth-primary-button" href={localizedSeasonalContext.cta_href}>
            {localizedSeasonalContext.cta_label}
          </Link>
        </section>
      ) : null}

      <ScenarioLauncher locale={locale} scenarios={WEALTH_SCENARIO_LAUNCHERS} />

      <section className="wealth-section">
        <div className="wealth-section-heading">
          <p className="eyebrow">{language.comparison.eyebrow}</p>
          <h2>{language.comparison.title}</h2>
        </div>
        <div className="wealth-comparison-strip">
          {WEALTH_COMPARISON_CARDS.map((comparison) => (
            <ComparisonCard
              accent={comparison.accent}
              key={comparison.slug}
              locale={locale}
              slug={comparison.slug}
            />
          ))}
        </div>
      </section>

      <MoneySnapshotCard
        dashboard={dashboard}
        isAuthenticated={isAuthenticated}
        isError={isError}
        isLoading={isLoading}
        localScenarioCount={localDraft.savedScenarioTitles.length}
        locale={locale}
      />

      {dashboard?.insights?.length ? (
        <section className="wealth-section">
          <div className="wealth-section-heading">
            <p className="eyebrow">{language.insights.eyebrow}</p>
            <h2>{language.insights.title}</h2>
          </div>
          <div className="wealth-insight-grid">
            {dashboard.insights.map((insight) => (
              <WealthInsightCard insight={insight} key={insight.id} locale={locale} />
            ))}
          </div>
        </section>
      ) : (
        <section className="wealth-education-strip">
          {language.insights.education.map((bite) => (
            <article className="wealth-education-card" key={bite}>
              <p>{bite}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
