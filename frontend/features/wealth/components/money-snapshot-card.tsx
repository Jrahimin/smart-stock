import Link from "next/link";
import { ArrowRight, Eye, Layers3, Sparkles } from "lucide-react";

import { MoneySnapshotProjectionCue } from "@/features/wealth/components/money-snapshot-projection-cue";
import type { WealthDashboard, WealthInsightCard as WealthInsightCardType } from "@/features/wealth/types/wealth-types";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { getWealthInsightCopy, getWealthLandingLanguage, getWealthSavedScenarioNote } from "@/features/wealth/wealth-language";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/locale/app-locale";

type MoneySnapshotCardProps = {
  isAuthenticated: boolean;
  dashboard?: WealthDashboard | null;
  localScenarioCount?: number;
  isLoading?: boolean;
  isError?: boolean;
  insights?: WealthInsightCardType[];
  locale?: AppLocale;
};

export function MoneySnapshotCard({
  isAuthenticated,
  dashboard,
  localScenarioCount = 0,
  isLoading = false,
  isError = false,
  insights = [],
  locale = DEFAULT_LOCALE,
}: MoneySnapshotCardProps) {
  const language = getWealthLandingLanguage(locale);
  const copy = language.snapshot;
  const snapshotInsight = insights[0] ? getWealthInsightCopy(insights[0], locale) : null;

  if (!isAuthenticated) {
    return (
      <section className="wealth-snapshot-card wealth-snapshot-empty">
        <div className="wealth-snapshot-empty-copy">
          <p className="eyebrow">{copy.guestEyebrow}</p>
          <h2>{copy.guestTitle}</h2>
          <p>{copy.guestDescription}</p>
          {localScenarioCount > 0 ? (
            <p className="wealth-local-note">{getWealthSavedScenarioNote(localScenarioCount, locale)}</p>
          ) : null}
        </div>
        <SnapshotGuide steps={copy.guideSteps} />
        <div className="wealth-snapshot-empty-actions">
          <Link className="wealth-primary-button" href="/wealth/snapshot">
            {copy.addAssets}
          </Link>
          <Link className="wealth-inline-link" href="/login">
            {copy.signInToSync}
          </Link>
        </div>
      </section>
    );
  }

  if (!dashboard) {
    return (
      <section className="wealth-snapshot-card wealth-snapshot-empty">
        <div className="wealth-snapshot-empty-copy">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p>{isError ? language.states.error : isLoading ? language.states.loading : language.states.empty}</p>
          <p className="wealth-snapshot-growth-hint">{copy.growthHint}</p>
        </div>
        <SnapshotGuide steps={copy.guideSteps} />
        <div className="wealth-snapshot-empty-actions">
          <Link className="wealth-primary-button" href="/wealth/snapshot">
            {copy.updateAssets}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="wealth-snapshot-card wealth-snapshot-dashboard">
      <div className="wealth-snapshot-dashboard-main">
        <div className="wealth-snapshot-dashboard-copy">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="wealth-muted-copy">{copy.description}</p>
          <p className="wealth-snapshot-growth-hint">{copy.growthHint}</p>
          {snapshotInsight?.action_label && snapshotInsight.action_href ? (
            <Link className="wealth-snapshot-next-step" href={snapshotInsight.action_href}>
              {snapshotInsight.action_label}
              <ArrowRight aria-hidden="true" size={14} strokeWidth={2} />
            </Link>
          ) : null}
        </div>

        <div className="wealth-snapshot-widget-grid">
          <div className="wealth-snapshot-widget-main">
            <span>{copy.netWorth}</span>
            <strong>{formatWealthCurrency(dashboard?.net_worth)}</strong>
            <small>{copy.netWorthHint}</small>
            <MoneySnapshotProjectionCue />
          </div>
          <div className="wealth-snapshot-widget-stat">
            <span>{copy.monthlySavings}</span>
            <strong>{formatWealthCurrency(dashboard?.monthly_savings)}</strong>
          </div>
          <div className="wealth-snapshot-widget-stat">
            <span>{copy.passiveIncome}</span>
            <strong>{formatWealthCurrency(dashboard?.passive_income_estimate)}</strong>
          </div>
          <div className="wealth-snapshot-widget-stat">
            <span>{copy.savedScenarios}</span>
            <strong>{dashboard?.saved_scenarios.length ?? 0}</strong>
          </div>
        </div>

        <Link className="wealth-inline-link" href="/wealth/snapshot">
          {copy.updateAssets}
        </Link>
      </div>

    </section>
  );
}

function SnapshotGuide({ steps }: { steps: string[] }) {
  const icons = [Layers3, Eye, Sparkles];

  return (
    <div className="wealth-snapshot-guide" aria-label="Money Snapshot guide">
      {steps.map((step, index) => {
        const Icon = icons[index] ?? Sparkles;

        return (
          <div className="wealth-snapshot-guide-step" key={step}>
            <span aria-hidden="true" className="wealth-snapshot-guide-icon">
              <Icon size={15} strokeWidth={1.8} />
            </span>
            <span>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
