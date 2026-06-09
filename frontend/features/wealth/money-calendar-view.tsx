"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { useMoneySnapshot } from "@/features/wealth/hooks/use-money-snapshot";
import { readLocalMoneySnapshot } from "@/features/wealth/lib/local-money-snapshot";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { useAuth } from "@/features/auth/context/auth-context";

type CalendarAsset = {
  category: string;
  label: string;
  value: string | number;
  metadata: Record<string, unknown>;
};

type CalendarLiability = {
  label: string;
  balance: string | number;
  monthly_emi?: string | number | null;
  remaining_months?: number | string | null;
};

export function MoneyCalendarView() {
  const { isAuthenticated } = useAuth();
  const { snapshot } = useMoneySnapshot();
  const [localDraft, setLocalDraft] = useState(() => readLocalMoneySnapshot());

  useEffect(() => {
    if (!isAuthenticated) {
      setLocalDraft(readLocalMoneySnapshot());
    }
  }, [isAuthenticated]);

  const events = useMemo(() => {
    const assets: CalendarAsset[] =
      isAuthenticated && snapshot
        ? snapshot.assets.map((asset) => ({
            category: asset.category,
            label: asset.label,
            value: asset.value,
            metadata: asset.metadata_json ?? {},
          }))
        : localDraft.assets.map((asset) => ({
            category: asset.category,
            label: asset.label,
            value: asset.value,
            metadata: asset.metadata ?? {},
          }));

    const liabilities: CalendarLiability[] =
      isAuthenticated && snapshot
        ? snapshot.liabilities
        : localDraft.liabilities;

    return buildCalendarEvents(assets, liabilities);
  }, [isAuthenticated, localDraft.assets, localDraft.liabilities, snapshot]);

  return (
    <section className="wealth-snapshot-page">
      <WealthSubNav />

      <header className="wealth-hero-card">
        <p className="eyebrow">Money Calendar</p>
        <h1>Upcoming money events</h1>
        <p>Profit payouts, maturity dates, EMIs, and debt milestones from the context in your Money Snapshot.</p>
      </header>

      <section className="wealth-panel">
        {events.length ? (
          <div className="wealth-money-event-list wealth-money-event-list-expanded">
            {events.map((event) => (
              <div className={`wealth-money-event wealth-money-event-${event.kind}`} key={`${event.dateLabel}-${event.label}`}>
                <span>{event.dateLabel}</span>
                <strong>{event.label}</strong>
                <small>{event.value}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="wealth-empty-panel">
            <p className="wealth-muted-copy">
              Add maturity dates, payout frequency, or EMI details in Money Snapshot to build your calendar.
            </p>
            <Link className="wealth-primary-button" href="/wealth/snapshot">
              Open Money Snapshot
            </Link>
          </div>
        )}
      </section>
    </section>
  );
}

function buildCalendarEvents(assets: CalendarAsset[], liabilities: CalendarLiability[]) {
  const events: Array<{ dateLabel: string; label: string; value: string; kind: string }> = [];

  for (const asset of assets) {
    const maturityDate = metadataString(asset.metadata, "maturity_date");
    const periodicProfit = periodicProfitValue(asset);
    if (periodicProfit) {
      events.push({
        dateLabel: payoutLabel(asset),
        label: `${asset.label} profit`,
        value: periodicProfit,
        kind: "profit",
      });
    }
    if (maturityDate) {
      events.push({
        dateLabel: formatDateLabel(maturityDate),
        label: `${asset.label} matures`,
        value: formatWealthCurrency(asset.value),
        kind: "maturity",
      });
    }
  }

  for (const liability of liabilities) {
    if (liability.monthly_emi) {
      events.push({
        dateLabel: "Monthly",
        label: `${liability.label} EMI`,
        value: formatWealthCurrency(liability.monthly_emi),
        kind: "emi",
      });
    }
    if (liability.remaining_months) {
      events.push({
        dateLabel: `In ${liability.remaining_months} months`,
        label: `${liability.label} completed`,
        value: "Debt free",
        kind: "payoff",
      });
    }
  }

  return events.slice(0, 16);
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return value == null ? "" : String(value);
}

function periodicProfitValue(asset: CalendarAsset) {
  const stored = asset.metadata.periodic_profit ?? asset.metadata.monthly_profit;
  if (stored) {
    return formatWealthCurrency(Number(stored));
  }
  const distribution = metadataString(asset.metadata, "profit_distribution") || "monthly";
  const months = distribution === "quarterly" ? 3 : distribution === "yearly" ? 12 : distribution === "maturity" ? 0 : 1;
  if (!months || (asset.category !== "DEPOSIT" && asset.category !== "SANCHAYAPATRA")) {
    return null;
  }
  const amount = Number(asset.value);
  const rate = Number(asset.metadata.interest_rate || (asset.category === "SANCHAYAPATRA" ? 11.52 : 9));
  if (!amount || !rate) {
    return null;
  }
  return formatWealthCurrency(Math.round((amount * rate * months) / 1200));
}

function payoutLabel(asset: CalendarAsset) {
  const distribution = metadataString(asset.metadata, "profit_distribution") || "monthly";
  if (distribution === "quarterly") {
    return "Quarterly";
  }
  if (distribution === "yearly") {
    return "Yearly";
  }
  return "Monthly";
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-BD", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
