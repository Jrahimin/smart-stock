import Link from "next/link";
import { memo } from "react";

import { SignalBadge } from "@/components/ui/signal-badge";
import { DecisionPublicationLabel, type DecisionPublication } from "@/components/ui/market-publication-label";
import type { DashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import type { SignalFeedItemModel } from "@/features/market-dashboard/types/market-dashboard-types";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/locale/app-locale";

type SmartSignalFeedProps = {
  signals: SignalFeedItemModel[];
  copy: DashboardLanguage["signals"];
  decision?: DecisionPublication;
  locale?: AppLocale;
};

export const SmartSignalFeed = memo(function SmartSignalFeed({ signals, copy, decision, locale = DEFAULT_LOCALE }: SmartSignalFeedProps) {
  return (
    <section className="workspace-card" data-guide="smart-signals">
      <div className="section-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <DecisionPublicationLabel decision={decision} locale={locale} />
      </div>
      <div className="signal-feed">
        {signals.length ? (
          signals.map((signal) => (
            <Link
              className={`signal-feed-item signal-feed-item-${signal.signal.toLowerCase()} priority-${signal.priority}`}
              href={signal.href}
              key={`${signal.symbol}-${signal.signal}`}
            >
              <div className="signal-feed-topline">
                <div>
                  <strong>{signal.symbol}</strong>
                  <span>{signal.generatedAt}</span>
                </div>
                <SignalBadge signal={signal.signal} />
              </div>
              <p>{signal.reason}</p>
              <div className="signal-visual-row">
                <div className="signal-confidence-meter">{copy.confidence(signal.confidence)}</div>
                <span className={`risk-pill risk-pill-${signal.risk.toLowerCase()}`}>{copy.risk(signal.risk)}</span>
              </div>
              <small>
                {copy.confidence(signal.confidence)} / {signal.supportingContext[0] ?? copy.awaitingContext}
              </small>
            </Link>
          ))
        ) : (
          <div className="empty-state">{copy.empty}</div>
        )}
      </div>
    </section>
  );
});
