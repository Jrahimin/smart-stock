import type { ReactNode } from "react";

type StockResearchSectionProps = {
  id: string;
  title?: string;
  children: ReactNode;
  className?: string;
  hidden?: boolean;
  showHeader?: boolean;
  divided?: boolean;
};

export function StockResearchSection({
  id,
  title,
  children,
  className,
  hidden = false,
  showHeader = false,
  divided = false,
}: StockResearchSectionProps) {
  if (hidden) {
    return null;
  }

  const headingId = `${id}-heading`;
  const sectionClassName = [
    "stock-research-section",
    divided ? "stock-research-section-divided" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section aria-labelledby={showHeader && title ? headingId : undefined} className={sectionClassName}>
      <span className="stock-section-scroll-anchor" id={id} />
      {showHeader && title ? (
        <header className="stock-research-section-heading stock-research-section-heading-compact">
          <h2 id={headingId}>{title}</h2>
        </header>
      ) : null}
      <div className="stock-research-section-body">{children}</div>
    </section>
  );
}
