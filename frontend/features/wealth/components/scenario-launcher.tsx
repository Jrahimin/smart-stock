import Link from "next/link";

import type { WealthScenarioLauncher } from "@/features/wealth/types/wealth-types";

type ScenarioLauncherProps = {
  scenarios: WealthScenarioLauncher[];
};

export function ScenarioLauncher({ scenarios }: ScenarioLauncherProps) {
  return (
    <section className="wealth-section wealth-scenario-launcher-section">
      <div className="wealth-section-heading">
        <p className="eyebrow">Start with your question</p>
        <h2>What are you trying to understand?</h2>
        <p className="wealth-muted-copy">Choose the money story that feels closest to today&apos;s decision.</p>
      </div>
      <div className="wealth-scenario-grid">
        {scenarios.map((scenario) => (
          <Link className={`wealth-scenario-card wealth-scenario-card-${scenario.cue}`} href={scenario.href} key={scenario.id}>
            <div className="wealth-scenario-card-header">
              <span className="wealth-scenario-icon-inline" aria-hidden="true">
                {scenarioIcon(scenario.cue)}
              </span>
              <div className="wealth-scenario-card-badges">
                {scenario.productLabel ? (
                  <span className="wealth-scenario-product">{scenario.productLabel}</span>
                ) : null}
                <span className="wealth-scenario-cue" aria-hidden="true">
                  {scenario.cue}
                </span>
              </div>
            </div>
            <div>
              <p className="eyebrow">{scenario.eyebrow}</p>
              <h3>{scenario.title}</h3>
              <p>{scenario.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function scenarioIcon(cue: string) {
  const icons: Record<string, string> = {
    steady: "🏦",
    income: "🇧🇩",
    habit: "📅",
    loan: "💳",
    care: "🤲",
    choice: "⇄",
    real: "📉",
  };
  return icons[cue] ?? "✦";
}
