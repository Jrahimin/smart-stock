import { MetricCard } from "@/components/ui/metric-card";
import type { MarketDashboardModel } from "@/features/market-dashboard/types/market-dashboard-types";

type HeroMarketIntelligenceProps = {
  model: MarketDashboardModel;
};

export function HeroMarketIntelligence({ model }: HeroMarketIntelligenceProps) {
  return (
    <section className="hero-intelligence">
      <div className="hero-copy">
        <p className="eyebrow">Market Intelligence</p>
        <h1>{model.marketMood} operating picture</h1>
        <span>Latest session: {model.latestTradeDate}</span>
      </div>
      <div className="hero-metrics">
        {model.heroMetrics.map((metric) => (
          <MetricCard
            helper={metric.helper}
            key={metric.label}
            label={metric.label}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </div>
    </section>
  );
}
