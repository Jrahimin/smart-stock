import type { SnapshotCompleteness } from "@/features/wealth/lib/snapshot-dashboard-helpers";
import { getWealthSnapshotLanguage } from "@/features/wealth/wealth-snapshot-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type SnapshotCompletenessCardProps = {
  completeness: SnapshotCompleteness;
  locale: AppLocale;
};

export function SnapshotCompletenessCard({ completeness, locale }: SnapshotCompletenessCardProps) {
  const copy = getWealthSnapshotLanguage(locale);
  const completeCount = completeness.items.filter((item) => item.complete).length;
  const totalCount = completeness.items.length;

  return (
    <section className="metric-card metric-card-neutral wealth-snapshot-completeness-card">
      <div className="wealth-snapshot-completeness-head">
        <p className="eyebrow">{copy.completeness.eyebrow}</p>
        <div className="wealth-snapshot-completeness-info">
          <button
            aria-label={copy.completeness.ariaLabel(completeCount, totalCount)}
            className="wealth-snapshot-completeness-info-trigger"
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 14 14" width="14">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 6.2V9.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
              <circle cx="7" cy="4.4" fill="currentColor" r="0.7" />
            </svg>
          </button>
          <div className="wealth-snapshot-completeness-popover" role="tooltip">
            <p className="wealth-snapshot-completeness-popover-summary">
              {copy.completeness.summary(completeCount, totalCount)}
            </p>
            <ul className="wealth-snapshot-completeness-list">
              {completeness.items.map((item) => (
                <li className={item.complete ? "wealth-snapshot-completeness-done" : ""} key={item.id}>
                  <span aria-hidden="true">{item.complete ? "✓" : "○"}</span>
                  {copy.completeness.items[item.id] ?? item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <strong>{completeness.percent}%</strong>
    </section>
  );
}
