import Link from "next/link";

import { CircularProgressRing } from "@/components/ui/circular-progress-ring";
import type { WealthDashboard } from "@/features/wealth/types/wealth-types";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { getWealthLandingLanguage, getWealthSavedScenarioNote } from "@/features/wealth/wealth-language";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/locale/app-locale";

type MoneySnapshotCardProps = {
  isAuthenticated: boolean;
  dashboard?: WealthDashboard | null;
  localScenarioCount?: number;
  isLoading?: boolean;
  isError?: boolean;
  locale?: AppLocale;
};

export function MoneySnapshotCard({
  isAuthenticated,
  dashboard,
  localScenarioCount = 0,
  isLoading = false,
  isError = false,
  locale = DEFAULT_LOCALE,
}: MoneySnapshotCardProps) {
  const language = getWealthLandingLanguage(locale);
  const copy = language.snapshot;

  if (!isAuthenticated) {
    return (
      <section className="wealth-snapshot-card wealth-snapshot-empty">
        <div>
          <p className="eyebrow">{copy.guestEyebrow}</p>
          <h2>{copy.guestTitle}</h2>
          <p>{copy.guestDescription}</p>
          {localScenarioCount > 0 ? (
            <p className="wealth-local-note">{getWealthSavedScenarioNote(localScenarioCount, locale)}</p>
          ) : null}
        </div>
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
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p>{isError ? language.states.error : isLoading ? language.states.loading : language.states.empty}</p>
        </div>
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
        </div>

        <div className="wealth-snapshot-widget-grid">
          <div className="wealth-snapshot-widget-main">
            <span>{copy.netWorth}</span>
            <strong>{formatWealthCurrency(dashboard?.net_worth)}</strong>
            <small>{copy.netWorthHint}</small>
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

      <aside className="wealth-snapshot-clarity-panel">
        <CircularProgressRing
          label={copy.clarity}
          score={dashboard?.clarity_score ?? 0}
          size={132}
          title={copy.clarityTitle}
        />
        <p>{copy.clarityDescription}</p>
      </aside>
    </section>
  );
}
