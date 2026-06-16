import type { ReactNode } from "react";

type AdminDataTableProps = {
  children: ReactNode;
  className?: string;
};

export function AdminDataTable({ children, className = "" }: AdminDataTableProps) {
  return (
    <div className={`admin-data-table-shell ${className}`.trim()}>
      <div className="admin-data-table" role="table">
        {children}
      </div>
    </div>
  );
}

export function AdminDataTableHead({ children }: { children: ReactNode }) {
  return <div className="admin-data-table-head">{children}</div>;
}

export function AdminDataTableBody({ children }: { children: ReactNode }) {
  return <div className="admin-data-table-body">{children}</div>;
}

export function AdminDataTableRow({
  children,
  onClick,
  selected,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const rowClass = [
    "admin-data-table-row",
    onClick ? "admin-data-table-row-clickable" : "",
    selected ? "admin-data-table-row-selected" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button className={rowClass} onClick={onClick} type="button">
        {children}
      </button>
    );
  }

  return <div className={rowClass}>{children}</div>;
}

export function AdminDataTableCell({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <div className={`admin-data-table-cell admin-data-table-cell-${align} ${className}`.trim()} role="cell">
      {children}
    </div>
  );
}

export function AdminEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="admin-empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function AdminSection({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`admin-section workspace-card ${className}`.trim()}>
      <div className="admin-section-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="admin-section-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
