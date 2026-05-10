import type { ReactNode } from "react";

type DataTableShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function DataTableShell({ title, description, children }: DataTableShellProps) {
  return (
    <section className="data-table-shell">
      <div className="section-heading">
        <p className="eyebrow">Table Workspace</p>
        <h2>{title}</h2>
        {description ? <span>{description}</span> : null}
      </div>
      {children}
    </section>
  );
}
