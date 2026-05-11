"use client";

export function MarketActivityLoader() {
  return (
    <div aria-label="Loading market data" className="market-activity-loader" role="status">
      <div className="market-pulse-line" aria-hidden="true">
        <i />
        <span />
        <b />
      </div>
    </div>
  );
}
