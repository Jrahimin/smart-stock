import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
    <section className="wealth-section wealth-scenario-launcher-section" id="wealth-decisions">
      <div className="wealth-section-heading">
        <h2>{language.scenarios.title}</h2>
        <p className="wealth-muted-copy">{language.scenarios.description}</p>
      </div>
      <div className="wealth-scenario-grid">
        {scenarios.map((scenario) => {
          const item = language.scenarios.items[scenario.id];

          return (
            <Link className={`wealth-scenario-card wealth-scenario-card-${scenario.cue}`} href={scenario.href} key={scenario.id}>
              <div className="wealth-scenario-card-header">
                <Image
                  alt=""
                  className="wealth-decision-illustration"
                  height={512}
                  priority={scenario.id === "tax-planning"}
                  src={DECISION_IMAGE_BY_SCENARIO[scenario.id]}
                  width={512}
                />
              </div>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              <ArrowRight aria-hidden="true" className="wealth-scenario-arrow" size={22} strokeWidth={1.8} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const DECISION_IMAGE_BY_SCENARIO: Record<WealthScenarioLauncher["id"], string> = {
  "tax-planning": "/images/wealth/decision-icons/tax-3d.png",
  "extra-savings": "/images/wealth/decision-icons/fdr-3d.png",
  "passive-income": "/images/wealth/decision-icons/sanchayapatra-3d.png",
  "retire-earlier": "/images/wealth/decision-icons/dps-3d.png",
  loan: "/images/wealth/decision-icons/compare-3d.png",
  zakat: "/images/wealth/decision-icons/zakat-3d.png",
  compare: "/images/wealth/decision-icons/compare-3d.png",
  inflation: "/images/wealth/decision-icons/tax-3d.png",
};
