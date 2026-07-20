"use client";

import Link from "next/link";
import { ArrowRight, Droplets, Lightbulb, Scale, Sparkles, TrendingDown } from "lucide-react";
import { useMemo } from "react";

import { MoneySnapshotCard } from "@/features/wealth/components/money-snapshot-card";
import { ScenarioLauncher } from "@/features/wealth/components/scenario-launcher";
import { WealthFuturePath } from "@/features/wealth/components/wealth-future-path";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import {
  WEALTH_OVERVIEW_SCENARIO_LAUNCHERS,
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
  const defaultMoneyLens = language.seasonal.bySeason.income_tax_season;
  const moneyLens = localizedSeasonalContext ?? {
    season_key: "income_tax_season",
    title: defaultMoneyLens.title,
    description: defaultMoneyLens.description,
    cta_label: defaultMoneyLens.ctaLabel,
    cta_href: "/wealth/tools/tax-planner",
  };
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
        <div className="wealth-hero-copy">
          <p className="eyebrow">{language.hero.eyebrow}</p>
          <h1>{language.hero.title}</h1>
          <p>{language.hero.description}</p>
          <Link className="wealth-primary-button wealth-hero-cta" href="#wealth-decisions">
            {language.hero.cta}
            <ArrowRight aria-hidden="true" size={16} strokeWidth={2.2} />
          </Link>
        </div>
        <WealthFuturePath labels={language.hero.timeline} />
      </header>

      <section className="wealth-seasonal-card wealth-money-lens">
        <div className="wealth-money-lens-content">
          <span aria-hidden="true" className="wealth-seasonal-icon">
            <Sparkles size={16} strokeWidth={2.2} />
          </span>
          <div className="wealth-money-lens-title-row">
            <p className="eyebrow">{language.seasonal.eyebrow}</p>
            <h2>{moneyLens.title}</h2>
          </div>
          <p className="wealth-money-lens-description">{moneyLens.description}</p>
        </div>
        <Link className="wealth-primary-button" href={moneyLens.cta_href}>
          {moneyLens.cta_label}
          <ArrowRight aria-hidden="true" size={15} strokeWidth={2} />
        </Link>
      </section>

      <ScenarioLauncher locale={locale} scenarios={WEALTH_OVERVIEW_SCENARIO_LAUNCHERS} />

      <MoneySnapshotCard
        dashboard={dashboard}
        isAuthenticated={isAuthenticated}
        isError={isError}
        isLoading={isLoading}
        insights={dashboard?.insights}
        localScenarioCount={localDraft.savedScenarioTitles.length}
        locale={locale}
      />

      <section className="wealth-principles-section">
        <div className="wealth-section-heading">
          <span aria-hidden="true" className="wealth-principles-heading-icon">
            <Lightbulb size={15} strokeWidth={1.9} />
          </span>
          <h2>{language.insights.principlesEyebrow}</h2>
        </div>
        <section className="wealth-education-strip">
          {[TrendingDown, Droplets, Scale].map((Icon, index) => {
            const bite = language.insights.education[index];

            return (
            <article className="wealth-education-card" key={bite}>
              <span aria-hidden="true" className="wealth-principle-icon">
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <p>{bite}</p>
            </article>
            );
          })}
        </section>
      </section>
    </div>
  );
}
