import type { AssetAllocationSlice } from "@/features/wealth/lib/snapshot-dashboard-helpers";
import {
  getWealthSnapshotLanguage,
  localizeSnapshotAllocationLabel,
} from "@/features/wealth/wealth-snapshot-language";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import type { AppLocale } from "@/lib/locale/app-locale";

type SnapshotAssetAllocationProps = {
  slices: AssetAllocationSlice[];
  locale: AppLocale;
};

export function SnapshotAssetAllocation({ slices, locale }: SnapshotAssetAllocationProps) {
  const copy = getWealthSnapshotLanguage(locale);
  const visibleSlices = slices.filter((slice) => slice.percent > 0);

  if (!visibleSlices.length) {
    return (
      <section className="wealth-panel wealth-snapshot-allocation-panel">
        <h2>{copy.allocation.title}</h2>
        <p className="wealth-muted-copy">{copy.allocation.empty}</p>
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
      <h2>{copy.allocation.title}</h2>
      <div className="wealth-snapshot-allocation-panel-body">
        <div
          aria-label={visibleSlices
            .map((slice) => `${localizeSnapshotAllocationLabel(slice.key, locale)} ${slice.percent}%`)
            .join(", ")}
          className="wealth-snapshot-allocation-donut"
          role="img"
          style={{ background: `conic-gradient(${gradientStops})` }}
        >
          <div className="wealth-snapshot-allocation-donut-center">
            <span>{copy.allocation.centerLabel}</span>
            <strong>{visibleSlices.length}</strong>
          </div>
        </div>
        <ul className="wealth-snapshot-allocation-panel-list">
          {visibleSlices.map((slice) => (
            <li className="wealth-snapshot-allocation-panel-item" key={slice.key}>
              <div className="wealth-snapshot-allocation-panel-item-head">
                <span className="wealth-snapshot-allocation-panel-label">
                  <i style={{ background: slice.color }} />
                  {localizeSnapshotAllocationLabel(slice.key, locale)}
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
