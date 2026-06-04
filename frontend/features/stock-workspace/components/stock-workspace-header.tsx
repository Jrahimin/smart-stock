import { SignalBadge } from "@/components/ui/signal-badge";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import type { SignalType, TraderRecommendation } from "@/lib/api/backend-api-types";

type StockWorkspaceHeaderProps = {
  model: StockWorkspaceModel;
  decision?: StockDecisionViewModel;
};

export function StockWorkspaceHeader({ model, decision }: StockWorkspaceHeaderProps) {
  const action: SignalType | TraderRecommendation = decision?.available
    ? (decision.recommendation as TraderRecommendation)
    : (model.header.signal as SignalType);
  const confidence = decision?.available ? decision.confidenceLabel : model.header.confidence;
  const actionLabel = decision?.available ? "Action" : "Signal";

  return (
    <section className="stock-workspace-header">
      <div>
        <p className="eyebrow">
          {model.header.exchange} / {model.header.sector} / Category {model.header.category}
        </p>
        <h1>{model.header.symbol}</h1>
        <span>{model.header.name}</span>
      </div>
      <div className="stock-header-metrics">
        <div>
          <span>Last</span>
          <strong>{model.header.latestPrice}</strong>
        </div>
        <div>
          <span>Change</span>
          <strong>{model.header.changePercent}</strong>
        </div>
        <div>
          <span>Market Cap</span>
          <strong>{model.header.marketCap}</strong>
        </div>
        <div>
          <span>{actionLabel}</span>
          <SignalBadge signal={action} />
          <small>{confidence}</small>
        </div>
      </div>
    </section>
  );
}
