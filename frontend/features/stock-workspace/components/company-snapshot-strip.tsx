import Link from "next/link";

import type { CompanySnapshotCell } from "@/features/stock-workspace/view-models/company-snapshot-view-model";

type CompanySnapshotStripProps = {
  cells: CompanySnapshotCell[];
};

export function CompanySnapshotStrip({ cells }: CompanySnapshotStripProps) {
  return (
    <section aria-label="Company snapshot" className="company-snapshot-strip">
      {cells.map((cell) => (
        <div className="company-snapshot-item" key={cell.key}>
          <span>{cell.label}</span>
          {cell.href ? (
            <Link className="company-snapshot-value-link" href={cell.href}>
              {cell.value}
            </Link>
          ) : (
            <strong>{cell.value}</strong>
          )}
        </div>
      ))}
    </section>
  );
}
