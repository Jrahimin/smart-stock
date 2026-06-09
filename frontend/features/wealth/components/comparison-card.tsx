import Link from "next/link";

type ComparisonCardProps = {
  slug: string;
  title: string;
  description: string;
  cue: string;
  accent: string;
};

export function ComparisonCard({ slug, title, description, cue, accent }: ComparisonCardProps) {
  return (
    <Link className={`wealth-comparison-card wealth-comparison-card-${accent}`} href={`/wealth/compare/${slug}`}>
      <div className="wealth-comparison-card-header">
        <span className="wealth-comparison-icon-inline" aria-hidden="true">
          {comparisonIcon(accent)}
        </span>
        <p className="wealth-recommendation-cue">{cue}</p>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="wealth-card-link">Open the story</span>
    </Link>
  );
}

function comparisonIcon(accent: string) {
  const icons: Record<string, string> = {
    steady: "🐷",
    growth: "📈",
    choice: "⚖",
    debt: "💳",
    inflation: "📉",
  };
  return icons[accent] ?? "⇄";
}
