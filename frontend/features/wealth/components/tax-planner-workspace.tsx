"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import {
  readTaxPlannerDraft,
  saveTaxPlannerDraft,
  useTaxPlanner,
} from "@/features/wealth/hooks/use-tax-planner";
import type {
  TaxPlannerCalculateRequest,
  TaxPlannerCalculateResponse,
  TaxPlannerGender,
  TaxPlannerIncomeInput,
  TaxPlannerInvestmentInput,
  TaxPlannerMode,
  TaxPlannerProfileInput,
} from "@/features/wealth/types/tax-planner-types";
import { buildInvestmentTips } from "@/features/wealth/catalog/tax-planner-config";
import { formatWealthCurrency, formatWealthNumber } from "@/features/wealth/view-models/wealth-view-model";

type NumericInputState<T extends Record<string, unknown>> = Record<keyof T, string>;

type DetailedInvestmentState = NumericInputState<
  Omit<TaxPlannerInvestmentInput, "tax_saving_investments" | "simulation_additional_investment">
>;

type TaxPlannerProfileState = {
  resident_individual: boolean;
  gender: TaxPlannerGender;
  age: string;
  senior_citizen: boolean;
  person_with_disability: boolean;
  freedom_fighter: boolean;
};

type WizardStep = "about" | "income" | "investments" | "review";

type TaxPlannerDraft = {
  mode: TaxPlannerMode;
  profile: TaxPlannerProfileState;
  income: NumericInputState<TaxPlannerIncomeInput>;
  investments: DetailedInvestmentState;
  quickTaxSavingInvestments: string;
  selectedIncomeCards: string[];
  selectedInvestmentCards: string[];
};

const DEFAULT_INCOME: NumericInputState<TaxPlannerIncomeInput> = {
  annual_salary: "900000",
  other_yearly_income: "0",
  festival_bonus: "0",
  other_employment_benefits: "0",
  self_employment_income: "0",
  rental_income: "0",
  bank_interest: "0",
  fdr_profit: "0",
  dps_profit: "0",
  sanchayapatra_profit: "0",
  dividend_income: "0",
  other_income: "0",
};

const DEFAULT_INVESTMENTS: DetailedInvestmentState = {
  life_insurance: "0",
  provident_fund: "0",
  dps_or_savings: "0",
  sanchayapatra: "0",
  stock_market: "0",
  mutual_funds: "0",
  approved_donations: "0",
  other_eligible_investment: "0",
};

const DEFAULT_PROFILE: TaxPlannerProfileState = {
  resident_individual: true,
  gender: "MALE",
  age: "30",
  senior_citizen: false,
  person_with_disability: false,
  freedom_fighter: false,
};

const QUICK_PROFILE: TaxPlannerProfileInput = {
  resident_individual: true,
  gender: "PREFER_NOT_TO_SAY",
  age: null,
  senior_citizen: false,
  person_with_disability: false,
  freedom_fighter: false,
};

const HERO_CHIPS = ["No tax forms", "No uploads", "Plain language", "Planning focused"] as const;

const HERO_EDU_CHIPS = [
  { label: "PF", icon: "🧾" },
  { label: "Life Insurance", icon: "🛡️" },
  { label: "Stocks", icon: "📊" },
  { label: "Mutual Funds", icon: "🪙" },
  { label: "Sanchayapatra", icon: "🇧🇩" },
] as const;

const GENDER_OPTIONS: Array<{ value: TaxPlannerGender; label: string }> = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];

const SPECIAL_CATEGORIES: Array<{
  key: "senior_citizen" | "person_with_disability" | "freedom_fighter";
  label: string;
  helper: string;
  icon: string;
}> = [
  { key: "senior_citizen", label: "Senior Citizen", helper: "Aged 65 or above", icon: "🧓" },
  { key: "person_with_disability", label: "Person with Disability", helper: "Higher tax-free allowance", icon: "♿" },
  { key: "freedom_fighter", label: "Freedom Fighter", helper: "Gazetted freedom fighter", icon: "🎖️" },
];

const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "about", label: "About You" },
  { id: "income", label: "Income Sources" },
  { id: "investments", label: "Tax Saving Investments" },
  { id: "review", label: "Review & Calculate" },
];

const INCOME_CARDS = [
  {
    id: "salary",
    title: "Salary",
    icon: "💼",
    helper: "Yearly salary, bonus, and employment benefits.",
    fields: [
      ["annual_salary", "Annual Salary"],
      ["festival_bonus", "Festival Bonus"],
      ["other_employment_benefits", "Other Benefits"],
    ],
  },
  {
    id: "self-employment",
    title: "Business / Freelance",
    icon: "🧑‍💻",
    helper: "Small business, freelancing, consulting or professional income.",
    fields: [["self_employment_income", "Estimated Annual Profit"]],
  },
  {
    id: "rental",
    title: "Rental Income",
    icon: "🏠",
    helper: "Estimated yearly income after normal property expenses.",
    fields: [["rental_income", "Net Annual Rental Income"]],
  },
  {
    id: "savings-deposit",
    title: "Deposit Income",
    icon: "🏦",
    helper: "Interest or profit from savings products.",
    fields: [
      ["bank_interest", "Bank Interest"],
      ["fdr_profit", "FDR Profit"],
      ["dps_profit", "DPS Profit"],
      ["sanchayapatra_profit", "Sanchayapatra Profit"],
    ],
  },
  {
    id: "dividend",
    title: "Dividend Income",
    icon: "📈",
    helper: "Cash dividends received.",
    fields: [["dividend_income", "Cash Dividends Received"]],
  },
  {
    id: "other",
    title: "Other Income",
    icon: "✨",
    helper: "Any other taxable income you want to include.",
    fields: [["other_income", "Other Taxable Income"]],
  },
] as const;

const INVESTMENT_CARDS = [
  { key: "life_insurance", label: "Life Insurance", icon: "🛡️" },
  { key: "provident_fund", label: "Provident Fund", icon: "🧾" },
  { key: "stock_market", label: "Stocks", icon: "📊" },
  { key: "mutual_funds", label: "Mutual Funds", icon: "🪙" },
  { key: "sanchayapatra", label: "Sanchayapatra", icon: "🇧🇩" },
  { key: "dps_or_savings", label: "DPS / Savings", icon: "📅" },
] as const;

const JOURNEY_STEPS = [
  { key: "total_income", label: "Total Income", icon: "💰", tone: "info" },
  { key: "tax_free_allowance", label: "Tax-Free Allowance", icon: "🛡️", tone: "positive" },
  { key: "taxable_income", label: "Taxable Income", icon: "🧾", tone: "neutral" },
  { key: "gross_tax", label: "Gross Tax", icon: "％", tone: "warning" },
  { key: "rebate", label: "Investment Rebate", icon: "🌱", tone: "positive" },
  { key: "final_tax", label: "Final Tax", icon: "🎯", tone: "primary" },
] as const;

const SIMULATION_STEPS = [50000, 100000, 200000] as const;
const SIMULATION_SLIDER_MAX = 1000000;

export function TaxPlannerWorkspace() {
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [mode, setMode] = useState<TaxPlannerMode>("QUICK");
  const [profile, setProfile] = useState<TaxPlannerProfileState>(DEFAULT_PROFILE);
  const [income, setIncome] = useState<NumericInputState<TaxPlannerIncomeInput>>(DEFAULT_INCOME);
  const [investments, setInvestments] = useState<DetailedInvestmentState>(DEFAULT_INVESTMENTS);
  const [quickTaxSavingInvestments, setQuickTaxSavingInvestments] = useState("0");
  const [selectedIncomeCards, setSelectedIncomeCards] = useState<string[]>(["salary"]);
  const [selectedInvestmentCards, setSelectedInvestmentCards] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState<WizardStep>("about");
  const [simulatedAdditionalInvestment, setSimulatedAdditionalInvestment] = useState(0);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const basePayload = useMemo<TaxPlannerCalculateRequest>(
    () => buildPayload(mode, profile, income, investments, quickTaxSavingInvestments, 0),
    [mode, income, investments, profile, quickTaxSavingInvestments],
  );
  const simulationPayload = useMemo<TaxPlannerCalculateRequest>(
    () => ({
      ...basePayload,
      investments: { ...basePayload.investments, simulation_additional_investment: simulatedAdditionalInvestment },
    }),
    [basePayload, simulatedAdditionalInvestment],
  );

  const { result: baseResult, isLoading, isError } = useTaxPlanner(basePayload);
  const { result: simResult } = useTaxPlanner(simulationPayload);

  const liveResult = simResult ?? baseResult;

  useEffect(() => {
    const savedDraft = readTaxPlannerDraft<TaxPlannerDraft>();
    if (savedDraft) {
      if (savedDraft.mode) {
        setMode(savedDraft.mode);
      }
      if (savedDraft.profile) {
        setProfile(savedDraft.profile);
      }
      if (savedDraft.income) {
        setIncome(savedDraft.income);
      }
      if (savedDraft.investments) {
        setInvestments(savedDraft.investments);
      }
      if (savedDraft.quickTaxSavingInvestments != null) {
        setQuickTaxSavingInvestments(savedDraft.quickTaxSavingInvestments);
      }
      if (savedDraft.selectedIncomeCards) {
        setSelectedIncomeCards(savedDraft.selectedIncomeCards);
      }
      if (savedDraft.selectedInvestmentCards) {
        setSelectedInvestmentCards(savedDraft.selectedInvestmentCards);
      }
    }
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }
    saveTaxPlannerDraft({
      mode,
      profile,
      income,
      investments,
      quickTaxSavingInvestments,
      selectedIncomeCards,
      selectedInvestmentCards,
    });
  }, [
    draftHydrated,
    income,
    investments,
    mode,
    profile,
    quickTaxSavingInvestments,
    selectedIncomeCards,
    selectedInvestmentCards,
  ]);

  function updateIncome(key: keyof TaxPlannerIncomeInput, value: string) {
    setIncome((current) => ({ ...current, [key]: value }));
  }

  function updateInvestment(key: keyof DetailedInvestmentState, value: string) {
    setInvestments((current) => ({ ...current, [key]: value }));
  }

  function toggleIncomeCard(cardId: string) {
    setSelectedIncomeCards((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId],
    );
  }

  function toggleInvestmentCard(cardId: string) {
    setSelectedInvestmentCards((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId],
    );
  }

  function changeMode(nextMode: TaxPlannerMode) {
    setMode(nextMode);
    setActiveStep("about");
    setSimulatedAdditionalInvestment(0);
  }

  function scrollToPlay() {
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const potentialSavings = baseResult?.potential_additional_tax_saving ?? 0;
  const showResultsSkeleton = isLoading && !baseResult;

  return (
    <section aria-labelledby="tax-planner-title" className="wealth-tool-workspace wealth-tax-planner-workspace">
      <WealthSubNav />

      <TaxHero isLoading={showResultsSkeleton} potentialSavings={potentialSavings} />

      <TaxModeSegment activeMode={mode} onChange={changeMode} />

      <div className="wealth-tax-workspace-card wealth-panel" ref={workspaceRef}>
        {mode === "QUICK" ? (
          <QuickEstimateForm
            income={income}
            onIncomeChange={updateIncome}
            onScrollToPlay={scrollToPlay}
            onSwitchDetailed={() => changeMode("DETAILED")}
            taxSavingInvestments={quickTaxSavingInvestments}
            onTaxSavingInvestmentChange={setQuickTaxSavingInvestments}
          />
        ) : (
          <DetailedWizard
            activeStep={activeStep}
            income={income}
            investments={investments}
            onCalculate={scrollToPlay}
            onIncomeChange={updateIncome}
            onInvestmentChange={updateInvestment}
            onProfileChange={setProfile}
            onStepChange={setActiveStep}
            onToggleIncomeCard={toggleIncomeCard}
            onToggleInvestmentCard={toggleInvestmentCard}
            profile={profile}
            selectedIncomeCards={selectedIncomeCards}
            selectedInvestmentCards={selectedInvestmentCards}
          />
        )}
      </div>

      <div
        aria-busy={showResultsSkeleton}
        aria-live="polite"
        className="wealth-tax-results-region"
        ref={resultsRef}
      >
        {showResultsSkeleton ? <TaxResultsSkeleton /> : null}
        {isError ? (
          <p className="wealth-error-copy" role="alert">
            Could not calculate this estimate right now. Check your connection and try again.
          </p>
        ) : null}
        {baseResult && liveResult ? (
          <div className="wealth-tax-results">
            <TaxSnapshot baseResult={baseResult} mode={mode} />
            <PlayAndExplore
              additionalInvestment={simulatedAdditionalInvestment}
              baseResult={baseResult}
              onChange={setSimulatedAdditionalInvestment}
              onReset={() => setSimulatedAdditionalInvestment(0)}
              simResult={liveResult}
            />
            <TaxJourney result={liveResult} />
            <SmartInsights result={liveResult} />
            <p className="wealth-tax-footer-disclaimer">{liveResult.disclaimer}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TaxHero({
  isLoading,
  potentialSavings,
}: {
  isLoading: boolean;
  potentialSavings: string | number;
}) {
  return (
    <header className="wealth-tax-hero">
      <div className="wealth-tax-hero-content">
        <span className="wealth-tax-badge">FY 2025-2026</span>
        <h1 id="tax-planner-title">Tax Planner</h1>
        <p className="wealth-tax-hero-subtitle">
          Estimate your yearly tax and discover legal ways to reduce it through tax-saving investments.
        </p>
        <ul aria-label="Planner benefits" className="wealth-tax-chip-row">
          {HERO_CHIPS.map((chip) => (
            <li className="wealth-tax-chip" key={chip}>
              <span aria-hidden="true">✓</span>
              {chip}
            </li>
          ))}
        </ul>
      </div>

      <aside aria-label="Savings preview" className="wealth-tax-hero-aside">
        <SavingsJar compact fillPercent={50} floating />
        <div className="wealth-tax-savings-card">
          <p className="eyebrow">Potential Annual Tax Savings</p>
          <strong aria-live="polite">{isLoading ? "…" : formatWealthCurrency(potentialSavings)}</strong>
          <span>More money kept in your pocket.</span>
        </div>
        <div className="wealth-tax-edu-chips">
          <span className="wealth-tax-edu-chips-label">What usually helps</span>
          <div className="wealth-tax-edu-chips-row">
            {HERO_EDU_CHIPS.map((chip) => (
              <span className="wealth-tax-edu-chip" key={chip.label}>
                <span aria-hidden="true">{chip.icon}</span>
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </header>
  );
}

function TaxModeSegment({
  activeMode,
  onChange,
}: {
  activeMode: TaxPlannerMode;
  onChange: (mode: TaxPlannerMode) => void;
}) {
  return (
    <div className="wealth-tax-mode-segment">
      <span className="wealth-tax-mode-segment-label" id="tax-planner-mode-label">
        Estimate mode
      </span>
      <div
        aria-labelledby="tax-planner-mode-label"
        className="wealth-tax-mode-segment-track"
        role="tablist"
      >
        <button
          aria-controls="tax-planner-panel"
          aria-selected={activeMode === "QUICK"}
          className={activeMode === "QUICK" ? "wealth-tax-segment-active" : ""}
          id="tax-planner-tab-quick"
          onClick={() => onChange("QUICK")}
          role="tab"
          type="button"
        >
          <span aria-hidden="true">⚡</span> Quick Estimate
        </button>
        <button
          aria-controls="tax-planner-panel"
          aria-selected={activeMode === "DETAILED"}
          className={activeMode === "DETAILED" ? "wealth-tax-segment-active" : ""}
          id="tax-planner-tab-detailed"
          onClick={() => onChange("DETAILED")}
          role="tab"
          type="button"
        >
          <span aria-hidden="true">✦</span> Detailed Estimate
        </button>
      </div>
    </div>
  );
}

function TaxResultsSkeleton() {
  return (
    <div aria-hidden="true" className="wealth-tax-results-skeleton">
      <div className="wealth-tax-skeleton-block wealth-tax-skeleton-hero" />
      <div className="wealth-tax-skeleton-grid">
        <div className="wealth-tax-skeleton-block" />
        <div className="wealth-tax-skeleton-block" />
        <div className="wealth-tax-skeleton-block" />
      </div>
    </div>
  );
}

function QuickEstimateForm({
  income,
  onIncomeChange,
  onScrollToPlay,
  onSwitchDetailed,
  onTaxSavingInvestmentChange,
  taxSavingInvestments,
}: {
  income: NumericInputState<TaxPlannerIncomeInput>;
  onIncomeChange: (key: keyof TaxPlannerIncomeInput, value: string) => void;
  onScrollToPlay: () => void;
  onSwitchDetailed: () => void;
  onTaxSavingInvestmentChange: (value: string) => void;
  taxSavingInvestments: string;
}) {
  return (
    <div aria-labelledby="tax-planner-tab-quick" className="wealth-tax-quick" id="tax-planner-panel" role="tabpanel">
      <div className="wealth-tax-workspace-head">
        <h2>Three yearly numbers, one quick picture</h2>
        <p className="wealth-muted-copy">Your estimate updates live below as you type.</p>
      </div>
      <div className="wealth-form-grid">
        <TaxInput
          hint="Yearly gross salary before tax deductions."
          inputMode="decimal"
          label="Annual Salary"
          onChange={(value) => onIncomeChange("annual_salary", value)}
          value={income.annual_salary}
        />
        <TaxInput
          hint="Freelance, rental, bonus, or any other yearly income."
          inputMode="decimal"
          label="Other Yearly Income"
          onChange={(value) => onIncomeChange("other_yearly_income", value)}
          value={income.other_yearly_income}
        />
        <TaxInput
          helper="Life insurance, provident fund, stocks, mutual funds, government savings certificates and similar."
          hint="Total amount invested this year in tax-saving instruments."
          inputMode="decimal"
          label="Tax Saving Investments"
          onChange={onTaxSavingInvestmentChange}
          value={taxSavingInvestments}
        />
      </div>
      <div className="wealth-tax-quick-actions">
        <button className="wealth-tax-next-button" onClick={onScrollToPlay} type="button">
          See My Tax Snapshot →
        </button>
        <button className="wealth-inline-link wealth-tax-link-button" onClick={onSwitchDetailed} type="button">
          Need more accuracy? Try detailed estimate
        </button>
      </div>
    </div>
  );
}

function DetailedWizard({
  activeStep,
  income,
  investments,
  onCalculate,
  onIncomeChange,
  onInvestmentChange,
  onProfileChange,
  onStepChange,
  onToggleIncomeCard,
  onToggleInvestmentCard,
  profile,
  selectedIncomeCards,
  selectedInvestmentCards,
}: {
  activeStep: WizardStep;
  income: NumericInputState<TaxPlannerIncomeInput>;
  investments: DetailedInvestmentState;
  onCalculate: () => void;
  onIncomeChange: (key: keyof TaxPlannerIncomeInput, value: string) => void;
  onInvestmentChange: (key: keyof DetailedInvestmentState, value: string) => void;
  onProfileChange: (profile: TaxPlannerProfileState) => void;
  onStepChange: (step: WizardStep) => void;
  onToggleIncomeCard: (cardId: string) => void;
  onToggleInvestmentCard: (cardId: string) => void;
  profile: TaxPlannerProfileState;
  selectedIncomeCards: string[];
  selectedInvestmentCards: string[];
}) {
  const currentIndex = WIZARD_STEPS.findIndex((step) => step.id === activeStep);

  function goNext() {
    const nextStep = WIZARD_STEPS[currentIndex + 1];
    if (nextStep) {
      onStepChange(nextStep.id);
    } else {
      onCalculate();
    }
  }

  function goBack() {
    const previousStep = WIZARD_STEPS[currentIndex - 1];
    if (previousStep) {
      onStepChange(previousStep.id);
    }
  }

  return (
    <div aria-labelledby="tax-planner-tab-detailed" className="wealth-tax-wizard" id="tax-planner-panel" role="tabpanel">
      <ol className="wealth-tax-stepper">
        {WIZARD_STEPS.map((step, index) => {
          const state = index === currentIndex ? "active" : index < currentIndex ? "done" : "todo";
          return (
            <li className={`wealth-tax-step wealth-tax-step-${state}`} key={step.id}>
              <button onClick={() => onStepChange(step.id)} type="button">
                <span className="wealth-tax-step-index">{index < currentIndex ? "✓" : index + 1}</span>
                <span className="wealth-tax-step-label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="wealth-tax-step-body">
        {activeStep === "about" ? (
          <AboutYouStep onProfileChange={onProfileChange} profile={profile} />
        ) : activeStep === "income" ? (
          <IncomeStep
            income={income}
            onIncomeChange={onIncomeChange}
            onToggleIncomeCard={onToggleIncomeCard}
            selectedIncomeCards={selectedIncomeCards}
          />
        ) : activeStep === "investments" ? (
          <InvestmentStep
            income={income}
            investments={investments}
            onInvestmentChange={onInvestmentChange}
            onToggleInvestmentCard={onToggleInvestmentCard}
            selectedInvestmentCards={selectedInvestmentCards}
          />
        ) : (
          <ReviewStep income={income} investments={investments} onStepChange={onStepChange} profile={profile} />
        )}
      </div>

      <div className="wealth-tax-wizard-nav">
        <button
          className="wealth-tax-back-button"
          disabled={currentIndex === 0}
          onClick={goBack}
          type="button"
        >
          ← Back
        </button>
        <button className="wealth-tax-next-button" onClick={goNext} type="button">
          {currentIndex === WIZARD_STEPS.length - 1 ? "Calculate My Estimated Tax" : "Next →"}
        </button>
      </div>
    </div>
  );
}

function AboutYouStep({
  onProfileChange,
  profile,
}: {
  onProfileChange: (profile: TaxPlannerProfileState) => void;
  profile: TaxPlannerProfileState;
}) {
  return (
    <div className="wealth-tax-step-content">
      <div className="wealth-tax-workspace-head">
        <h2>Let&apos;s make this personal</h2>
        <p className="wealth-muted-copy">A few details help tailor your tax-free allowance.</p>
      </div>

      <div className="wealth-tax-about-row">
        <div className="wealth-tax-about-field">
          <span className="wealth-tax-about-field-label">How do you identify?</span>
          <div className="wealth-tax-pill-group" role="group" aria-label="Gender">
            {GENDER_OPTIONS.map((option) => (
              <button
                aria-pressed={profile.gender === option.value}
                className={`wealth-tax-pill ${profile.gender === option.value ? "wealth-tax-pill-active" : ""}`}
                key={option.value}
                onClick={() => onProfileChange({ ...profile, gender: option.value })}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="wealth-tax-about-field wealth-tax-about-age">
          <span className="wealth-tax-about-field-label">Your age</span>
          <input
            inputMode="numeric"
            onChange={(event) => onProfileChange({ ...profile, age: event.target.value })}
            placeholder="e.g. 32"
            type="text"
            value={profile.age}
          />
        </label>
      </div>

      <div className="wealth-tax-about-field">
        <span className="wealth-tax-about-field-label">Do any of these apply to you?</span>
        <p className="wealth-tax-about-field-hint">These can raise your tax-free allowance. Tap any that fit — skip if none do.</p>
        <div className="wealth-tax-category-grid">
          {SPECIAL_CATEGORIES.map((category) => {
            const isActive = profile[category.key];
            return (
              <button
                aria-pressed={isActive}
                className={`wealth-tax-category-card ${isActive ? "wealth-tax-category-active" : ""}`}
                key={category.key}
                onClick={() => onProfileChange({ ...profile, [category.key]: !isActive })}
                type="button"
              >
                <span className="wealth-tax-category-icon" aria-hidden="true">{category.icon}</span>
                <span className="wealth-tax-category-copy">
                  <strong>{category.label}</strong>
                  <small>{category.helper}</small>
                </span>
                <span className="wealth-tax-category-check" aria-hidden="true">{isActive ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IncomeStep({
  income,
  onIncomeChange,
  onToggleIncomeCard,
  selectedIncomeCards,
}: {
  income: NumericInputState<TaxPlannerIncomeInput>;
  onIncomeChange: (key: keyof TaxPlannerIncomeInput, value: string) => void;
  onToggleIncomeCard: (cardId: string) => void;
  selectedIncomeCards: string[];
}) {
  return (
    <div className="wealth-tax-step-content">
      <div className="wealth-tax-workspace-head">
        <h2>How do you earn money?</h2>
        <p className="wealth-muted-copy">Pick what applies — yearly amounts only.</p>
      </div>
      <div className="wealth-tax-card-grid">
        {INCOME_CARDS.map((card) => {
          const isSelected = selectedIncomeCards.includes(card.id);
          return (
            <article className={`wealth-tax-select-card ${isSelected ? "wealth-tax-select-card-active" : ""}`} key={card.id}>
              <button
                aria-expanded={isSelected}
                aria-label={`${card.title}. ${isSelected ? "Collapse" : "Expand"} details.`}
                onClick={() => onToggleIncomeCard(card.id)}
                type="button"
              >
                <span className="wealth-tax-select-icon" aria-hidden="true">{card.icon}</span>
                <span className="wealth-tax-select-copy">
                  <strong>{card.title}</strong>
                  <small>{card.helper}</small>
                </span>
                <span className="wealth-tax-select-check" aria-hidden="true">{isSelected ? "−" : "+"}</span>
              </button>
              {isSelected ? (
                <div className="wealth-form-grid">
                  {card.fields.map(([key, label]) => (
                    <TaxInput
                      key={key}
                      label={label}
                      onChange={(value) => onIncomeChange(key as keyof TaxPlannerIncomeInput, value)}
                      value={income[key as keyof TaxPlannerIncomeInput]}
                    />
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function InvestmentStep({
  income,
  investments,
  onInvestmentChange,
  onToggleInvestmentCard,
  selectedInvestmentCards,
}: {
  income: NumericInputState<TaxPlannerIncomeInput>;
  investments: DetailedInvestmentState;
  onInvestmentChange: (key: keyof DetailedInvestmentState, value: string) => void;
  onToggleInvestmentCard: (cardId: string) => void;
  selectedInvestmentCards: string[];
}) {
  const tips = useMemo(() => buildInvestmentTips(sumStateValues(income)), [income]);

  return (
    <div className="wealth-tax-step-content">
      <div className="wealth-tax-workspace-head">
        <h2>How do you save or invest?</h2>
        <p className="wealth-muted-copy">Tap + to add yearly amounts for eligible investments.</p>
      </div>

      <InvestmentKnowHow tips={tips} />

      <div className="wealth-tax-investment-list">
        {INVESTMENT_CARDS.map((card) => {
          const isSelected = selectedInvestmentCards.includes(card.key);
          const amountId = `tax-investment-${card.key}`;
          return (
            <div
              className={`wealth-tax-investment-tile ${isSelected ? "wealth-tax-investment-tile-active" : ""}`}
              key={card.key}
            >
              <div className="wealth-tax-investment-tile-head">
                <span className="wealth-tax-investment-icon" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="wealth-tax-investment-name">{card.label}</span>
                <button
                  aria-expanded={isSelected}
                  aria-label={`${card.label}. ${isSelected ? "Remove" : "Add"} amount.`}
                  className="wealth-tax-investment-action"
                  onClick={() => onToggleInvestmentCard(card.key)}
                  type="button"
                >
                  {isSelected ? "−" : "+"}
                </button>
              </div>
              {isSelected ? (
                <div className="wealth-tax-investment-amount">
                  <input
                    aria-label={`${card.label} yearly amount`}
                    id={amountId}
                    inputMode="decimal"
                    onChange={(event) =>
                      onInvestmentChange(card.key as keyof DetailedInvestmentState, event.target.value)
                    }
                    placeholder="Yearly amount"
                    type="text"
                    value={investments[card.key as keyof DetailedInvestmentState]}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvestmentKnowHow({ tips }: { tips: ReturnType<typeof buildInvestmentTips> }) {
  return (
    <aside aria-label="Investment planning tips" className="wealth-tax-knowhow">
      <div className="wealth-tax-knowhow-head">
        <span aria-hidden="true" className="wealth-tax-knowhow-icon">
          💡
        </span>
        <strong>Good to know</strong>
      </div>
      <ul className="wealth-tax-knowhow-list">
        {tips.map((tip) => (
          <li className="wealth-tax-knowhow-item" key={tip.id}>
            <span aria-hidden="true" className="wealth-tax-knowhow-item-icon">
              {tip.icon}
            </span>
            <span className="wealth-tax-knowhow-summary">{tip.summary}</span>
            <span className="wealth-tax-tip-popover">
              <button
                aria-label={`More about: ${tip.summary}`}
                className="wealth-tax-tip-trigger"
                type="button"
              >
                i
              </button>
              <span className="wealth-tax-tip-popup" role="tooltip">
                {tip.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function ReviewStep({
  income,
  investments,
  onStepChange,
  profile,
}: {
  income: NumericInputState<TaxPlannerIncomeInput>;
  investments: DetailedInvestmentState;
  onStepChange: (step: WizardStep) => void;
  profile: TaxPlannerProfileState;
}) {
  return (
    <div className="wealth-tax-step-content">
      <div className="wealth-tax-workspace-head">
        <h2>Your picture so far</h2>
      </div>
      <div className="wealth-tax-review-grid">
        <ReviewBlock onEdit={() => onStepChange("about")} title="Tax Profile" value={profileSummary(profile)} />
        <ReviewBlock onEdit={() => onStepChange("income")} title="Income Sources" value={formatWealthCurrency(sumStateValues(income))} />
        <ReviewBlock
          onEdit={() => onStepChange("investments")}
          title="Tax Saving Investments"
          value={formatWealthCurrency(sumStateValues(investments))}
        />
      </div>
    </div>
  );
}

function TaxSnapshot({
  baseResult,
  mode,
}: {
  baseResult: TaxPlannerCalculateResponse;
  mode: TaxPlannerMode;
}) {
  const effectiveRate = effectiveTaxRate(baseResult.final_tax, baseResult.total_income);
  const confidence = mode === "DETAILED" ? 4 : 2;
  const confidenceLabel = mode === "DETAILED" ? "Strong" : "Good";

  return (
    <section className="wealth-tax-snapshot wealth-panel">
      <div className="wealth-tax-snapshot-head">
        <p className="wealth-tax-section-eyebrow">Tax Snapshot</p>
        <h2>Here&apos;s your current picture</h2>
      </div>

      <div className="wealth-tax-story-grid">
        <article className="wealth-tax-story-card wealth-tax-story-pay">
          <span className="wealth-tax-story-label">You May Pay</span>
          <strong>{formatWealthCurrency(baseResult.final_tax)}</strong>
        </article>
        <article className="wealth-tax-story-card wealth-tax-story-save">
          <span className="wealth-tax-story-label">You Could Still Save</span>
          <strong>{formatWealthCurrency(baseResult.potential_additional_tax_saving)}</strong>
        </article>
        <article className="wealth-tax-story-card wealth-tax-story-max">
          <span className="wealth-tax-story-label">Max Eligible Investment</span>
          <strong>{formatWealthCurrency(baseResult.maximum_eligible_investment)}</strong>
        </article>
      </div>

      <div className="wealth-tax-stat-pills" role="list">
        <span className="wealth-tax-stat-pill" role="listitem">
          <span>Confidence</span>
          <strong aria-label={`Confidence ${confidence} of 4, ${confidenceLabel}`}>
            {"★".repeat(confidence)}
            {"☆".repeat(4 - confidence)} {confidenceLabel}
          </strong>
        </span>
        <span className="wealth-tax-stat-pill" role="listitem">
          <span>Effective rate</span>
          <strong>{formatWealthNumber(effectiveRate)}%</strong>
        </span>
        <span className="wealth-tax-stat-pill" role="listitem">
          <span>Total income</span>
          <strong>{formatWealthCurrency(baseResult.total_income)}</strong>
        </span>
        <span className="wealth-tax-stat-pill" role="listitem">
          <span>Rebate so far</span>
          <strong>{formatWealthCurrency(baseResult.rebate)}</strong>
        </span>
      </div>
    </section>
  );
}

function PlayAndExplore({
  additionalInvestment,
  baseResult,
  onChange,
  onReset,
  simResult,
}: {
  additionalInvestment: number;
  baseResult: TaxPlannerCalculateResponse;
  onChange: (value: number) => void;
  onReset: () => void;
  simResult: TaxPlannerCalculateResponse;
}) {
  const currentTax = toNumber(baseResult.final_tax);
  const newTax = toNumber(simResult.final_tax);
  const taxSaved = Math.max(0, currentTax - newTax);
  const maximumEligible = toNumber(baseResult.maximum_eligible_investment);
  const remainingEligible = toNumber(baseResult.remaining_eligible_investment);
  const simulationCap = Math.max(0, Math.round(remainingEligible));
  const sliderMax = simulationCap > 0 ? simulationCap : SIMULATION_SLIDER_MAX;
  const usedEligible = toNumber(simResult.current_eligible_investment);
  const unlockedPercent = maximumEligible > 0 ? Math.min(100, Math.round((usedEligible / maximumEligible) * 100)) : 0;

  const jarFillPercent = unlockedPercent;
  const rewardCopy =
    unlockedPercent >= 100
      ? "Full room unlocked — you're keeping the maximum rebate."
      : taxSaved > 0
        ? "Every extra taka can shrink your tax."
        : "Slide to see your tax drop.";

  return (
    <section className="wealth-tax-play wealth-panel">
      <div className="wealth-tax-play-head">
        <p className="wealth-tax-section-eyebrow">Play &amp; Explore</p>
        <h2>What If I Invest More?</h2>
      </div>

      <div className="wealth-tax-play-layout">
        <div className="wealth-tax-play-jar">
          <SavingsJar
            fillPercent={jarFillPercent}
            label={`Tax-saving room ${unlockedPercent}% filled`}
          />
          <div className="wealth-tax-play-jar-caption">
            <strong>{formatWealthCurrency(additionalInvestment)}</strong>
            <span>extra invested · {unlockedPercent}% room used</span>
          </div>
        </div>

        <div className="wealth-tax-play-controls">
          <div className="wealth-tax-play-quick">
            <span className="wealth-tax-play-quick-label">Add more investment</span>
            <div className="wealth-tax-play-quick-buttons">
              {SIMULATION_STEPS.map((amount) => {
                const cappedAmount = Math.min(amount, simulationCap);
                return (
                  <button
                    className={`wealth-tax-quick-button ${additionalInvestment === cappedAmount && simulationCap > 0 ? "wealth-tax-quick-active" : ""}`}
                    disabled={simulationCap <= 0}
                    key={amount}
                    onClick={() => onChange(cappedAmount)}
                    type="button"
                  >
                    +{formatWealthNumber(amount)}
                  </button>
                );
              })}
              <button
                className={`wealth-tax-quick-button ${additionalInvestment >= simulationCap && simulationCap > 0 ? "wealth-tax-quick-active" : ""}`}
                disabled={simulationCap <= 0}
                onClick={() => onChange(simulationCap)}
                type="button"
              >
                Max Out
              </button>
            </div>
          </div>

          <div className="wealth-tax-slider-block">
            <div className="wealth-tax-slider-head">
              <span>Use the slider or quick buttons to explore</span>
              <span className="wealth-tax-slider-max">Maximum eligible {formatWealthCurrency(maximumEligible)}</span>
            </div>
            <input
              aria-label="Additional tax-saving investment to simulate"
              aria-valuemax={sliderMax}
              aria-valuemin={0}
              aria-valuenow={Math.min(sliderMax, additionalInvestment)}
              aria-valuetext={formatWealthCurrency(Math.min(sliderMax, additionalInvestment))}
              className="wealth-tax-slider"
              disabled={sliderMax <= 0}
              max={sliderMax}
              min={0}
              onChange={(event) => onChange(Number(event.target.value))}
              step={sliderMax > 100000 ? 10000 : 5000}
              type="range"
              value={Math.min(sliderMax, additionalInvestment)}
            />
            <div className="wealth-tax-slider-scale">
              <span>0</span>
              <span>{formatWealthNumber(Math.round(sliderMax / 2))}</span>
              <span>{formatWealthCurrency(sliderMax)}</span>
            </div>
          </div>

          <div className="wealth-tax-progress">
            <div className="wealth-tax-progress-head">
              <span>Tax-saving room used</span>
              <strong>{unlockedPercent}%</strong>
            </div>
            <div className="wealth-tax-progress-track">
              <span style={{ width: `${unlockedPercent}%` }} />
            </div>
          </div>

          <div className="wealth-tax-play-metrics">
            <div className="wealth-tax-play-metric wealth-tax-metric-current">
              <span>Current Tax</span>
              <strong>{formatWealthCurrency(currentTax)}</strong>
            </div>
            <div className="wealth-tax-play-metric wealth-tax-metric-new">
              <span>New Estimated Tax</span>
              <strong>{formatWealthCurrency(newTax)}</strong>
            </div>
            <div className="wealth-tax-play-metric wealth-tax-metric-saved">
              <span>Tax Saved</span>
              <strong>{formatWealthCurrency(taxSaved)}</strong>
            </div>
            <div className="wealth-tax-play-metric wealth-tax-metric-unlocked">
              <span>Potential Savings Unlocked</span>
              <strong>{unlockedPercent}%</strong>
            </div>
          </div>

          <div className="wealth-tax-play-footer">
            <p>{rewardCopy}</p>
            {additionalInvestment > 0 ? (
              <button className="wealth-inline-link wealth-tax-link-button" onClick={onReset} type="button">
                Reset simulation
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function TaxJourney({ result }: { result: TaxPlannerCalculateResponse }) {
  const values: Record<(typeof JOURNEY_STEPS)[number]["key"], string | number> = {
    total_income: result.total_income,
    tax_free_allowance: result.tax_free_allowance,
    taxable_income: result.taxable_income,
    gross_tax: result.gross_tax,
    rebate: result.rebate,
    final_tax: result.final_tax,
  };

  return (
    <section className="wealth-tax-journey-section wealth-panel">
      <div className="wealth-tax-play-head">
        <p className="wealth-tax-section-eyebrow">Tax Journey</p>
        <h2>Understand how your tax is calculated</h2>
      </div>
      <div className="wealth-tax-journey-flow">
        {JOURNEY_STEPS.map((step, index) => (
          <div className="wealth-tax-journey-item" key={step.key}>
            <article className={`wealth-tax-journey-node wealth-tax-node-${step.tone}`}>
              <span className="wealth-tax-journey-icon" aria-hidden="true">{step.icon}</span>
              <span className="wealth-tax-journey-label">{step.label}</span>
              <strong>
                {step.key === "rebate" ? "−" : ""}
                {formatWealthCurrency(values[step.key])}
              </strong>
            </article>
            {index < JOURNEY_STEPS.length - 1 ? (
              <span className="wealth-tax-journey-arrow" aria-hidden="true">→</span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function SmartInsights({ result }: { result: TaxPlannerCalculateResponse }) {
  const remaining = toNumber(result.remaining_eligible_investment);
  const potential = toNumber(result.potential_additional_tax_saving);
  const maximum = toNumber(result.maximum_eligible_investment);
  const hasRoom = remaining > 0 && maximum > 0;

  const cards = hasRoom
    ? [
        {
          id: "opportunity",
          kind: "Opportunity",
          icon: "🎯",
          tone: "info",
          title: "Room left",
          body: "More eligible investment still available.",
          amount: remaining,
        },
        {
          id: "impact",
          kind: "Impact",
          icon: "📉",
          tone: "primary",
          title: "Tax you could save",
          body: "Using full room may cut tax by about this much.",
          amount: potential,
        },
        {
          id: "action",
          kind: "Action",
          icon: "🧭",
          tone: "warning",
          title: "Try next",
          body: "PF, insurance, stocks, funds, or Sanchayapatra.",
          amount: null,
        },
      ]
    : [
        {
          id: "opportunity",
          kind: "Opportunity",
          icon: "🏆",
          tone: "positive",
          title: "Room maxed",
          body: "You're claiming the full rebate.",
          amount: result.rebate,
        },
        {
          id: "impact",
          kind: "Impact",
          icon: "🛡️",
          tone: "primary",
          title: "Rebate locked in",
          body: "Keep investing yearly to maintain it.",
          amount: null,
        },
        {
          id: "action",
          kind: "Action",
          icon: "🧭",
          tone: "info",
          title: "Revisit later",
          body: "Income changes may open new room.",
          amount: null,
        },
      ];

  return (
    <section className="wealth-tax-insights">
      <p className="wealth-tax-section-eyebrow">Smart Insights</p>
      <div className="wealth-tax-insights-grid">
        {cards.map((card) => (
          <article className={`wealth-tax-insight-card wealth-tax-insight-${card.tone}`} key={card.id}>
            <div className="wealth-tax-insight-top">
              <span className="wealth-tax-insight-icon" aria-hidden="true">{card.icon}</span>
              <span className="wealth-tax-insight-kind">{card.kind}</span>
            </div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            {card.amount != null && toNumber(card.amount) > 0 ? (
              <strong className="wealth-tax-insight-value">{formatWealthCurrency(card.amount)}</strong>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function jarFillLevel(percent: number): "empty" | "partial" | "half" | "full" {
  if (percent <= 0) {
    return "empty";
  }
  if (percent < 35) {
    return "partial";
  }
  if (percent < 70) {
    return "half";
  }
  return "full";
}

function SavingsJar({
  compact = false,
  fillPercent,
  floating = false,
  label,
}: {
  compact?: boolean;
  fillPercent: number;
  floating?: boolean;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, fillPercent));
  const fillLevel = jarFillLevel(clamped);
  const fillHeight = Math.max((clamped / 100) * 96, clamped > 0 ? 6 : 0);
  const fillY = 150 - fillHeight;
  const showSymbol = clamped > 8;

  return (
    <div
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={`wealth-tax-jar wealth-tax-jar-${fillLevel} ${compact ? "wealth-tax-jar-compact" : ""} ${floating ? "wealth-tax-jar-floating" : ""}`}
      role={label ? "img" : undefined}
    >
      <svg viewBox="0 0 160 190" role="presentation">
        <defs>
          <linearGradient id="jarMoney" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--positive)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--positive)" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="jarGlass" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(255 255 255 / 22%)" />
            <stop offset="100%" stopColor="rgb(255 255 255 / 4%)" />
          </linearGradient>
        </defs>
        <ellipse className="wealth-tax-jar-glow" cx="80" cy="170" rx="62" ry="14" />
        <rect height="14" rx="5" ry="5" width="58" x="51" y="22" className="wealth-tax-jar-lid" />
        <path
          className="wealth-tax-jar-body"
          d="M40 44 Q40 38 46 38 L114 38 Q120 38 120 44 L120 150 Q120 168 100 168 L60 168 Q40 168 40 150 Z"
          fill="url(#jarGlass)"
        />
        <clipPath id="jarClip">
          <path d="M44 48 L116 48 L116 150 Q116 164 100 164 L60 164 Q44 164 44 150 Z" />
        </clipPath>
        <g className="wealth-tax-jar-fill" clipPath="url(#jarClip)">
          <rect className="wealth-tax-jar-fill-rect" fill="url(#jarMoney)" height={fillHeight} width="80" x="40" y={fillY} />
          {clamped > 15 ? (
            <g className="wealth-tax-jar-notes">
              <rect fill="rgb(255 255 255 / 35%)" height="6" rx="2" width="40" x="58" y={fillY + 10} />
              <rect fill="rgb(255 255 255 / 22%)" height="6" rx="2" width="32" x="62" y={fillY + 26} />
            </g>
          ) : null}
        </g>
        <path
          className="wealth-tax-jar-outline"
          d="M40 44 Q40 38 46 38 L114 38 Q120 38 120 44 L120 150 Q120 168 100 168 L60 168 Q40 168 40 150 Z"
          fill="none"
        />
        {showSymbol ? (
          <text className="wealth-tax-jar-symbol" x="80" y={Math.min(150, fillY + fillHeight / 2 + 6)} textAnchor="middle">
            ৳
          </text>
        ) : null}
      </svg>
      <span className="wealth-tax-jar-spark wealth-tax-jar-spark-1">✦</span>
      <span className="wealth-tax-jar-spark wealth-tax-jar-spark-2">✶</span>
      <span className="wealth-tax-jar-spark wealth-tax-jar-spark-3">✦</span>
    </div>
  );
}

function TaxInput({
  helper,
  hint,
  inputMode = "decimal",
  label,
  onChange,
  value,
}: {
  helper?: string;
  hint?: string;
  inputMode?: "decimal" | "numeric" | "text";
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const inputId = `tax-input-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <label className="wealth-field" htmlFor={inputId}>
      <span>{label}</span>
      <input
        aria-describedby={helper ? `${inputId}-helper` : hint ? `${inputId}-hint` : undefined}
        id={inputId}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        type="text"
        value={value}
      />
      {hint ? (
        <small className="wealth-tax-input-hint" id={`${inputId}-hint`}>
          {hint}
        </small>
      ) : null}
      {helper ? (
        <small id={`${inputId}-helper`}>
          {helper}
        </small>
      ) : null}
    </label>
  );
}

function ReviewBlock({ onEdit, title, value }: { onEdit: () => void; title: string; value: string }) {
  return (
    <article className="wealth-tax-review-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <button className="wealth-inline-link wealth-tax-link-button" onClick={onEdit} type="button">
        Edit
      </button>
    </article>
  );
}

function buildPayload(
  mode: TaxPlannerMode,
  profile: TaxPlannerProfileState,
  income: NumericInputState<TaxPlannerIncomeInput>,
  investments: DetailedInvestmentState,
  quickTaxSavingInvestments: string,
  simulationAdditionalInvestment: number,
): TaxPlannerCalculateRequest {
  return {
    mode,
    fiscal_year: "2025-2026",
    profile: mode === "QUICK" ? QUICK_PROFILE : buildProfilePayload(profile),
    income: buildIncomePayload(mode, income),
    investments: buildInvestmentPayload(mode, investments, quickTaxSavingInvestments, simulationAdditionalInvestment),
  };
}

function buildIncomePayload(mode: TaxPlannerMode, income: NumericInputState<TaxPlannerIncomeInput>): TaxPlannerIncomeInput {
  if (mode === "QUICK") {
    return {
      ...zeroIncomePayload(),
      annual_salary: toNumber(income.annual_salary),
      other_yearly_income: toNumber(income.other_yearly_income),
    };
  }

  return Object.fromEntries(Object.entries(income).map(([key, value]) => [key, toNumber(value)])) as TaxPlannerIncomeInput;
}

function buildInvestmentPayload(
  mode: TaxPlannerMode,
  investments: DetailedInvestmentState,
  quickTaxSavingInvestments: string,
  simulationAdditionalInvestment: number,
): TaxPlannerInvestmentInput {
  const simulation_additional_investment = Math.max(0, simulationAdditionalInvestment);
  if (mode === "QUICK") {
    return {
      ...zeroInvestmentPayload(),
      tax_saving_investments: toNumber(quickTaxSavingInvestments),
      simulation_additional_investment,
    };
  }
  return {
    tax_saving_investments: null,
    life_insurance: toNumber(investments.life_insurance),
    provident_fund: toNumber(investments.provident_fund),
    dps_or_savings: toNumber(investments.dps_or_savings),
    sanchayapatra: toNumber(investments.sanchayapatra),
    stock_market: toNumber(investments.stock_market),
    mutual_funds: toNumber(investments.mutual_funds),
    approved_donations: toNumber(investments.approved_donations),
    other_eligible_investment: toNumber(investments.other_eligible_investment),
    simulation_additional_investment,
  };
}

function buildProfilePayload(profile: TaxPlannerProfileState): TaxPlannerProfileInput {
  return {
    resident_individual: profile.resident_individual,
    gender: profile.gender,
    age: profile.age ? toNumber(profile.age) : null,
    senior_citizen: profile.senior_citizen,
    person_with_disability: profile.person_with_disability,
    freedom_fighter: profile.freedom_fighter,
  };
}

function zeroIncomePayload(): TaxPlannerIncomeInput {
  return Object.fromEntries(Object.keys(DEFAULT_INCOME).map((key) => [key, 0])) as TaxPlannerIncomeInput;
}

function zeroInvestmentPayload(): TaxPlannerInvestmentInput {
  return {
    tax_saving_investments: 0,
    life_insurance: 0,
    provident_fund: 0,
    dps_or_savings: 0,
    sanchayapatra: 0,
    stock_market: 0,
    mutual_funds: 0,
    approved_donations: 0,
    other_eligible_investment: 0,
    simulation_additional_investment: 0,
  };
}

function effectiveTaxRate(finalTax: string | number, totalIncome: string | number) {
  const income = toNumber(totalIncome);
  if (income <= 0) {
    return 0;
  }
  return Math.round((toNumber(finalTax) / income) * 10000) / 100;
}

function profileSummary(profile: TaxPlannerProfileState) {
  const parts = [profile.resident_individual ? "Resident individual" : "Outside resident scope"];
  if (profile.gender === "FEMALE") {
    parts.push("Female");
  }
  if (profile.senior_citizen) {
    parts.push("Senior citizen");
  }
  if (profile.person_with_disability) {
    parts.push("Disability allowance");
  }
  if (profile.freedom_fighter) {
    parts.push("Freedom fighter");
  }
  return parts.join(" · ");
}

function sumStateValues(values: Record<string, string>) {
  return Object.values(values).reduce((sum, value) => sum + toNumber(value), 0);
}

function toNumber(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}
