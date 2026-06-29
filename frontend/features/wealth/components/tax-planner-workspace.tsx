"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { TaxInfoTooltip } from "@/features/wealth/components/tax-info-tooltip";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import {
  readTaxPlannerDraft,
  saveTaxPlannerDraft,
  useTaxPlanner,
} from "@/features/wealth/hooks/use-tax-planner";
import { useTaxPlannerConfig } from "@/features/wealth/hooks/use-tax-planner-config";
import type {
  TaxPlannerCalculateRequest,
  TaxPlannerCalculateResponse,
  TaxPlannerGender,
  TaxPlannerIncomeInput,
  TaxPlannerInvestmentInput,
  TaxPlannerMode,
  TaxPlannerProfileInput,
} from "@/features/wealth/types/tax-planner-types";
import type { TaxPlannerConfigResponse, TaxPlannerInvestmentCategoryConfig } from "@/features/wealth/types/tax-planner-config-types";
import {
  buildAdditionalInvestmentMarkers,
  buildAboutAllowanceInsight,
  getAdditionalInvestmentSliderStep,
  normalizeAdditionalInvestment,
} from "@/features/wealth/lib/tax-planner-rebate-helpers";
import {
  RebateBreakdownHint,
  ActiveLimiterBadge,
} from "@/features/wealth/components/tax-planner-rebate-breakdown-hint";
import { formatWealthCurrency, formatWealthNumber } from "@/features/wealth/view-models/wealth-view-model";

type NumericInputState<T extends Record<string, unknown>> = Record<keyof T, string>;

type DetailedInvestmentState = NumericInputState<
  Omit<TaxPlannerInvestmentInput, "tax_saving_investments" | "simulation_additional_investment">
>;

type TaxPlannerProfileState = {
  resident_individual: boolean;
  gender: TaxPlannerGender;
  senior_citizen: boolean;
  person_with_disability: boolean;
  freedom_fighter: boolean;
  location_code: string;
};

type WizardStep = "about" | "income" | "investments" | "review";

type TaxPlannerDraft = {
  mode: TaxPlannerMode;
  profile: TaxPlannerProfileState;
  income: IncomeFormState;
  investments: DetailedInvestmentState;
  quickTaxSavingInvestments: string;
  selectedIncomeCards: string[];
  selectedInvestmentCards: string[];
};

type IncomeFormState = Omit<
  NumericInputState<TaxPlannerIncomeInput>,
  | "annual_salary"
  | "bank_interest"
  | "dps_profit"
  | "fdr_profit"
  | "festival_bonus"
  | "other_employment_benefits"
  | "sanchayapatra_profit"
  | "dividend_income"
  | "rental_income"
> & {
  deposit_savings_income: string;
  employment_income: string;
};

type IncomeFormKey = keyof IncomeFormState;

type IncomeCardField = {
  key: IncomeFormKey;
  label: string;
  placeholder?: string;
};

const DEFAULT_INCOME: IncomeFormState = {
  employment_income: "900000",
  other_yearly_income: "0",
  self_employment_income: "0",
  deposit_savings_income: "0",
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
  senior_citizen: false,
  person_with_disability: false,
  freedom_fighter: false,
  location_code: "",
};

const QUICK_PROFILE: TaxPlannerProfileInput = {
  resident_individual: true,
  gender: "PREFER_NOT_TO_SAY",
  age: null,
  senior_citizen: false,
  person_with_disability: false,
  freedom_fighter: false,
  location_code: null,
};

const HERO_CHIPS = ["No tax forms", "No uploads", "Plain language", "Planning focused"] as const;

const HERO_EDU_CHIPS = [
  { label: "PF", icon: "🧾" },
  { label: "Life Insurance", icon: "🛡️" },
  { label: "Stocks", icon: "📊" },
  { label: "Mutual Funds", icon: "🪙" },
  { label: "Sanchayapatra", icon: "🇧🇩" },
] as const;

const TAXPAYER_CATEGORY_CARDS = [
  {
    id: "woman",
    title: "Woman",
    subtitle: "Higher tax-free allowance",
    icon: "👩",
    ariaLabel: "Woman",
  },
  {
    id: "senior_citizen",
    title: "Senior Citizen",
    subtitle: "Aged 65 or above",
    icon: "🧓",
    ariaLabel: "Senior Citizen age 65 or above",
  },
  {
    id: "person_with_disability",
    title: "Person with Disability",
    subtitle: "Higher tax-free allowance",
    icon: "♿",
    ariaLabel: "Person with Disability",
  },
  {
    id: "freedom_fighter",
    title: "Freedom Fighter",
    subtitle: "Gazetted freedom fighter",
    icon: "🎖",
    ariaLabel: "Freedom Fighter",
  },
] as const;

type TaxpayerCategoryId = (typeof TAXPAYER_CATEGORY_CARDS)[number]["id"];

const MINIMUM_TAX_AREA_OPTIONS = [
  { value: "DHAKA_CHITTAGONG", label: "Dhaka / Chattogram City Corporation" },
  { value: "OTHER_CITY", label: "Other City Corporation" },
  { value: "", label: "Outside City Corporation Areas" },
] as const;

const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "about", label: "About You" },
  { id: "income", label: "Income Sources" },
  { id: "investments", label: "Tax Saving Investments" },
  { id: "review", label: "Review & Calculate" },
];

const INCOME_CARDS: Array<{
  id: string;
  title: string;
  icon: string;
  helper: string;
  fields: IncomeCardField[];
}> = [
  {
    id: "salary",
    title: "Employment Income",
    icon: "💼",
    helper: "Salary, bonuses, allowances, and employer benefits.",
    fields: [
      {
        key: "employment_income",
        label: "Employment Income (Yearly)",
        placeholder: "Total yearly employment income",
      },
    ],
  },
  {
    id: "self-employment",
    title: "Business / Freelance",
    icon: "🏢",
    helper: "Business or freelance profit.",
    fields: [{ key: "self_employment_income", label: "Annual Profit" }],
  },
  {
    id: "savings-deposit",
    title: "Deposit & Savings Income",
    icon: "🏦",
    helper: "Bank, FDR, DPS & savings interest.",
    fields: [{ key: "deposit_savings_income", label: "Total Interest / Profit" }],
  },
  {
    id: "other",
    title: "Other Income",
    icon: "✨",
    helper: "Rental income, dividends, and any other taxable income.",
    fields: [{ key: "other_income", label: "Other Taxable Income" }],
  },
];

const INVESTMENT_FIELD_KEYS = [
  "life_insurance",
  "provident_fund",
  "dps_or_savings",
  "sanchayapatra",
  "stock_market",
  "mutual_funds",
  "approved_donations",
  "other_eligible_investment",
] as const;

const JOURNEY_STEPS = [
  { key: "gross_salary", label: "Gross Salary", icon: "💼", tone: "info", caption: "Before exemption" },
  {
    key: "employment_income_exemption",
    label: "Employment Exemption",
    icon: "🧾",
    tone: "positive",
    caption: "Deducted from salary",
  },
  { key: "taxable_salary", label: "Taxable Salary", icon: "📋", tone: "neutral", caption: "After exemption" },
  { key: "total_income", label: "Total Income", icon: "💰", tone: "info", caption: "Includes other income" },
  { key: "tax_free_allowance", label: "Tax-Free", icon: "🛡️", tone: "positive", caption: "" },
  { key: "taxable_income", label: "Taxable Income", icon: "🧾", tone: "neutral", caption: "" },
  { key: "gross_tax", label: "Gross Tax", icon: "％", tone: "warning", caption: "Before savings" },
  { key: "rebate", label: "Investment Rebate", icon: "🌱", tone: "positive", caption: "" },
  { key: "final_tax", label: "Final Tax", icon: "🎯", tone: "primary", caption: "" },
] as const;

const SIMULATION_DEBOUNCE_MS = 120;

export function TaxPlannerWorkspace() {
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [mode, setMode] = useState<TaxPlannerMode>("QUICK");
  const [profile, setProfile] = useState<TaxPlannerProfileState>(DEFAULT_PROFILE);
  const [income, setIncome] = useState<IncomeFormState>(DEFAULT_INCOME);
  const [investments, setInvestments] = useState<DetailedInvestmentState>(DEFAULT_INVESTMENTS);
  const [quickTaxSavingInvestments, setQuickTaxSavingInvestments] = useState("0");
  const [selectedIncomeCards, setSelectedIncomeCards] = useState<string[]>(["salary"]);
  const [selectedInvestmentCards, setSelectedInvestmentCards] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState<WizardStep>("about");
  const [simulatedAdditionalInvestment, setSimulatedAdditionalInvestment] = useState(0);

  const { data: plannerConfig } = useTaxPlannerConfig();
  const investmentCategories = plannerConfig?.investment_categories ?? [];

  const workspaceRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const playExploreRef = useRef<HTMLElement>(null);

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
        setProfile(normalizeProfileDraft(savedDraft.profile));
      }
      if (savedDraft.income) {
        setIncome(normalizeIncomeDraft(savedDraft.income));
      }
      if (savedDraft.investments) {
        setInvestments(savedDraft.investments);
      }
      if (savedDraft.quickTaxSavingInvestments != null) {
        setQuickTaxSavingInvestments(savedDraft.quickTaxSavingInvestments);
      }
      if (savedDraft.selectedIncomeCards) {
        setSelectedIncomeCards(normalizeSelectedIncomeCards(savedDraft.selectedIncomeCards));
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

  function updateIncome(key: IncomeFormKey, value: string) {
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

      <TaxHero
        displayName={plannerConfig?.display_name ?? "FY 2025-2026"}
        isLoading={showResultsSkeleton}
        potentialSavings={potentialSavings}
      />

      <TaxModeSegment activeMode={mode} onChange={changeMode} />

      <div className="wealth-tax-workspace-card wealth-panel" ref={workspaceRef}>
        {mode === "QUICK" ? (
          <QuickEstimateForm
            income={income}
            onIncomeChange={updateIncome}
            onSwitchDetailed={() => changeMode("DETAILED")}
            taxSavingInvestments={quickTaxSavingInvestments}
            onTaxSavingInvestmentChange={setQuickTaxSavingInvestments}
          />
        ) : (
          <DetailedWizard
            activeStep={activeStep}
            income={income}
            investments={investments}
            investmentCategories={investmentCategories}
            onCalculate={scrollToPlay}
            onIncomeChange={updateIncome}
            onInvestmentChange={updateInvestment}
            onProfileChange={setProfile}
            onStepChange={setActiveStep}
            onToggleIncomeCard={toggleIncomeCard}
            onToggleInvestmentCard={toggleInvestmentCard}
            plannerConfig={plannerConfig}
            profile={profile}
            selectedIncomeCards={selectedIncomeCards}
            selectedInvestmentCards={selectedInvestmentCards}
            taxFreeAllowance={baseResult?.tax_free_allowance}
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
              plannerConfig={plannerConfig}
              sectionRef={playExploreRef}
              simResult={liveResult}
            />
            <TaxJourney onExploreSavings={() => scrollToRebateSection(playExploreRef)} result={liveResult} />
            <p className="wealth-tax-footer-disclaimer">{liveResult.disclaimer}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TaxHero({
  displayName,
  isLoading,
  potentialSavings,
}: {
  displayName: string;
  isLoading: boolean;
  potentialSavings: string | number;
}) {
  return (
    <header className="wealth-tax-hero">
      <div className="wealth-tax-hero-content">
        <span className="wealth-tax-badge">{displayName}</span>
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
  onSwitchDetailed,
  onTaxSavingInvestmentChange,
  taxSavingInvestments,
}: {
  income: IncomeFormState;
  onIncomeChange: (key: IncomeFormKey, value: string) => void;
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
          onChange={(value) => onIncomeChange("employment_income", value)}
          value={income.employment_income}
        />
        <TaxInput
          hint="Freelance, rental, bonus, or any other yearly income."
          inputMode="decimal"
          label="Other Yearly Income"
          onChange={(value) => onIncomeChange("other_yearly_income", value)}
          value={income.other_yearly_income}
        />
        <TaxInput
          infoTooltip={
            <>
              <strong>Total amount invested this year in tax-saving instruments.</strong>
              <p>
                Life insurance, provident fund, stocks, mutual funds, government savings certificates and
                similar.
              </p>
            </>
          }
          inputMode="decimal"
          label="Tax Saving Investments"
          onChange={onTaxSavingInvestmentChange}
          value={taxSavingInvestments}
        />
      </div>
      <p className="wealth-tax-quick-foot">
        <button className="wealth-inline-link wealth-tax-link-button" onClick={onSwitchDetailed} type="button">
          Need more accuracy? Try detailed estimate
        </button>
      </p>
    </div>
  );
}

function DetailedWizard({
  activeStep,
  income,
  investments,
  investmentCategories,
  onCalculate,
  onIncomeChange,
  onInvestmentChange,
  onProfileChange,
  onStepChange,
  onToggleIncomeCard,
  onToggleInvestmentCard,
  plannerConfig,
  profile,
  selectedIncomeCards,
  selectedInvestmentCards,
  taxFreeAllowance,
}: {
  activeStep: WizardStep;
  income: IncomeFormState;
  investments: DetailedInvestmentState;
  investmentCategories: TaxPlannerInvestmentCategoryConfig[];
  onCalculate: () => void;
  onIncomeChange: (key: IncomeFormKey, value: string) => void;
  onInvestmentChange: (key: keyof DetailedInvestmentState, value: string) => void;
  onProfileChange: (profile: TaxPlannerProfileState) => void;
  onStepChange: (step: WizardStep) => void;
  onToggleIncomeCard: (cardId: string) => void;
  onToggleInvestmentCard: (cardId: string) => void;
  plannerConfig?: TaxPlannerConfigResponse;
  profile: TaxPlannerProfileState;
  selectedIncomeCards: string[];
  selectedInvestmentCards: string[];
  taxFreeAllowance?: string | number | null;
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
          <AboutYouStep
            onProfileChange={onProfileChange}
            profile={profile}
            taxFreeAllowance={taxFreeAllowance}
          />
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
            investmentCategories={investmentCategories}
            investments={investments}
            onInvestmentChange={onInvestmentChange}
            onToggleInvestmentCard={onToggleInvestmentCard}
            plannerConfig={plannerConfig}
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

const RESIDENCE_DEFAULT_LABEL = MINIMUM_TAX_AREA_OPTIONS[2].label;

function ResidenceLocationSelect({
  onChange,
  value,
}: {
  onChange: (locationCode: string) => void;
  value: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const normalizedValue = value === "RURAL" ? "" : value;

  const options = MINIMUM_TAX_AREA_OPTIONS;

  const selectedLabel =
    options.find((option) => option.value === normalizedValue)?.label ?? RESIDENCE_DEFAULT_LABEL;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) {
        details.open = false;
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function handleSelect(locationCode: string) {
    onChange(locationCode);
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }

  return (
    <details className="wealth-tax-about-location" ref={detailsRef}>
      <summary className="wealth-tax-about-location-trigger">
        <span className="wealth-tax-about-location-value">{selectedLabel}</span>
        <span aria-hidden="true" className="wealth-tax-about-location-chevron">
          ▾
        </span>
      </summary>
      <div className="wealth-tax-about-location-menu" role="listbox">
        {options.map((option) => {
          const isSelected = option.value === normalizedValue;
          return (
            <button
              aria-selected={isSelected}
              className={`wealth-tax-about-location-option ${isSelected ? "wealth-tax-about-location-option-active" : ""}`}
              key={option.value || "outside-city"}
              onClick={() => handleSelect(option.value)}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function AboutYouStep({
  onProfileChange,
  profile,
  taxFreeAllowance,
}: {
  onProfileChange: (profile: TaxPlannerProfileState) => void;
  profile: TaxPlannerProfileState;
  taxFreeAllowance?: string | number | null;
}) {
  function handleCategoryToggle(categoryId: TaxpayerCategoryId) {
    onProfileChange(applyTaxpayerCategoryToggle(profile, categoryId));
  }

  const allowanceAmount = taxFreeAllowance != null ? toNumber(taxFreeAllowance) : null;
  const allowanceInsight = buildAboutAllowanceInsight(
    buildProfilePayload(profile),
    allowanceAmount ?? 0,
  );

  return (
    <div className="wealth-tax-step-content wealth-tax-step-content--about">
      <div className="wealth-tax-workspace-head wealth-tax-workspace-head--about">
        <h2>Tell us about yourself</h2>
        <p className="wealth-muted-copy">Your tax area and any special categories shape this estimate.</p>
      </div>

      <div className="wealth-tax-about-stack">
        <div className="wealth-tax-about-card-grid">
          <div className="wealth-tax-about-field wealth-tax-about-tax-area-cell">
            <span className="wealth-tax-about-field-label-row">
              <span className="wealth-tax-about-field-label">Tax Area</span>
              <TaxInfoTooltip ariaLabel="Tax area" title="Tax area">
                Used to determine minimum tax rules.
              </TaxInfoTooltip>
            </span>
            <ResidenceLocationSelect
              onChange={(locationCode) => onProfileChange({ ...profile, location_code: locationCode })}
              value={profile.location_code}
            />
          </div>

          <div className="wealth-tax-about-categories-heading">
            <span className="wealth-tax-about-field-label">
              Special Taxpayer Categories{" "}
              <span className="wealth-tax-about-field-label-meta">(optional - select if applicable)</span>
            </span>
          </div>

          <div className="wealth-tax-taxpayer-list" role="group" aria-label="Special taxpayer categories">
            {TAXPAYER_CATEGORY_CARDS.map((category) => {
              const isActive = isTaxpayerCategorySelected(profile, category.id);
              return (
                <button
                  aria-label={category.ariaLabel}
                  aria-pressed={isActive}
                  className={`wealth-tax-taxpayer-card ${isActive ? "wealth-tax-taxpayer-card-active" : ""}`}
                  key={category.id}
                  onClick={() => handleCategoryToggle(category.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="wealth-tax-taxpayer-card-icon-box">
                    {category.icon}
                  </span>
                  <span className="wealth-tax-taxpayer-card-copy">
                    <span className="wealth-tax-taxpayer-card-title">{category.title}</span>
                    <span className="wealth-tax-taxpayer-card-subtitle">{category.subtitle}</span>
                  </span>
                  <span className="wealth-tax-taxpayer-card-check" aria-hidden="true">
                    {isActive ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside aria-live="polite" className="wealth-tax-about-allowance-insight">
          <p className="wealth-tax-about-allowance-insight-line">
            <span>✅ {allowanceInsight.headline}</span>
            <span aria-hidden="true" className="wealth-tax-about-allowance-insight-sep">
              ·
            </span>
            <span>
              Tax-free allowance:{" "}
              <strong>{allowanceAmount != null ? formatWealthCurrency(allowanceAmount) : "—"}</strong>
            </span>
          </p>
        </aside>
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
  income: IncomeFormState;
  onIncomeChange: (key: IncomeFormKey, value: string) => void;
  onToggleIncomeCard: (cardId: string) => void;
  selectedIncomeCards: string[];
}) {
  return (
    <div className="wealth-tax-step-content">
      <div className="wealth-tax-workspace-head wealth-tax-workspace-head--income">
        <h2>How do you earn money?</h2>
        <p className="wealth-muted-copy">Pick what applies — yearly amounts only.</p>
      </div>
      <div className="wealth-tax-card-grid wealth-tax-card-grid--income">
        {INCOME_CARDS.map((card) => {
          const isSelected = selectedIncomeCards.includes(card.id);
          return (
            <article
              className={`wealth-tax-select-card wealth-tax-income-card ${isSelected ? "wealth-tax-select-card-active" : ""}`}
              key={card.id}
            >
              <button
                aria-expanded={isSelected}
                aria-label={`${card.title}. ${isSelected ? "Collapse" : "Expand"} details.`}
                className="wealth-tax-income-card-toggle"
                onClick={() => onToggleIncomeCard(card.id)}
                type="button"
              >
                <span className="wealth-tax-income-card-icon" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="wealth-tax-income-card-title">{card.title}</span>
                <span className="wealth-tax-select-check" aria-hidden="true">
                  {isSelected ? "−" : "+"}
                </span>
              </button>
              <div className={`wealth-tax-income-card-body${isSelected ? " is-open" : ""}`}>
                <div className="wealth-tax-income-card-fields">
                  {card.fields.map((field) => (
                    <TaxInput
                      compact
                      key={field.key}
                      label={field.label}
                      onChange={(value) => onIncomeChange(field.key, value)}
                      placeholder={field.placeholder}
                      value={income[field.key]}
                    />
                  ))}
                </div>
                <p className="wealth-tax-income-card-coverage">
                  <span aria-hidden="true" className="wealth-tax-income-card-coverage-icon">
                    i
                  </span>
                  <span className="wealth-tax-income-card-coverage-text">{card.helper}</span>
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function InvestmentStep({
  income,
  investmentCategories,
  investments,
  onInvestmentChange,
  onToggleInvestmentCard,
  plannerConfig,
  selectedInvestmentCards,
}: {
  income: IncomeFormState;
  investmentCategories: TaxPlannerInvestmentCategoryConfig[];
  investments: DetailedInvestmentState;
  onInvestmentChange: (key: keyof DetailedInvestmentState, value: string) => void;
  onToggleInvestmentCard: (cardId: string) => void;
  plannerConfig?: TaxPlannerConfigResponse;
  selectedInvestmentCards: string[];
}) {
  const tips = useMemo(
    () => buildInvestmentTips(plannerConfig, sumStateValues(income)),
    [plannerConfig, income],
  );
  const cards = investmentCategories.length
    ? investmentCategories
    : INVESTMENT_FIELD_KEYS.map((key, index) => ({
        category_key: key,
        display_label: key,
        icon: "💰",
        sort_order: index + 1,
      }));

  return (
    <div className="wealth-tax-step-content">
      <div className="wealth-tax-workspace-head">
        <h2>How do you save or invest?</h2>
        <p className="wealth-muted-copy">Tap + to add yearly amounts for eligible investments.</p>
      </div>

      <InvestmentKnowHow tips={tips} />

      <div className="wealth-tax-investment-list">
        {cards.map((card) => {
          const isSelected = selectedInvestmentCards.includes(card.category_key);
          const amountId = `tax-investment-${card.category_key}`;
          return (
            <div
              className={`wealth-tax-investment-tile ${isSelected ? "wealth-tax-investment-tile-active" : ""}`}
              key={card.category_key}
            >
              <div className="wealth-tax-investment-tile-head">
                <span className="wealth-tax-investment-icon" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="wealth-tax-investment-name">{card.display_label}</span>
                <button
                  aria-expanded={isSelected}
                  aria-label={`${card.display_label}. ${isSelected ? "Remove" : "Add"} amount.`}
                  className="wealth-tax-investment-action"
                  onClick={() => onToggleInvestmentCard(card.category_key)}
                  type="button"
                >
                  {isSelected ? "−" : "+"}
                </button>
              </div>
              {isSelected ? (
                <div className="wealth-tax-investment-amount">
                  <input
                    aria-label={`${card.display_label} yearly amount`}
                    id={amountId}
                    inputMode="decimal"
                    onChange={(event) =>
                      onInvestmentChange(
                        card.category_key as keyof DetailedInvestmentState,
                        event.target.value,
                      )
                    }
                    placeholder="Yearly amount"
                    type="text"
                    value={investments[card.category_key as keyof DetailedInvestmentState]}
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
  income: IncomeFormState;
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
          <span className="wealth-tax-story-label">Target Investment for Max Rebate</span>
          <strong>{formatWealthCurrency(baseResult.required_investment_for_full_rebate)}</strong>
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
          <span className="wealth-tax-stat-pill-label">
            Effective rate
            <TaxInfoTooltip ariaLabel="How effective tax rate is calculated" title="Final tax divided by total income.">
              Final tax divided by total income.
            </TaxInfoTooltip>
          </span>
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
  plannerConfig,
  sectionRef,
  simResult,
}: {
  additionalInvestment: number;
  baseResult: TaxPlannerCalculateResponse;
  onChange: (value: number) => void;
  plannerConfig?: TaxPlannerConfigResponse | null;
  sectionRef?: React.RefObject<HTMLElement | null>;
  simResult: TaxPlannerCalculateResponse;
}) {
  const [draftAdditional, setDraftAdditional] = useState(additionalInvestment);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraftAdditional(additionalInvestment);
  }, [additionalInvestment]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  function handleAdditionalChange(value: number) {
    const normalized = normalizeAdditionalInvestment(value, sliderMax, sliderStep);
    setDraftAdditional(normalized);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => onChange(normalized), SIMULATION_DEBOUNCE_MS);
  }

  function flushAdditionalChange(value: number) {
    const normalized = normalizeAdditionalInvestment(value, sliderMax, sliderStep);
    setDraftAdditional(normalized);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    onChange(normalized);
  }

  const activeResult = additionalInvestment > 0 ? simResult : baseResult;
  const currentTax = toNumber(baseResult.final_tax);
  const currentInvestment = toNumber(baseResult.current_investment);
  const requiredInvestment = toNumber(baseResult.required_investment_for_full_rebate);
  const additionalNeeded = toNumber(activeResult.additional_investment_needed);
  const maximumAvailableRebate = toNumber(baseResult.maximum_available_rebate);
  const currentRebate = toNumber(baseResult.rebate);
  const additionalTaxSaving = toNumber(activeResult.potential_additional_tax_saving);
  const baseUtilizationPct = Math.round(toNumber(baseResult.rebate_utilization_pct));
  const projectedUtilizationPct = Math.round(toNumber(simResult.rebate_utilization_pct));
  const simulationCap = Math.max(0, toNumber(baseResult.additional_investment_needed));
  const sliderMax = Math.round(simulationCap);
  const sliderStep = getAdditionalInvestmentSliderStep(sliderMax);
  const simulatedAdditional = Math.min(sliderMax, draftAdditional);
  const isSimulating = simulatedAdditional > 0;
  const heroUtilizationPct = isSimulating && additionalInvestment > 0 ? projectedUtilizationPct : baseUtilizationPct;
  const projectedRebate = toNumber(simResult.rebate);
  const projectedTax = toNumber(simResult.final_tax);
  const projectedTaxSaving = Math.max(0, currentTax - projectedTax);
  const totalSimulatedInvestment = currentInvestment + simulatedAdditional;
  const sliderRatio = sliderMax > 0 ? simulatedAdditional / sliderMax : 0;
  const sliderMarkers = useMemo(() => buildAdditionalInvestmentMarkers(sliderMax), [sliderMax]);
  const targetAchieved = requiredInvestment > 0 && currentInvestment >= requiredInvestment - 0.01;
  const projectedRebateMaxed =
    isSimulating && additionalInvestment > 0 && (projectedUtilizationPct >= 100 || toNumber(simResult.additional_investment_needed) <= 0);
  const currentRebateMaxed = baseUtilizationPct >= 100 || toNumber(baseResult.additional_investment_needed) <= 0;
  const rebateMaxed = isSimulating && additionalInvestment > 0 ? projectedRebateMaxed : currentRebateMaxed;

  return (
    <section
      className="wealth-tax-play wealth-tax-play-compact wealth-panel"
      id="tax-planner-play-explore"
      ref={sectionRef}
      tabIndex={-1}
    >
      <div className="wealth-tax-play-head">
        <h2>What If I Invest More?</h2>
      </div>

      <div className="wealth-tax-play-layout wealth-tax-play-layout-compact">
        <aside className="wealth-tax-play-aside">
          <SavingsJar compact fillPercent={heroUtilizationPct} label={`${heroUtilizationPct}% rebate utilization`} />
          <div className="wealth-tax-play-aside-investment">
            <div className="wealth-tax-play-aside-row wealth-tax-play-aside-row--current">
              <span>Current Investment</span>
              <strong>{formatWealthCurrency(currentInvestment)}</strong>
            </div>
            <div className="wealth-tax-play-aside-row wealth-tax-play-aside-row--target">
              <span>{targetAchieved ? "Required Investment" : "Target Investment"}</span>
              <strong>{formatWealthCurrency(requiredInvestment)}</strong>
            </div>
            {targetAchieved ? <p className="wealth-tax-target-achieved">✓ Target Achieved</p> : null}
          </div>
        </aside>

        <div className="wealth-tax-play-main">
          <div className="wealth-tax-play-planning">
            {isSimulating ? (
              <>
                <p className="wealth-tax-play-hero-pct">
                  Projected Rebate Utilization: {heroUtilizationPct}%
                </p>
                <p className="wealth-tax-play-hero-context">
                  After investing {formatWealthCurrency(simulatedAdditional)} more
                </p>
              </>
            ) : (
              <>
                <p className="wealth-tax-play-hero-pct">Current Rebate Utilization: {baseUtilizationPct}%</p>
                <p className="wealth-tax-play-hero-context">Based on your current investments today</p>
              </>
            )}
            <div className="wealth-tax-progress-track wealth-tax-progress-track--hero">
              <span style={{ width: `${heroUtilizationPct}%` }} />
            </div>

            <div className="wealth-tax-play-recommendation" role="status">
              {isSimulating && additionalInvestment > 0 && projectedRebateMaxed ? (
                <p>
                  ✓ Projected outcome: full rebate unlocked. Rebate rises to{" "}
                  <strong className="wealth-tax-play-recommendation-save">
                    {formatWealthCurrency(projectedRebate)}
                  </strong>
                  , saving an additional{" "}
                  <strong className="wealth-tax-play-recommendation-save">
                    {formatWealthCurrency(projectedTaxSaving)}
                  </strong>{" "}
                  in tax.
                </p>
              ) : isSimulating ? (
                <p>
                  Invest{" "}
                  <span className="wealth-tax-play-recommendation-invest">
                    {formatWealthCurrency(simulatedAdditional)}
                  </span>{" "}
                  more to get Maximum Rebate{" "}
                  <strong className="wealth-tax-play-recommendation-save">
                    {formatWealthCurrency(maximumAvailableRebate)}
                  </strong>
                </p>
              ) : rebateMaxed ? (
                <p>
                  ✓ Maximum rebate achieved on current investments. You are saving{" "}
                  <strong className="wealth-tax-play-recommendation-save">
                    {formatWealthCurrency(currentRebate)}
                  </strong>{" "}
                  on tax today.
                </p>
              ) : (
                <p>
                  Invest{" "}
                  <span className="wealth-tax-play-recommendation-invest">
                    {formatWealthCurrency(additionalNeeded)}
                  </span>{" "}
                  more to get Maximum Rebate{" "}
                  <strong className="wealth-tax-play-recommendation-save">
                    {formatWealthCurrency(maximumAvailableRebate)}
                  </strong>
                </p>
              )}
            </div>

            <div className="wealth-tax-play-context">
              <div className="wealth-tax-play-context-chips">
                <span className="wealth-tax-play-rebate-chip">
                  <span className="wealth-tax-play-rebate-chip-label">Current Rebate (today)</span>
                  <strong>{formatWealthCurrency(currentRebate)}</strong>
                </span>
                <span className="wealth-tax-play-rebate-chip wealth-tax-play-rebate-chip--max">
                  <span className="wealth-tax-play-rebate-chip-label">Maximum Rebate</span>
                  <strong>{formatWealthCurrency(maximumAvailableRebate)}</strong>
                </span>
              </div>
              <div className="wealth-tax-play-context-meta">
                <ActiveLimiterBadge plannerConfig={plannerConfig} result={baseResult} />
                <RebateBreakdownHint
                  align="end"
                  plannerConfig={plannerConfig}
                  result={baseResult}
                  simulatorMode
                />
              </div>
            </div>
          </div>

          <div className="wealth-tax-play-controls wealth-tax-play-controls-compact">
            <div className="wealth-tax-slider-block wealth-tax-slider-block--compact">
              <div aria-live="polite" className="wealth-tax-slider-summary">
                <span className="wealth-tax-slider-summary-item">
                  <em>Additional Investment</em>
                  <strong>{formatWealthCurrency(simulatedAdditional)}</strong>
                </span>
                <span className="wealth-tax-slider-summary-item wealth-tax-slider-summary-item--total">
                  <em>Total Investment</em>
                  <strong>{formatWealthCurrency(totalSimulatedInvestment)}</strong>
                </span>
              </div>
              <div className="wealth-tax-slider-wrap">
                <div
                  className="wealth-tax-slider-rail"
                  style={{ "--slider-ratio": sliderRatio } as React.CSSProperties}
                >
                  {simulatedAdditional > 0 ? (
                    <span aria-hidden="true" className="wealth-tax-slider-fill" />
                  ) : null}
                  {simulatedAdditional > 0 ? (
                    <span className="wealth-tax-slider-thumb-value">
                      +{formatWealthCurrency(simulatedAdditional)}
                    </span>
                  ) : null}
                  <input
                    aria-label="Additional tax-saving investment to simulate"
                    aria-valuemax={sliderMax}
                    aria-valuemin={0}
                    aria-valuenow={simulatedAdditional}
                    aria-valuetext={formatWealthCurrency(simulatedAdditional)}
                    className="wealth-tax-slider"
                    disabled={sliderMax <= 0}
                    max={sliderMax || 1}
                    min={0}
                    onChange={(event) => handleAdditionalChange(Number(event.target.value))}
                    onPointerUp={(event) => flushAdditionalChange(Number(event.currentTarget.value))}
                    step={sliderStep}
                    type="range"
                    value={simulatedAdditional}
                  />
                </div>
                {sliderMax > 0 ? (
                  <div aria-hidden="true" className="wealth-tax-slider-markers">
                    {sliderMarkers.map((marker) => (
                      <span
                        className={`wealth-tax-slider-marker wealth-tax-slider-marker--${marker.position}${marker.isMax ? " wealth-tax-slider-marker--max" : ""}`}
                        key={`${marker.position}-${marker.label}`}
                        style={{ left: `${marker.percent}%` }}
                        title={
                          marker.isMax
                            ? `Maximum additional investment for full rebate: ${formatWealthCurrency(sliderMax)}`
                            : formatWealthCurrency(marker.value)
                        }
                      >
                        <span className="wealth-tax-slider-marker-tick" />
                        <span className="wealth-tax-slider-marker-label">{marker.label}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="wealth-tax-play-metrics wealth-tax-play-metrics-action">
            <div className="wealth-tax-play-metric wealth-tax-metric-current">
              <span>Current Tax</span>
              <strong>{formatWealthCurrency(currentTax)}</strong>
            </div>
            <div className="wealth-tax-play-metric wealth-tax-metric-saved">
              <span>Additional Investment Needed</span>
              <strong>{formatWealthCurrency(additionalNeeded)}</strong>
            </div>
            <div className="wealth-tax-play-metric wealth-tax-metric-unlocked">
              <span>Additional Tax Saving</span>
              <strong>{formatWealthCurrency(additionalTaxSaving)}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TaxJourney({
  onExploreSavings,
  result,
}: {
  onExploreSavings: () => void;
  result: TaxPlannerCalculateResponse;
}) {
  const grossSalary = toNumber(result.gross_salary);
  const employmentExemption = toNumber(result.employment_income_exemption);
  const taxableSalary = toNumber(result.taxable_salary);
  const totalIncome = toNumber(result.total_income);
  const allowance = toNumber(result.tax_free_allowance);
  const taxableIncome = toNumber(result.taxable_income);
  const rebate = toNumber(result.rebate);
  const finalTax = toNumber(result.final_tax);
  const utilizationPct = Math.round(toNumber(result.rebate_utilization_pct));
  const additionalNeeded = toNumber(result.additional_investment_needed);
  const potentialSaving = toNumber(result.potential_additional_tax_saving);
  const effectiveRate = effectiveTaxRate(finalTax, totalIncome);
  const taxablePct = totalIncome > 0 ? Math.round((taxableIncome / totalIncome) * 100) : 0;
  const taxFreePct = totalIncome > 0 ? Math.max(0, 100 - taxablePct) : 0;

  const insightCards = buildTaxJourneyInsightCards({
    allowance,
    additionalNeeded,
    potentialSaving,
    utilizationPct,
  });

  function handleExploreSavings() {
    onExploreSavings();
  }

  return (
    <section className="wealth-tax-journey-section wealth-panel">
      <header className="wealth-tax-journey-head">
        <p className="wealth-tax-section-eyebrow">Tax Journey</p>
        <h2>Your tax journey, simplified</h2>
        <p className="wealth-tax-journey-subtitle">See how your income becomes your final tax.</p>
      </header>

      <div className="wealth-tax-journey-main">
      <div className="wealth-tax-journey-flow-wrap">
        <div aria-hidden="true" className="wealth-tax-journey-connector" />
        <div className="wealth-tax-journey-flow">
          {JOURNEY_STEPS.map((step, index) => {
            const caption =
              step.key === "employment_income_exemption"
                ? grossSalary > 0
                  ? `min(⅓ salary, cap)`
                  : "No salary income"
                : step.key === "taxable_income"
                ? `${taxablePct}% taxable`
                : step.key === "rebate"
                  ? "Rebate unlocked"
                  : step.key === "final_tax"
                    ? `${formatWealthNumber(effectiveRate)}% of income`
                    : step.caption;

            const displayAmount =
              step.key === "employment_income_exemption"
                ? employmentExemption
                : step.key === "final_tax"
                  ? finalTax
                  : step.key === "rebate"
                    ? rebate
                    : valuesForStep(step.key, result);

            return (
              <div className="wealth-tax-journey-item" key={step.key}>
                <article
                  className={`wealth-tax-journey-node wealth-tax-node-${step.tone} wealth-tax-journey-node-${step.key}${step.key === "final_tax" ? " wealth-tax-journey-node-destination" : ""}`}
                >
                  <span className="wealth-tax-journey-icon-wrap" aria-hidden="true">
                    <span className="wealth-tax-journey-icon">{step.icon}</span>
                  </span>
                  <span className="wealth-tax-journey-label">{step.label}</span>

                  {step.key === "rebate" ? (
                    <strong className="wealth-tax-journey-amount wealth-tax-journey-rebate-saved">
                      {formatWealthCurrency(rebate)} Saved
                    </strong>
                  ) : step.key === "employment_income_exemption" ? (
                    <strong className="wealth-tax-journey-amount wealth-tax-journey-exemption-amount">
                      −{formatWealthCurrency(employmentExemption)}
                    </strong>
                  ) : (
                    <strong
                      className={`wealth-tax-journey-amount${step.key === "final_tax" ? " wealth-tax-journey-final-amount" : ""}`}
                    >
                      {formatWealthCurrency(displayAmount)}
                    </strong>
                  )}

                  <div className="wealth-tax-journey-visual-slot">
                    <JourneyCardVisual
                      employmentExemption={employmentExemption}
                      grossSalary={grossSalary}
                      rebatePct={utilizationPct}
                      stepKey={step.key}
                      taxFreePct={taxFreePct}
                      taxablePct={taxablePct}
                      taxableSalary={taxableSalary}
                    />
                  </div>

                  <p
                    className={`wealth-tax-journey-caption${caption ? "" : " wealth-tax-journey-caption-empty"}`}
                  >
                    {caption || "\u00A0"}
                  </p>
                </article>
                {index < JOURNEY_STEPS.length - 1 ? (
                  <span aria-hidden="true" className="wealth-tax-journey-arrow-node">
                    <span className="wealth-tax-journey-arrow-glow" />
                    <span className="wealth-tax-journey-arrow-icon">→</span>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="wealth-tax-journey-metrics" role="list">
        <article className="wealth-tax-journey-metric wealth-tax-journey-metric-income" role="listitem">
          <span className="wealth-tax-journey-metric-icon-wrap" aria-hidden="true">
            <span className="wealth-tax-journey-metric-icon">💰</span>
          </span>
          <div className="wealth-tax-journey-metric-body">
            <span className="wealth-tax-journey-metric-label">Income</span>
            <strong>{formatWealthCurrency(totalIncome)}</strong>
          </div>
        </article>
        <article className="wealth-tax-journey-metric wealth-tax-journey-metric-saved" role="listitem">
          <span className="wealth-tax-journey-metric-icon-wrap" aria-hidden="true">
            <span className="wealth-tax-journey-metric-icon">🎯</span>
          </span>
          <div className="wealth-tax-journey-metric-body">
            <span className="wealth-tax-journey-metric-label">Tax Saved</span>
            <strong>{formatWealthCurrency(rebate)}</strong>
          </div>
        </article>
        <article className="wealth-tax-journey-metric wealth-tax-journey-metric-pay" role="listitem">
          <span className="wealth-tax-journey-metric-icon-wrap" aria-hidden="true">
            <span className="wealth-tax-journey-metric-icon">🧾</span>
          </span>
          <div className="wealth-tax-journey-metric-body">
            <span className="wealth-tax-journey-metric-label">You Pay</span>
            <strong>{formatWealthCurrency(finalTax)}</strong>
          </div>
        </article>
        <article className="wealth-tax-journey-metric wealth-tax-journey-metric-rate" role="listitem">
          <span className="wealth-tax-journey-metric-icon-wrap" aria-hidden="true">
            <span className="wealth-tax-journey-metric-icon">📊</span>
          </span>
          <div className="wealth-tax-journey-metric-body">
            <span className="wealth-tax-journey-metric-label">Effective Tax Rate</span>
            <strong>{formatWealthNumber(effectiveRate)}%</strong>
          </div>
        </article>
      </div>
      </div>

      <div className="wealth-tax-journey-insights-block">
        <p className="wealth-tax-section-eyebrow wealth-tax-journey-insights-eyebrow">
          <span aria-hidden="true">💡</span> Smart Insights
        </p>
        <div className="wealth-tax-journey-insights-layout">
          <div className="wealth-tax-journey-insights-grid">
            {insightCards.map((card) => (
              <article className={`wealth-tax-journey-insight-card wealth-tax-journey-insight-${card.tone}`} key={card.id}>
                <span className="wealth-tax-journey-insight-icon-wrap" aria-hidden="true">
                  <span className="wealth-tax-journey-insight-icon">{card.icon}</span>
                </span>
                <div className="wealth-tax-journey-insight-body">
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </div>
              </article>
            ))}
          </div>
          <button className="wealth-tax-journey-cta" onClick={handleExploreSavings} type="button">
            Explore More Savings
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function valuesForStep(stepKey: (typeof JOURNEY_STEPS)[number]["key"], result: TaxPlannerCalculateResponse) {
  switch (stepKey) {
    case "gross_salary":
      return result.gross_salary;
    case "employment_income_exemption":
      return result.employment_income_exemption;
    case "taxable_salary":
      return result.taxable_salary;
    case "total_income":
      return result.total_income;
    case "tax_free_allowance":
      return result.tax_free_allowance;
    case "taxable_income":
      return result.taxable_income;
    case "gross_tax":
      return result.gross_tax;
    default:
      return 0;
  }
}

function buildTaxJourneyInsightCards({
  allowance,
  additionalNeeded,
  potentialSaving,
  utilizationPct,
}: {
  allowance: number;
  additionalNeeded: number;
  potentialSaving: number;
  utilizationPct: number;
}): Array<{
  id: string;
  icon: string;
  tone: "positive" | "warning";
  title: string;
  body: ReactNode;
}> {
  const hasRoom = additionalNeeded > 0 && potentialSaving > 0;

  return [
    {
      id: "biggest-saver",
      icon: "⭐",
      tone: "positive",
      title: "Biggest Tax Saver",
      body: (
        <>
          Tax-free allowance protected <strong>{formatWealthCurrency(allowance)}</strong> from tax.
        </>
      ),
    },
    {
      id: "unlock-more",
      icon: "🎯",
      tone: "warning",
      title: "Unlock More Savings",
      body: hasRoom ? (
        <>
          Invest <strong>{formatWealthCurrency(additionalNeeded)}</strong> more to save{" "}
          <strong>{formatWealthCurrency(potentialSaving)}</strong>.
        </>
      ) : (
        <>Maximum rebate unlocked under current limits.</>
      ),
    },
    {
      id: "rebate-progress",
      icon: "🌱",
      tone: "positive",
      title: "Rebate Progress",
      body: (
        <>
          Unlocked <strong>{utilizationPct}%</strong> of available rebate.
        </>
      ),
    },
  ];
}

function JourneyCardVisual({
  employmentExemption,
  grossSalary,
  rebatePct,
  stepKey,
  taxFreePct,
  taxablePct,
  taxableSalary,
}: {
  employmentExemption: number;
  grossSalary: number;
  rebatePct: number;
  stepKey: (typeof JOURNEY_STEPS)[number]["key"];
  taxFreePct: number;
  taxablePct: number;
  taxableSalary: number;
}) {
  switch (stepKey) {
    case "gross_salary":
      return (
        <div aria-hidden="true" className="wealth-tax-journey-visual wealth-tax-journey-visual-gross-salary">
          <span />
        </div>
      );
    case "employment_income_exemption": {
      const exemptionPct = grossSalary > 0 ? Math.round((employmentExemption / grossSalary) * 100) : 0;
      return (
        <div
          aria-hidden="true"
          className="wealth-tax-journey-visual wealth-tax-journey-visual-exemption"
          title={`${exemptionPct}% of gross salary exempted`}
        >
          <span style={{ width: `${Math.min(100, Math.max(0, exemptionPct))}%` }} />
        </div>
      );
    }
    case "taxable_salary": {
      const taxableSalaryPct = grossSalary > 0 ? Math.round((taxableSalary / grossSalary) * 100) : 0;
      return (
        <div aria-hidden="true" className="wealth-tax-journey-visual wealth-tax-journey-visual-taxable-salary">
          <span style={{ width: `${Math.min(100, Math.max(0, taxableSalaryPct))}%` }} />
        </div>
      );
    }
    case "total_income":
      return (
        <div
          aria-hidden="true"
          className="wealth-tax-journey-visual wealth-tax-journey-visual-income-split"
          title={`${taxFreePct}% tax-free · ${taxablePct}% taxable`}
        >
          <span style={{ flex: `${Math.max(taxFreePct, 0)} 1 0` }} />
          <span style={{ flex: `${Math.max(taxablePct, 0)} 1 0` }} />
        </div>
      );
    case "tax_free_allowance":
      return (
        <div aria-hidden="true" className="wealth-tax-journey-visual wealth-tax-journey-visual-shield">
          <span />
        </div>
      );
    case "taxable_income":
      return (
        <div aria-hidden="true" className="wealth-tax-journey-visual wealth-tax-journey-visual-taxable">
          <span style={{ width: `${Math.min(100, Math.max(0, taxablePct))}%` }} />
        </div>
      );
    case "gross_tax":
      return (
        <div aria-hidden="true" className="wealth-tax-journey-visual wealth-tax-journey-visual-slabs">
          <span className="wealth-tax-journey-slab wealth-tax-journey-slab-1" />
          <span className="wealth-tax-journey-slab wealth-tax-journey-slab-2" />
          <span className="wealth-tax-journey-slab wealth-tax-journey-slab-3" />
          <span className="wealth-tax-journey-slab wealth-tax-journey-slab-4" />
        </div>
      );
    case "rebate":
      return <RebateProgressRing percent={rebatePct} />;
    case "final_tax":
      return (
        <div aria-hidden="true" className="wealth-tax-journey-visual wealth-tax-journey-visual-destination">
          <span className="wealth-tax-journey-destination-doc">🧾</span>
          <span className="wealth-tax-journey-destination-check">✓</span>
        </div>
      );
    default:
      return null;
  }
}

function RebateProgressRing({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div aria-hidden="true" className="wealth-tax-journey-rebate-ring">
      <svg viewBox="0 0 60 60">
        <circle className="wealth-tax-journey-rebate-ring-track" cx="30" cy="30" r={radius} />
        <circle
          className="wealth-tax-journey-rebate-ring-fill"
          cx="30"
          cy="30"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 30 30)"
        />
      </svg>
      <span>{clamped}%</span>
    </div>
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
  compact = false,
  helper,
  hint,
  infoTooltip,
  inputMode = "decimal",
  label,
  onChange,
  placeholder = "0",
  value,
}: {
  compact?: boolean;
  helper?: string;
  hint?: string;
  infoTooltip?: ReactNode;
  inputMode?: "decimal" | "numeric" | "text";
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const inputId = `tax-input-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div className={`wealth-field${compact ? " wealth-field--compact" : ""}`}>
      <div className="wealth-field-label-row">
        <label className="wealth-field-label" htmlFor={inputId}>
          {label}
        </label>
        {infoTooltip ? (
          <TaxInfoTooltip ariaLabel={`More about ${label}`}>{infoTooltip}</TaxInfoTooltip>
        ) : null}
      </div>
      <input
        aria-describedby={helper ? `${inputId}-helper` : hint ? `${inputId}-hint` : undefined}
        id={inputId}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
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
    </div>
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
  income: IncomeFormState,
  investments: DetailedInvestmentState,
  quickTaxSavingInvestments: string,
  simulationAdditionalInvestment: number,
): TaxPlannerCalculateRequest {
  return {
    mode,
    profile: mode === "QUICK" ? QUICK_PROFILE : buildProfilePayload(profile),
    income: buildIncomePayload(mode, income),
    investments: buildInvestmentPayload(mode, investments, quickTaxSavingInvestments, simulationAdditionalInvestment),
  };
}

function buildIncomePayload(mode: TaxPlannerMode, income: IncomeFormState): TaxPlannerIncomeInput {
  const employmentIncome = toNumber(income.employment_income);

  if (mode === "QUICK") {
    return {
      ...zeroIncomePayload(),
      annual_salary: employmentIncome,
      other_yearly_income: toNumber(income.other_yearly_income),
    };
  }

  const depositSavingsIncome = toNumber(income.deposit_savings_income);
  const otherTaxableIncome = toNumber(income.other_income);

  return {
    annual_salary: employmentIncome,
    other_yearly_income: toNumber(income.other_yearly_income),
    festival_bonus: 0,
    other_employment_benefits: 0,
    self_employment_income: toNumber(income.self_employment_income),
    rental_income: 0,
    bank_interest: depositSavingsIncome,
    fdr_profit: 0,
    dps_profit: 0,
    sanchayapatra_profit: 0,
    dividend_income: 0,
    other_income: otherTaxableIncome,
  };
}

function normalizeIncomeDraft(income: Partial<IncomeFormState> & Partial<NumericInputState<TaxPlannerIncomeInput>>): IncomeFormState {
  const legacyDepositTotal =
    toNumber(income.bank_interest) +
    toNumber(income.fdr_profit) +
    toNumber(income.dps_profit) +
    toNumber(income.sanchayapatra_profit);
  const hasLegacyEmploymentSplit = income.festival_bonus != null || income.other_employment_benefits != null;
  const employmentIncome =
    income.employment_income != null
      ? toNumber(income.employment_income)
      : hasLegacyEmploymentSplit
        ? toNumber(income.annual_salary) + toNumber(income.festival_bonus) + toNumber(income.other_employment_benefits)
        : toNumber(income.annual_salary ?? DEFAULT_INCOME.employment_income);
  const hasLegacyRentalOrDividend = income.rental_income != null || income.dividend_income != null;
  const otherTaxableIncome = hasLegacyRentalOrDividend
    ? toNumber(income.other_income) + toNumber(income.rental_income) + toNumber(income.dividend_income)
    : toNumber(income.other_income ?? DEFAULT_INCOME.other_income);

  return {
    employment_income: String(employmentIncome),
    other_yearly_income: income.other_yearly_income ?? DEFAULT_INCOME.other_yearly_income,
    self_employment_income: income.self_employment_income ?? DEFAULT_INCOME.self_employment_income,
    deposit_savings_income:
      income.deposit_savings_income ?? (legacyDepositTotal > 0 ? String(legacyDepositTotal) : DEFAULT_INCOME.deposit_savings_income),
    other_income: String(otherTaxableIncome),
  };
}

function normalizeSelectedIncomeCards(cardIds: string[]): string[] {
  const removedIds = new Set(["rental", "dividend"]);
  const normalized = cardIds.filter((id) => !removedIds.has(id));

  if (cardIds.some((id) => removedIds.has(id)) && !normalized.includes("other")) {
    normalized.push("other");
  }

  return normalized.length > 0 ? normalized : ["salary"];
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
    age: null,
    senior_citizen: profile.senior_citizen,
    person_with_disability: profile.person_with_disability,
    freedom_fighter: profile.freedom_fighter,
    location_code: profile.location_code || null,
  };
}

function zeroIncomePayload(): TaxPlannerIncomeInput {
  return {
    annual_salary: 0,
    other_yearly_income: 0,
    festival_bonus: 0,
    other_employment_benefits: 0,
    self_employment_income: 0,
    rental_income: 0,
    bank_interest: 0,
    fdr_profit: 0,
    dps_profit: 0,
    sanchayapatra_profit: 0,
    dividend_income: 0,
    other_income: 0,
  };
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

function scrollToRebateSection(targetRef: React.RefObject<HTMLElement | null>) {
  const element = targetRef.current;
  if (!element) {
    return;
  }

  const headerOffset = 88;
  const top = element.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  window.setTimeout(() => {
    element.focus({ preventScroll: true });
  }, 400);
}

function effectiveTaxRate(finalTax: string | number, totalIncome: string | number) {
  const income = toNumber(totalIncome);
  if (income <= 0) {
    return 0;
  }
  return Math.round((toNumber(finalTax) / income) * 10000) / 100;
}

function normalizeProfileDraft(profile: TaxPlannerProfileState & { age?: string }): TaxPlannerProfileState {
  const gender =
    profile.gender === "OTHER" || profile.gender === "PREFER_NOT_TO_SAY" ? "MALE" : profile.gender;
  const location_code = profile.location_code === "RURAL" ? "" : profile.location_code;

  return {
    resident_individual: profile.resident_individual ?? true,
    gender,
    senior_citizen: profile.senior_citizen ?? false,
    person_with_disability: profile.person_with_disability ?? false,
    freedom_fighter: profile.freedom_fighter ?? false,
    location_code,
  };
}

function isTaxpayerCategorySelected(profile: TaxPlannerProfileState, categoryId: TaxpayerCategoryId) {
  if (categoryId === "woman") {
    return profile.gender === "FEMALE";
  }
  return profile[categoryId];
}

function applyTaxpayerCategoryToggle(
  profile: TaxPlannerProfileState,
  categoryId: TaxpayerCategoryId,
): TaxPlannerProfileState {
  if (categoryId === "woman") {
    return { ...profile, gender: profile.gender === "FEMALE" ? "MALE" : "FEMALE" };
  }
  return { ...profile, [categoryId]: !profile[categoryId] };
}

function getMinimumTaxAreaLabel(locationCode: string) {
  const normalizedCode = locationCode === "RURAL" ? "" : locationCode;
  return (
    MINIMUM_TAX_AREA_OPTIONS.find((option) => option.value === normalizedCode)?.label ??
    MINIMUM_TAX_AREA_OPTIONS[2].label
  );
}

function profileSummary(profile: TaxPlannerProfileState) {
  const parts: string[] = [];

  if (profile.gender === "FEMALE") {
    parts.push("Woman Taxpayer");
  }
  if (profile.senior_citizen) {
    parts.push("Senior Citizen (65 or more)");
  }
  if (profile.person_with_disability) {
    parts.push("Person with Disability");
  }
  if (profile.freedom_fighter) {
    parts.push("Freedom Fighter");
  }
  if (parts.length === 0) {
    parts.push("General taxpayer");
  }

  parts.push(getMinimumTaxAreaLabel(profile.location_code));
  return parts.join(" · ");
}

function sumStateValues(values: Record<string, string>) {
  return Object.values(values).reduce((sum, value) => sum + toNumber(value), 0);
}

function toNumber(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function buildInvestmentTips(config: TaxPlannerConfigResponse | undefined, taxableIncome: number) {
  const rebate = config?.investment_rebate;
  const incomeLimitPct = rebate ? toNumber(rebate.taxable_income_limit_pct) : 3;
  const investmentRebatePct = rebate ? toNumber(rebate.investment_rebate_pct) : 15;
  const maximumRebate = rebate ? toNumber(rebate.maximum_rebate_amount) : 1_000_000;
  const incomeLimitRebate = taxableIncome * (incomeLimitPct / 100);
  const maxAvailableRebate = Math.min(incomeLimitRebate, maximumRebate);

  return [
    {
      id: "income-limit",
      icon: "📊",
      summary: `Rebate capped at ${incomeLimitPct}% of taxable income`,
      detail: `Your maximum rebate from the income limit is about ${formatWealthCurrency(maxAvailableRebate)} before investment and gross tax caps apply.`,
    },
    {
      id: "rebate-rate",
      icon: "🌱",
      summary: `${investmentRebatePct}% rebate on total investment`,
      detail: `Bangladesh allows up to ${investmentRebatePct}% of your total tax-saving investment as a rebate. The final amount is the lowest applicable limit.`,
    },
    {
      id: "mix-types",
      icon: "🧩",
      summary: "You can mix PF, insurance, stocks, funds & savings",
      detail: "Provident fund, life insurance, stocks, mutual funds, DPS, and Sanchayapatra can count together toward your yearly eligible total.",
    },
    ...(taxableIncome > 0 && investmentRebatePct > 0
      ? [
          {
            id: "your-target",
            icon: "🎯",
            summary: `Full rebate may need ~${formatWealthCurrency(maxAvailableRebate / (investmentRebatePct / 100))} investment`,
            detail: `Based on taxable income entered so far, investing about ${formatWealthCurrency(maxAvailableRebate / (investmentRebatePct / 100))} in eligible instruments could unlock the maximum rebate available under current limits.`,
          },
        ]
      : []),
  ];
}
