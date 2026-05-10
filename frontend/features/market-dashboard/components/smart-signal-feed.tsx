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
            <Link className="signal-feed-item" href={signal.href} key={`${signal.symbol}-${signal.signal}`}>
              <div>
                <strong>{signal.symbol}</strong>
                <span>{signal.confidence} confidence</span>
              </div>
              <SignalBadge signal={signal.signal} />
              <p>{signal.reason}</p>
              <small>
                Risk: {signal.risk} / {signal.generatedAt}
              </small>
            </Link>
          ))
        ) : (
          <div className="empty-state">No actionable deterministic signals yet for the loaded market universe.</div>
        )}
      </div>
    </section>
  );
}
