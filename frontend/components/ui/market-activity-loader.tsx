"use client";

type MarketActivityLoaderProps = {
  label?: string;
};

export function MarketActivityLoader({ label }: MarketActivityLoaderProps) {
  const ariaLabel = label ?? "Loading market data";

  return (
    <div aria-label={ariaLabel} className="market-activity-loader" role="status">
      <div className="market-activity-loader-inner">
        <div className="market-pulse-line" aria-hidden="true">
          <i />
          <span />
          <b />
        </div>
        {label ? <p className="market-activity-loader-label">{label}</p> : null}
      </div>
    </div>
  );
}
