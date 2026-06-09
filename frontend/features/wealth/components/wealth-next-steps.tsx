import Link from "next/link";

type WealthNextStepsProps = {
  steps: Array<{ label: string; href: string }>;
  onSaveScenario?: () => void;
};

export function WealthNextSteps({ steps, onSaveScenario }: WealthNextStepsProps) {
  const journeySteps = [
    ...steps,
    { label: "Compare another option", href: "/wealth" },
    { label: "Add to Money Snapshot", href: "/wealth/snapshot" },
  ].filter((step, index, allSteps) => allSteps.findIndex((item) => item.label === step.label) === index);

  return (
    <section className="wealth-next-steps">
      <div className="wealth-section-heading">
        <p className="eyebrow">This is not the end</p>
        <h2>Keep exploring your financial future</h2>
        <p className="wealth-muted-copy">A result is a starting point: compare it, save it, or add it to your bigger picture.</p>
      </div>
      <div className="wealth-chip-row">
        {journeySteps.map((step) => (
          <Link className="wealth-chip" href={step.href} key={`${step.href}-${step.label}`}>
            {step.label}
          </Link>
        ))}
        {onSaveScenario ? (
          <button className="wealth-chip wealth-chip-button" onClick={onSaveScenario} type="button">
            Save scenario
          </button>
        ) : null}
      </div>
    </section>
  );
}
