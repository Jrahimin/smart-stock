import Link from "next/link";
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthNextStepsProps = {
  steps: Array<{ label: string; href: string }>;
  onSaveScenario?: () => void;
  locale?: AppLocale;
};

export function WealthNextSteps({ steps, onSaveScenario, locale }: WealthNextStepsProps) {
  const copy = getWealthToolsLanguage(locale).common;
  const journeySteps = [
    ...steps,
    { label: copy.compareAnother, href: "/wealth" },
    { label: copy.addToSnapshot, href: "/wealth/snapshot" },
  ].filter((step, index, allSteps) => allSteps.findIndex((item) => item.label === step.label) === index);

  return (
    <section className="wealth-next-steps">
      <div className="wealth-section-heading">
        <p className="eyebrow">{copy.nextEyebrow}</p>
        <h2>{copy.nextTitle}</h2>
        <p className="wealth-muted-copy">{copy.nextDescription}</p>
      </div>
      <div className="wealth-chip-row">
        {journeySteps.map((step) => (
          <Link className="wealth-chip" href={step.href} key={`${step.href}-${step.label}`}>
            {step.label}
          </Link>
        ))}
        {onSaveScenario ? (
          <button className="wealth-chip wealth-chip-button" onClick={onSaveScenario} type="button">
            {copy.saveScenario}
          </button>
        ) : null}
      </div>
    </section>
  );
}
