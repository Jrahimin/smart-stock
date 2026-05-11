import Link from "next/link";

import { SignalBadge } from "@/components/ui/signal-badge";
import type { SignalFeedItemModel } from "@/features/market-dashboard/types/market-dashboard-types";

type SmartSignalFeedProps = {
  signals: SignalFeedItemModel[];
};

export function SmartSignalFeed({ signals }: SmartSignalFeedProps) {
  return (
    <section className="workspace-card">
      <div className="section-heading">
        <p className="eyebrow">Smart Signals</p>
        <h2>Explanation-first feed</h2>
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
                <div className="signal-confidence-meter" aria-label={`${signal.confidence} confidence`}>
                  <span style={{ width: `${signal.confidenceValue}%` }} />
                </div>
                <span className={`risk-pill risk-pill-${signal.risk.toLowerCase()}`}>{signal.risk} risk</span>
              </div>
              <small>{signal.confidence} confidence / {signal.supportingContext[0] ?? "Awaiting stronger context"}</small>
            </Link>
          ))
        ) : (
          <div className="empty-state">No actionable deterministic signals yet for the loaded market universe.</div>
        )}
      </div>
    </section>
  );
}
