import { SignalBadge } from "@/components/ui/signal-badge";
import type { SignalType } from "@/lib/api/backend-api-types";
import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";

type StockWorkspaceHeaderProps = {
  model: StockWorkspaceModel;
};

export function StockWorkspaceHeader({ model }: StockWorkspaceHeaderProps) {
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
          <span>Signal</span>
          <SignalBadge signal={model.header.signal as SignalType} />
          <small>{model.header.confidence}</small>
        </div>
      </div>
    </section>
  );
}
