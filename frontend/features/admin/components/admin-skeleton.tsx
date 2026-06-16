export function AdminKpiSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="admin-kpi-grid">
      {Array.from({ length: count }).map((_, index) => (
        <div className="admin-skeleton admin-skeleton-kpi" key={index} />
      ))}
    </div>
  );
}

export function AdminTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="admin-data-table-shell">
      <div className="admin-skeleton admin-skeleton-table-head" />
      {Array.from({ length: rows }).map((_, index) => (
        <div className="admin-skeleton admin-skeleton-table-row" key={index} />
      ))}
    </div>
  );
}
