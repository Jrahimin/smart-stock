import type { AssetAllocationSlice } from "@/features/wealth/lib/snapshot-dashboard-helpers";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";

type SnapshotAssetAllocationProps = {
  slices: AssetAllocationSlice[];
};

export function SnapshotAssetAllocation({ slices }: SnapshotAssetAllocationProps) {
  const visibleSlices = slices.filter((slice) => slice.percent > 0);

  if (!visibleSlices.length) {
    return (
      <section className="wealth-panel wealth-snapshot-allocation-panel">
        <h2>Asset Allocation</h2>
        <p className="wealth-muted-copy">Add assets to see how your money is distributed.</p>
      </section>
    );
  }

  let cursor = 0;
  const gradientStops = visibleSlices
    .map((slice) => {
      const start = cursor;
      cursor += slice.percent;
      return `${slice.color} ${start}% ${cursor}%`;
    })
    .join(", ");

  return (
    <section className="wealth-panel wealth-snapshot-allocation-panel">
      <h2>Asset Allocation</h2>
      <div className="wealth-snapshot-allocation-panel-body">
        <div
          aria-label={visibleSlices.map((slice) => `${slice.label} ${slice.percent}%`).join(", ")}
          className="wealth-snapshot-allocation-donut"
          role="img"
          style={{ background: `conic-gradient(${gradientStops})` }}
        >
          <div className="wealth-snapshot-allocation-donut-center">
            <span>Assets</span>
            <strong>{visibleSlices.length}</strong>
          </div>
        </div>
        <ul className="wealth-snapshot-allocation-panel-list">
          {visibleSlices.map((slice) => (
            <li className="wealth-snapshot-allocation-panel-item" key={slice.key}>
              <div className="wealth-snapshot-allocation-panel-item-head">
                <span className="wealth-snapshot-allocation-panel-label">
                  <i style={{ background: slice.color }} />
                  {slice.label}
                </span>
                <strong>{slice.percent}%</strong>
              </div>
              <div aria-hidden="true" className="wealth-snapshot-allocation-panel-track">
                <span style={{ background: slice.color, width: `${slice.percent}%` }} />
              </div>
              <small>{formatWealthCurrency(slice.value)}</small>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
