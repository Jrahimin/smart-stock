"use client";

import { ChevronDown, Sparkles, TrendingUp } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";

import { WEALTH_DEFAULT_RATES, WEALTH_TOOL_CONFIG } from "@/features/wealth/catalog/wealth-catalog";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { useWealthTool } from "@/features/wealth/hooks/use-wealth-tool";
import {
  getInvestmentPlannerLanguage,
  type InvestmentPlannerLanguage,
} from "@/features/wealth/investment-planner-language";
import {
  buildCompoundIncomePotential,
  buildHigherMonthlyInvestmentInputs,
  buildInvestmentEvaluationStory,
  buildInvestmentPlannerStory,
  buildLowerIncomeInputs,
  INVESTMENT_SCENARIO_MONTHLY_INCREASE,
  resolveInvestmentYears,
  toInvestmentNumber,
} from "@/features/wealth/view-models/investment-planner-view-model";
import { formatWealthCurrency, formatWealthNumber } from "@/features/wealth/view-models/wealth-view-model";
import type { AppLocale } from "@/lib/locale/app-locale";

import styles from "./investment-planner-workspace.module.css";

type InvestmentPlannerWorkspaceProps = { locale: AppLocale };
type InvestmentMode = "grow" | "evaluate";
type IncomeQuestion = "capital" | "target";

const INVESTMENT_MODES: InvestmentMode[] = ["grow", "evaluate"];

export function InvestmentPlannerWorkspace({ locale }: InvestmentPlannerWorkspaceProps) {
  const copy = getInvestmentPlannerLanguage(locale);
  const config = WEALTH_TOOL_CONFIG["compound-growth"];
  const defaultInputs = useMemo(
    () => ({
      ...Object.fromEntries(config.fields.map((field) => [field.key, field.defaultValue ?? ""])),
      withdrawal_rate: "4",
      monthly_income_target: "",
    }),
    [config.fields],
  );
  const [mode, setMode] = useState<InvestmentMode>("grow");
  const [inputs, setInputs] = useState<Record<string, string>>(defaultInputs);
  const [inflationRate, setInflationRate] = useState<string>(WEALTH_DEFAULT_RATES.inflation);
  const assumptions = useMemo(
    () => ({ country_code: "BD", inflation_rate: inflationRate === "" ? undefined : Number(inflationRate) }),
    [inflationRate],
  );
  const scenarioInputs = useMemo(() => buildHigherMonthlyInvestmentInputs(inputs), [inputs]);
  const calculation = useWealthTool("compound-growth", inputs, assumptions);
  const scenarioCalculation = useWealthTool("compound-growth", scenarioInputs, assumptions);
  const story = calculation.result ? buildInvestmentPlannerStory(inputs, calculation.result) : null;
  const scenarioStory = scenarioCalculation.result
    ? buildInvestmentPlannerStory(scenarioInputs, scenarioCalculation.result)
    : null;

  function updateInput(key: string, value: string) {
    setInputs((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className={styles.workspace}>
      <WealthSubNav locale={locale} />
      <header className={styles.intro}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>
      <InvestmentModeSelector activeMode={mode} copy={copy} onModeChange={setMode} />

      {mode === "grow" ? (
        <div aria-labelledby="investment-mode-grow" className={styles.modeContent} id="investment-grow-panel" role="tabpanel">
          <ModeContext copy={copy} description={copy.growDescription} title={copy.growTitle} />
          <div className={styles.plannerGrid}>
            <GrowAssumptions
              copy={copy}
              inflationRate={inflationRate}
              inputs={inputs}
              onInflationRateChange={setInflationRate}
              onInputChange={updateInput}
            />
            <div className={styles.outcomeColumn}>
              <GrowOutcome
                copy={copy}
                inflationRate={inflationRate}
                isUpdating={calculation.isLoading || scenarioCalculation.isLoading}
                story={story}
                years={resolveInvestmentYears(inputs)}
              />
              <GrowScenario copy={copy} inputs={scenarioInputs} scenarioStory={scenarioStory} story={story} />
              {calculation.result ? <IncomePotential copy={copy} inputs={inputs} onIncomeTargetChange={(value) => updateInput("monthly_income_target", value)} result={calculation.result} /> : null}
            </div>
          </div>
          {calculation.isError || scenarioCalculation.isError ? <ErrorMessage copy={copy} /> : null}
        </div>
      ) : (
        <InvestmentEvaluationMode copy={copy} />
      )}
    </section>
  );
}

function InvestmentModeSelector({
  activeMode,
  copy,
  onModeChange,
}: {
  activeMode: InvestmentMode;
  copy: InvestmentPlannerLanguage;
  onModeChange: (mode: InvestmentMode) => void;
}) {
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, mode: InvestmentMode) {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const currentIndex = INVESTMENT_MODES.indexOf(mode);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + 2) % 2;
    const nextMode = INVESTMENT_MODES[nextIndex];
    onModeChange(nextMode);
    document.getElementById(`investment-mode-${nextMode}`)?.focus();
  }

  return (
    <div aria-label={copy.modeLegend} className={styles.modeSelector} role="tablist">
      {INVESTMENT_MODES.map((mode) => {
        const modeCopy = copy.modes[mode];
        const isActive = mode === activeMode;
        return (
          <button
            aria-controls={`investment-${mode}-panel`}
            aria-selected={isActive}
            className={`${styles.modeOption} ${isActive ? styles.modeOptionActive : ""}`}
            id={`investment-mode-${mode}`}
            key={mode}
            onClick={() => onModeChange(mode)}
            onKeyDown={(event) => moveFocus(event, mode)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            <span aria-hidden="true" className={styles.radioMark} />
            <span className={styles.modeCopy}>
              <strong>{modeCopy.label}</strong>
              <span>{modeCopy.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ModeContext({ copy, description, title }: { copy: InvestmentPlannerLanguage; description: string; title: string }) {
  return (
    <div className={styles.context}>
      <TrendingUp aria-hidden="true" size={18} />
      <div><h2>{title}</h2><p>{description}</p></div>
    </div>
  );
}

function GrowAssumptions({
  copy, inflationRate, inputs, onInflationRateChange, onInputChange,
}: {
  copy: InvestmentPlannerLanguage;
  inflationRate: string;
  inputs: Record<string, string>;
  onInflationRateChange: (value: string) => void;
  onInputChange: (key: string, value: string) => void;
}) {
  return (
    <section aria-labelledby="investment-plan-heading" className={`${styles.panel} ${styles.compactForm}`}>
      <h2 id="investment-plan-heading">{copy.planTitle}</h2>
      <div className={styles.fieldList}>
        <PlannerNumberField label={copy.fields.principal} min="0" onChange={(value) => onInputChange("principal", value)} prefix="BDT" value={inputs.principal ?? ""} />
        <PlannerNumberField label={copy.fields.monthlyContribution} min="0" onChange={(value) => onInputChange("monthly_contribution", value)} prefix="BDT" value={inputs.monthly_contribution ?? ""} />
        <PlannerNumberField label={copy.fields.annualRate} min="0" onChange={(value) => onInputChange("annual_rate", value)} step="0.1" suffix={copy.units.percent} value={inputs.annual_rate ?? ""} />
        <PlannerNumberField label={copy.fields.years} min="1" onChange={(value) => onInputChange("tenure_value", value)} step="1" suffix={copy.units.years} value={inputs.tenure_value ?? ""} />
      </div>
      <details className={styles.advanced}>
        <summary><span>{copy.advancedTitle}<small>{copy.advancedOptional}</small></span><ChevronDown aria-hidden="true" size={16} /></summary>
        <div className={styles.advancedContent}>
          <div className={styles.fieldList}>
            <PlannerNumberField label={copy.fields.inflationRate} min="0" onChange={onInflationRateChange} step="0.1" suffix={copy.units.percent} value={inflationRate} />
            <PlannerNumberField label={copy.fields.withdrawalRate} min="0.1" onChange={(value) => onInputChange("withdrawal_rate", value)} step="0.1" suffix={copy.units.percent} value={inputs.withdrawal_rate ?? "4"} />
          </div>
        </div>
      </details>
      <p className={styles.note}><Sparkles aria-hidden="true" size={15} />{copy.formInsight}</p>
    </section>
  );
}

function GrowOutcome({ copy, inflationRate, isUpdating, story, years }: {
  copy: InvestmentPlannerLanguage; inflationRate: string; isUpdating: boolean; story: ReturnType<typeof buildInvestmentPlannerStory> | null; years: number;
}) {
  const contributionPercent = story ? Math.round(story.contributionPercent) : 0;
  const growthPercent = story ? Math.round(story.growthPercent) : 0;
  const formattedGrowth = formatWealthCurrency(story?.estimatedGrowth ?? null);
  return (
    <section aria-labelledby="investment-outcome-heading" className={styles.panel}>
      <div className={styles.panelHeading}><h2 id="investment-outcome-heading">{copy.outcomeTitle}</h2>{isUpdating ? <span className={styles.updating}>{copy.updating}</span> : null}</div>
      <div className={styles.headlineMetrics}>
        <article><span>{copy.futureValue(years)}</span><strong className={styles.primaryValue}>{formatWealthCurrency(story?.futureValue ?? null)}</strong></article>
        <article><span>{copy.todayValue}</span><strong className={styles.realValue}>{formatWealthCurrency(story?.todayValue ?? null)}</strong><small>{copy.todayValueHelper(formatWealthNumber(inflationRate))}</small></article>
      </div>
      <div className={styles.splitSection}>
        <h3>{copy.splitTitle}</h3>
        <div aria-label={`${copy.contribution}: ${contributionPercent}%; ${copy.growth}: ${growthPercent}%`} className={styles.splitBar} role="img">
          <span style={{ width: `${contributionPercent}%` }}>{contributionPercent}%</span><span style={{ width: `${growthPercent}%` }}>{growthPercent}%</span>
        </div>
        <div className={styles.splitLegend}><p><span>{copy.totalContribution}</span><strong>{formatWealthCurrency(story?.totalContribution ?? null)}</strong></p><p><span>{copy.estimatedGrowth}</span><strong>{formattedGrowth}</strong></p></div>
        {story ? <p className={styles.insight}><Sparkles aria-hidden="true" size={17} />{copy.growthInsight(formattedGrowth, formatWealthNumber(growthPercent), growthPercent >= contributionPercent)}</p> : null}
      </div>
    </section>
  );
}

function GrowScenario({ copy, inputs, scenarioStory, story }: {
  copy: InvestmentPlannerLanguage; inputs: Record<string, string>; scenarioStory: ReturnType<typeof buildInvestmentPlannerStory> | null; story: ReturnType<typeof buildInvestmentPlannerStory> | null;
}) {
  const additionalGain = scenarioStory && story ? scenarioStory.futureValue - story.futureValue : null;
  return (
    <section aria-labelledby="investment-scenario-heading" className={styles.scenario}>
      <div className={styles.scenarioLead}><span className={styles.scenarioIcon}><TrendingUp aria-hidden="true" size={19} /></span><div><h2 id="investment-scenario-heading">{copy.scenarioTitle}</h2><p>{copy.scenarioDescription(formatWealthCurrency(INVESTMENT_SCENARIO_MONTHLY_INCREASE))}</p></div></div>
      <dl className={styles.scenarioMetrics}>
        <div><dt>{copy.newMonthlyContribution}</dt><dd>{formatWealthCurrency(toInvestmentNumber(inputs.monthly_contribution))}</dd></div>
        <div><dt>{copy.newFutureValue}</dt><dd>{formatWealthCurrency(scenarioStory?.futureValue ?? null)}</dd></div>
        <div><dt>{copy.additionalGain}</dt><dd className={styles.gain}>{formatWealthCurrency(additionalGain)}</dd></div>
      </dl>
    </section>
  );
}

function IncomePotential({ copy, inputs, onIncomeTargetChange, result }: { copy: InvestmentPlannerLanguage; inputs: Record<string, string>; onIncomeTargetChange: (value: string) => void; result: Parameters<typeof buildCompoundIncomePotential>[0] }) {
  const [question, setQuestion] = useState<IncomeQuestion>("capital");
  const potential = buildCompoundIncomePotential(result);

  return (
    <details className={`${styles.incomePotential} ${styles.panel}`}>
      <summary><span><strong>{copy.incomePotential.title}</strong><small>{copy.incomePotential.description}</small></span><ChevronDown aria-hidden="true" size={16} /></summary>
      <div className={styles.incomePotentialBody}>
        <fieldset className={styles.incomeQuestion}><legend>{copy.incomePotential.sourceLegend}</legend><div>
          <label><input checked={question === "capital"} name="income-question" onChange={() => setQuestion("capital")} type="radio" /><span>{copy.incomePotential.fromCapital}</span></label>
          <label><input checked={question === "target"} name="income-question" onChange={() => setQuestion("target")} type="radio" /><span>{copy.incomePotential.incomeTarget}</span></label>
        </div></fieldset>
        {question === "target" ? <PlannerNumberField label={copy.fields.monthlyIncomeTarget} min="0" onChange={onIncomeTargetChange} prefix="BDT" value={inputs.monthly_income_target ?? ""} /> : null}
        {question === "capital" ? (
          <div className={styles.incomeMetrics}>
            <Metric label={copy.incomePotential.monthlyIncome} value={formatWealthCurrency(potential.monthlyIncome)} />
            <Metric label={copy.incomePotential.annualIncome} value={formatWealthCurrency(potential.annualIncome)} />
            <Metric label={copy.incomePotential.monthlyIncomeTodayValue} value={formatWealthCurrency(potential.monthlyIncomeTodayValue)} />
            <Metric label={copy.incomePotential.capitalOutlook} value={copy.incomePotential.outlook[potential.capitalOutlook]} />
          </div>
        ) : (
          <div className={styles.incomeMetrics}>
            <Metric label={copy.incomePotential.requiredCapital} value={formatWealthCurrency(potential.requiredCapital)} />
            <Metric label={copy.incomePotential.capitalGap} value={formatWealthCurrency(potential.capitalGap)} />
            <Metric label={copy.incomePotential.additionalMonthlyInvestment} value={potential.additionalMonthlyInvestment == null ? copy.incomePotential.notNeeded : formatWealthCurrency(potential.additionalMonthlyInvestment)} />
          </div>
        )}
        <p className={styles.advancedHint}>{copy.incomePotential.assumptionNote}</p>
      </div>
    </details>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <p><span>{label}</span><strong>{value}</strong></p>; }

function InvestmentEvaluationMode({ copy }: { copy: InvestmentPlannerLanguage }) {
  const [inputs, setInputs] = useState<Record<string, string>>({
    initial_investment: "500000", additional_costs: "50000", monthly_income: "40000", monthly_expenses: "15000", investment_months: "60", exit_value: "", ownership_percentage: "100", tax_rate: "0", fees_rate: "0", income_growth_rate: "0", expense_growth_rate: "0",
  });
  const calculation = useWealthTool("investment-evaluation", inputs, { country_code: "BD" });
  const stressCalculation = useWealthTool("investment-evaluation", useMemo(() => buildLowerIncomeInputs(inputs), [inputs]), { country_code: "BD" });
  const story = calculation.result ? buildInvestmentEvaluationStory(calculation.result) : null;
  const stressStory = stressCalculation.result ? buildInvestmentEvaluationStory(stressCalculation.result) : null;
  const periodMonths = toInvestmentNumber(inputs.investment_months);
  const updateInput = (key: string, value: string) => setInputs((current) => ({ ...current, [key]: value }));
  const evaluation = copy.evaluation;
  return (
    <div aria-labelledby="investment-mode-evaluate" className={styles.modeContent} id="investment-evaluate-panel" role="tabpanel">
      <ModeContext copy={copy} description={evaluation.description} title={evaluation.title} />
      <div className={styles.plannerGrid}>
        <section aria-labelledby="evaluation-form-heading" className={`${styles.panel} ${styles.compactForm} ${styles.evaluationForm}`}><h2 id="evaluation-form-heading">{evaluation.planTitle}</h2>
          <div className={styles.fieldList}>
            <PlannerNumberField label={evaluation.fields.initialInvestment} min="0" onChange={(value) => updateInput("initial_investment", value)} prefix="BDT" value={inputs.initial_investment} />
            <PlannerNumberField label={evaluation.fields.additionalCosts} min="0" onChange={(value) => updateInput("additional_costs", value)} prefix="BDT" value={inputs.additional_costs} />
            <PlannerNumberField label={evaluation.fields.monthlyIncome} min="0" onChange={(value) => updateInput("monthly_income", value)} prefix="BDT" value={inputs.monthly_income} />
            <PlannerNumberField label={evaluation.fields.monthlyExpenses} min="0" onChange={(value) => updateInput("monthly_expenses", value)} prefix="BDT" value={inputs.monthly_expenses} />
            <PlannerNumberField label={evaluation.fields.investmentMonths} min="1" onChange={(value) => updateInput("investment_months", value)} step="1" suffix={evaluation.units.months} value={inputs.investment_months} />
            <PlannerNumberField label={evaluation.fields.exitValue} min="0" onChange={(value) => updateInput("exit_value", value)} prefix="BDT" value={inputs.exit_value} />
          </div>
          <details className={styles.advanced}><summary><span>{evaluation.advancedTitle}<small>{evaluation.advancedOptional}</small></span><ChevronDown aria-hidden="true" size={16} /></summary><div className={styles.advancedContent}><div className={styles.fieldList}>
            <PlannerNumberField label={evaluation.fields.ownershipPercentage} max="100" min="0" onChange={(value) => updateInput("ownership_percentage", value)} step="0.1" suffix={evaluation.units.percent} value={inputs.ownership_percentage} />
            <PlannerNumberField label={evaluation.fields.taxRate} max="100" min="0" onChange={(value) => updateInput("tax_rate", value)} step="0.1" suffix={evaluation.units.percent} value={inputs.tax_rate} />
            <PlannerNumberField label={evaluation.fields.feesRate} max="100" min="0" onChange={(value) => updateInput("fees_rate", value)} step="0.1" suffix={evaluation.units.percent} value={inputs.fees_rate} />
            <PlannerNumberField label={evaluation.fields.incomeGrowthRate} min="-100" onChange={(value) => updateInput("income_growth_rate", value)} step="0.1" suffix={evaluation.units.percent} value={inputs.income_growth_rate} />
            <PlannerNumberField label={evaluation.fields.expenseGrowthRate} min="-100" onChange={(value) => updateInput("expense_growth_rate", value)} step="0.1" suffix={evaluation.units.percent} value={inputs.expense_growth_rate} />
          </div><p className={styles.advancedHint}>{evaluation.advancedHint}</p></div></details>
          <p className={styles.note}><Sparkles aria-hidden="true" size={15} />{evaluation.assumptionsNote}</p>
        </section>
        <section aria-labelledby="evaluation-outcome-heading" className={styles.panel}><div className={styles.panelHeading}><h2 id="evaluation-outcome-heading">{evaluation.outcomeTitle}</h2>{calculation.isLoading || stressCalculation.isLoading ? <span className={styles.updating}>{copy.updating}</span> : null}</div>
          <div className={styles.headlineMetrics}>
            <article><span>{evaluation.monthlyNetIncome}</span><strong className={story && story.monthlyNetIncome < 0 ? styles.negativeValue : styles.realValue}>{formatWealthCurrency(story?.monthlyNetIncome ?? null)}</strong></article>
            <article><span>{evaluation.breakEven}</span><strong className={styles.primaryValue}>{story?.breakEvenMonths != null ? `${formatWealthNumber(story.breakEvenMonths)} ${evaluation.units.months}` : evaluation.notReached}</strong></article>
          </div>
          <dl className={styles.evaluationMetrics}>
            <MetricRow label={evaluation.totalCapital} value={formatWealthCurrency(story?.totalCapital ?? null)} />
            <MetricRow label={evaluation.totalProfit} value={formatWealthCurrency(story?.netProfit ?? null)} valueClass={story && story.netProfit < 0 ? styles.negativeValue : undefined} />
            <MetricRow label={evaluation.roi} value={story ? `${formatWealthNumber(story.roiPercent)}%` : "—"} valueClass={story && story.roiPercent < 0 ? styles.negativeValue : undefined} />
            {story?.annualizedReturnPercent != null ? <MetricRow label={evaluation.annualizedReturn} value={`${formatWealthNumber(story.annualizedReturnPercent)}%`} valueClass={story.annualizedReturnPercent < 0 ? styles.negativeValue : undefined} /> : null}
            {toInvestmentNumber(inputs.exit_value) > 0 ? <MetricRow label={evaluation.exitContribution} value={formatWealthCurrency(toInvestmentNumber(inputs.exit_value))} /> : null}
          </dl>
          {story ? <p className={styles.insight}><Sparkles aria-hidden="true" size={17} />{story.monthlyNetIncome <= 0 ? evaluation.incomeGapInsight : story.breakEvenMonths == null || story.breakEvenMonths > periodMonths ? evaluation.periodInsight : evaluation.interpretation(formatWealthNumber(story.breakEvenMonths), formatWealthCurrency(story.monthlyNetIncome))}</p> : null}
        </section>
      </div>
      {stressStory ? <section aria-labelledby="evaluation-stress-heading" className={styles.stressScenario}><div><h2 id="evaluation-stress-heading">{evaluation.stressTitle}</h2><p>{evaluation.stressDescription}</p></div><dl><MetricRow label={evaluation.stressMonthlyIncome} value={formatWealthCurrency(stressStory.monthlyNetIncome)} /><MetricRow label={evaluation.stressBreakEven} value={stressStory.breakEvenMonths == null ? evaluation.notReached : `${formatWealthNumber(stressStory.breakEvenMonths)} ${evaluation.units.months}`} /><MetricRow label={evaluation.stressTotalProfit} value={formatWealthCurrency(stressStory.netProfit)} valueClass={stressStory.netProfit < 0 ? styles.negativeValue : undefined} /></dl></section> : null}
      {calculation.isError || stressCalculation.isError ? <ErrorMessage copy={copy} /> : null}
    </div>
  );
}

function PlannerNumberField({ label, max, min, onChange, prefix, step = "any", suffix, value }: { label: string; max?: string; min?: string; onChange: (value: string) => void; prefix?: string; step?: string; suffix?: string; value: string }) {
  return <label className={styles.field}><span>{label}</span><span className={styles.inputShell}>{prefix ? <span className={styles.inputAffix}>{prefix}</span> : null}<input inputMode="decimal" max={max} min={min} onChange={(event) => onChange(event.target.value)} step={step} type="number" value={value} />{suffix ? <span className={styles.inputAffix}>{suffix}</span> : null}</span></label>;
}

function MetricRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) { return <div><dt>{label}</dt><dd className={valueClass}>{value}</dd></div>; }
function ErrorMessage({ copy }: { copy: InvestmentPlannerLanguage }) { return <p className={styles.error} role="alert">{copy.error}</p>; }
