import Link from "next/link";

import type { WealthScenarioLauncher } from "@/features/wealth/types/wealth-types";
import { getWealthLandingLanguage } from "@/features/wealth/wealth-language";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/locale/app-locale";

type ScenarioLauncherProps = {
  scenarios: WealthScenarioLauncher[];
  locale?: AppLocale;
};

export function ScenarioLauncher({ scenarios, locale = DEFAULT_LOCALE }: ScenarioLauncherProps) {
  const language = getWealthLandingLanguage(locale);

  return (
    <section className="wealth-section wealth-scenario-launcher-section">
      <div className="wealth-section-heading">
        <p className="eyebrow">{language.scenarios.eyebrow}</p>
        <h2>{language.scenarios.title}</h2>
        <p className="wealth-muted-copy">{language.scenarios.description}</p>
      </div>
      <div className="wealth-scenario-grid">
        {scenarios.map((scenario) => {
          const item = language.scenarios.items[scenario.id];

          return (
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
                    {item.cue}
                  </span>
                </div>
              </div>
              <div>
                <p className="eyebrow">{item.eyebrow}</p>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </Link>
          );
        })}
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
