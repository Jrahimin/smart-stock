import Link from "next/link";

import { CircularProgressRing } from "@/components/ui/circular-progress-ring";
import type { WealthDashboard } from "@/features/wealth/types/wealth-types";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";

type MoneySnapshotCardProps = {
  isAuthenticated: boolean;
  dashboard?: WealthDashboard | null;
  localScenarioCount?: number;
};

export function MoneySnapshotCard({ isAuthenticated, dashboard, localScenarioCount = 0 }: MoneySnapshotCardProps) {
  if (!isAuthenticated) {
    return (
      <section className="wealth-snapshot-card wealth-snapshot-empty">
        <div>
          <p className="eyebrow">My Financial Picture</p>
          <h2>Build your Money Snapshot over time</h2>
          <p>
            A read-only preview until you add your picture. Start with a scenario, then save cash, deposits, loans, and
            goals when they feel relevant.
          </p>
          {localScenarioCount > 0 ? (
            <p className="wealth-local-note">
              You already have <strong>{localScenarioCount}</strong> saved scenario
              {localScenarioCount === 1 ? "" : "s"} locally.
            </p>
          ) : null}
        </div>
        <div className="wealth-snapshot-empty-actions">
          <Link className="wealth-primary-button" href="/wealth/snapshot">
            Add assets & liabilities
          </Link>
          <Link className="wealth-inline-link" href="/login">
            Sign in to sync later
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="wealth-snapshot-card wealth-snapshot-dashboard">
      <div className="wealth-snapshot-dashboard-main">
        <div className="wealth-snapshot-dashboard-copy">
          <p className="eyebrow">Money Snapshot</p>
          <h2>Your financial picture</h2>
          <p className="wealth-muted-copy">
            A live summary from saved assets, liabilities, and scenarios—not a full accounting setup.
          </p>
        </div>

        <div className="wealth-snapshot-widget-grid">
          <div className="wealth-snapshot-widget-main">
            <span>Net worth</span>
            <strong>{formatWealthCurrency(dashboard?.net_worth)}</strong>
            <small>Assets minus liabilities you have saved</small>
          </div>
          <div className="wealth-snapshot-widget-stat">
            <span>Monthly savings</span>
            <strong>{formatWealthCurrency(dashboard?.monthly_savings)}</strong>
          </div>
          <div className="wealth-snapshot-widget-stat">
            <span>Passive income</span>
            <strong>{formatWealthCurrency(dashboard?.passive_income_estimate)}</strong>
          </div>
          <div className="wealth-snapshot-widget-stat">
            <span>Saved scenarios</span>
            <strong>{dashboard?.saved_scenarios.length ?? 0}</strong>
          </div>
        </div>

        <Link className="wealth-inline-link" href="/wealth/snapshot">
          Add or update assets & liabilities
        </Link>
      </div>

      <aside className="wealth-snapshot-clarity-panel">
        <CircularProgressRing
          label="Clarity"
          score={dashboard?.clarity_score ?? 0}
          size={132}
          title="Based on useful context, not wealth size"
        />
        <p>Clarity grows as you save context—monthly savings, assets, liabilities, goals, and scenarios.</p>
      </aside>
    </section>
  );
}
