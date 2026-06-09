"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { MetricCard } from "@/components/ui/metric-card";
import { SnapshotEntryList } from "@/features/wealth/components/snapshot-entry-list";
import { WealthInsightCard } from "@/features/wealth/components/wealth-insight-card";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { useMoneySnapshot } from "@/features/wealth/hooks/use-money-snapshot";
import { useWealthDashboard } from "@/features/wealth/hooks/use-wealth-dashboard";
import { readLocalMoneySnapshot, saveLocalMoneySnapshotDraft } from "@/features/wealth/lib/local-money-snapshot";
import {
  SANCHAYAPATRA_CERTIFICATE_OPTIONS,
  buildSanchayapatraMetadata,
  getSanchayapatraConfig,
} from "@/features/wealth/catalog/sanchayapatra-catalog";
import {
  ensureAssetPlanningDates,
  formatDateLabel,
  metadataValue,
  optionIdForAsset,
  resolveAssetEndDate,
  resolveAssetStartDate,
  setMetadataValue,
  type SnapshotDraftAsset,
  type SnapshotDraftLiability,
} from "@/features/wealth/lib/snapshot-entry-helpers";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { useAuth } from "@/features/auth/context/auth-context";

type SnapshotEntryKind = "asset" | "liability";

type SnapshotEntryOption = {
  id: string;
  kind: SnapshotEntryKind;
  category: string;
  label: string;
  title: string;
  icon: string;
  liquidityTier?: string;
  defaultMetadata?: Record<string, unknown>;
};

type DraftAsset = SnapshotDraftAsset;
type DraftLiability = SnapshotDraftLiability;

const ENTRY_OPTIONS: SnapshotEntryOption[] = [
  { id: "cash", kind: "asset", category: "CASH", label: "Cash", title: "Cash", icon: "💵", liquidityTier: "IMMEDIATE" },
  {
    id: "fdr",
    kind: "asset",
    category: "DEPOSIT",
    label: "FDR",
    title: "FDR",
    icon: "🏦",
    liquidityTier: "LOCKED",
    defaultMetadata: { deposit_type: "fdr", interest_rate: "9", profit_distribution: "maturity" },
  },
  {
    id: "dps",
    kind: "asset",
    category: "DEPOSIT",
    label: "DPS",
    title: "DPS",
    icon: "📅",
    liquidityTier: "LOCKED",
    defaultMetadata: { deposit_type: "dps", interest_rate: "8" },
  },
  {
    id: "sanchayapatra",
    kind: "asset",
    category: "SANCHAYAPATRA",
    label: "Sanchayapatra",
    title: "Sanchayapatra",
    icon: "🇧🇩",
    liquidityTier: "LOCKED",
    defaultMetadata: buildSanchayapatraMetadata("family-savings"),
  },
  { id: "stocks", kind: "asset", category: "STOCK", label: "Stocks", title: "Stocks", icon: "📈", liquidityTier: "SHORT_TERM" },
  {
    id: "gold",
    kind: "asset",
    category: "GOLD",
    label: "Gold",
    title: "Gold",
    icon: "🟡",
    liquidityTier: "SHORT_TERM",
    defaultMetadata: { gold_weight_unit: "gram" },
  },
  { id: "property", kind: "asset", category: "PROPERTY", label: "Property", title: "Property", icon: "🏠", liquidityTier: "ILLIQUID" },
  { id: "loan", kind: "liability", category: "LOAN", label: "Loan", title: "Loan", icon: "💳" },
  { id: "other", kind: "asset", category: "OTHER", label: "Other", title: "Other", icon: "📦", liquidityTier: "SHORT_TERM" },
];

const GOLD_WEIGHT_UNITS = [
  { value: "gram", label: "Gram" },
  { value: "vori", label: "Vori" },
  { value: "tola", label: "Tola" },
  { value: "ounce", label: "Ounce" },
] as const;

function createAssetDraft(option: SnapshotEntryOption): DraftAsset {
  return {
    category: option.category,
    label: option.label,
    value: "",
    liquidity_tier: option.liquidityTier ?? "IMMEDIATE",
    metadata: { ...(option.defaultMetadata ?? {}) },
  };
}

function createLiabilityDraft(option: SnapshotEntryOption): DraftLiability {
  return {
    category: option.category,
    label: option.label,
    balance: "",
    interest_rate: "",
    monthly_emi: "",
    remaining_months: "",
    metadata: {},
  };
}

export function MoneySnapshotDashboardView() {
  const { isAuthenticated } = useAuth();
  const { dashboard } = useWealthDashboard();
  const { snapshot, patchSnapshot, isSaving } = useMoneySnapshot();
  const [monthlySavings, setMonthlySavings] = useState("");
  const [assets, setAssets] = useState<DraftAsset[]>([]);
  const [liabilities, setLiabilities] = useState<DraftLiability[]>([]);
  const [selectedOption, setSelectedOption] = useState<SnapshotEntryOption>(ENTRY_OPTIONS[0]);
  const [assetDraft, setAssetDraft] = useState<DraftAsset>(createAssetDraft(ENTRY_OPTIONS[0]));
  const [liabilityDraft, setLiabilityDraft] = useState<DraftLiability>(createLiabilityDraft(ENTRY_OPTIONS[7]));
  const [showProjectionDetails, setShowProjectionDetails] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && snapshot) {
      setMonthlySavings(String(snapshot.monthly_savings ?? ""));
      setAssets(
        snapshot.assets.map((asset) => ({
          category: asset.category,
          label: asset.label,
          value: String(asset.value),
          liquidity_tier: asset.liquidity_tier,
          metadata: asset.metadata_json ?? {},
        })),
      );
      setLiabilities(
        snapshot.liabilities.map((liability) => ({
          category: liability.category,
          label: liability.label,
          balance: String(liability.balance),
          interest_rate: liability.interest_rate != null ? String(liability.interest_rate) : "",
          monthly_emi: liability.monthly_emi != null ? String(liability.monthly_emi) : "",
          remaining_months: liability.remaining_months != null ? String(liability.remaining_months) : "",
          metadata: liability.metadata_json ?? {},
        })),
      );
      return;
    }

    const draft = readLocalMoneySnapshot();
    setMonthlySavings(String(draft.monthly_savings ?? ""));
    setAssets(
      draft.assets.map((asset) => ({
        category: asset.category,
        label: asset.label,
        value: String(asset.value),
        liquidity_tier: asset.category === "DEPOSIT" || asset.category === "SANCHAYAPATRA" ? "LOCKED" : "IMMEDIATE",
        metadata: asset.metadata ?? {},
      })),
    );
    setLiabilities(
      draft.liabilities.map((liability) => ({
        category: liability.category,
        label: liability.label,
        balance: String(liability.balance),
        interest_rate: liability.interest_rate != null ? String(liability.interest_rate) : "",
        monthly_emi: liability.monthly_emi != null ? String(liability.monthly_emi) : "",
        remaining_months: liability.remaining_months != null ? String(liability.remaining_months) : "",
        metadata: liability.metadata ?? {},
      })),
    );
  }, [isAuthenticated, snapshot]);

  const localTotals = useMemo(() => {
    const totalAssets = assets.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const totalLiabilities = liabilities.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
    return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
  }, [assets, liabilities]);

  const clarityScore = useMemo(() => {
    if (isAuthenticated && dashboard) {
      return dashboard.clarity_score;
    }
    const optionalContext = assets.reduce((sum, asset) => sum + Object.values(asset.metadata).filter(Boolean).length, 0);
    const liabilityContext = liabilities.reduce(
      (sum, liability) =>
        sum +
        [liability.interest_rate, liability.monthly_emi, liability.remaining_months].filter(Boolean).length +
        Object.values(liability.metadata).filter(Boolean).length,
      0,
    );
    return Math.min(
      (assets.length > 0 ? 25 : 0) +
        (liabilities.length > 0 ? 10 : 0) +
        (monthlySavings ? 10 : 0) +
        Math.min((optionalContext + liabilityContext) * 5, 30),
      100,
    );
  }, [assets, dashboard, isAuthenticated, liabilities, monthlySavings]);

  const timelineEvents = useMemo(() => buildTimelineEvents(assets, liabilities), [assets, liabilities]);
  const netWorth = isAuthenticated ? dashboard?.net_worth : localTotals.netWorth;
  const totalAssets = isAuthenticated ? dashboard?.total_assets : localTotals.totalAssets;
  const totalLiabilities = isAuthenticated ? dashboard?.total_liabilities : localTotals.totalLiabilities;

  function handleSelectOption(option: SnapshotEntryOption) {
    setSelectedOption(option);
    setShowProjectionDetails(false);
    if (option.kind === "asset") {
      setAssetDraft(createAssetDraft(option));
    } else {
      setLiabilityDraft(createLiabilityDraft(option));
    }
  }

  function handleAddEntry() {
    if (selectedOption.kind === "asset") {
      if (!assetDraft.value) {
        return;
      }
      const nextAsset = {
        ...assetDraft,
        label: assetDraft.label.trim() || selectedOption.title,
      };
      setAssets((current) => {
        const next = [...current, nextAsset];
        if (!isAuthenticated) {
          persistLocalDraft(next, liabilities);
        }
        return next;
      });
      setAssetDraft(createAssetDraft(selectedOption));
      setShowProjectionDetails(false);
      return;
    }

    if (!liabilityDraft.balance) {
      return;
    }
    const nextLiability = {
      ...liabilityDraft,
      label: liabilityDraft.label.trim() || selectedOption.title,
    };
    setLiabilities((current) => {
      const next = [...current, nextLiability];
      if (!isAuthenticated) {
        persistLocalDraft(assets, next);
      }
      return next;
    });
    setLiabilityDraft(createLiabilityDraft(selectedOption));
    setShowProjectionDetails(false);
  }

  function handleRemoveAsset(index: number) {
    setAssets((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      if (!isAuthenticated) {
        persistLocalDraft(next, liabilities);
      }
      return next;
    });
  }

  function handleRemoveLiability(index: number) {
    setLiabilities((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      if (!isAuthenticated) {
        persistLocalDraft(assets, next);
      }
      return next;
    });
  }

  function handleUpdateAsset(index: number, asset: DraftAsset) {
    setAssets((current) => {
      const next = [...current];
      next[index] = asset;
      if (!isAuthenticated) {
        persistLocalDraft(next, liabilities);
      }
      return next;
    });
  }

  function handleUpdateLiability(index: number, liability: DraftLiability) {
    setLiabilities((current) => {
      const next = [...current];
      next[index] = liability;
      if (!isAuthenticated) {
        persistLocalDraft(assets, next);
      }
      return next;
    });
  }

  function persistLocalDraft(nextAssets: DraftAsset[], nextLiabilities: DraftLiability[]) {
    saveLocalMoneySnapshotDraft({
      monthly_savings: monthlySavings ? Number(monthlySavings) : undefined,
      assets: nextAssets
        .filter((item) => item.value)
        .map((item) => ({
          category: item.category,
          label: item.label.trim() || item.category,
          value: Number(item.value),
          metadata: buildAssetMetadata(item),
        })),
      liabilities: nextLiabilities
        .filter((item) => item.balance)
        .map((item) => ({
          category: item.category,
          label: item.label.trim() || item.category,
          balance: Number(item.balance),
          interest_rate: item.interest_rate ? Number(item.interest_rate) : undefined,
          monthly_emi: item.monthly_emi ? Number(item.monthly_emi) : undefined,
          remaining_months: item.remaining_months ? Number(item.remaining_months) : undefined,
          metadata: item.metadata,
        })),
    });
  }

  const assetDetailFields = getAssetDetailFields(selectedOption.id);
  const hasProjectionDetails = selectedOption.kind === "asset" ? assetDetailFields.length > 0 : true;
  const hasPendingEntries = assets.length > 0 || liabilities.length > 0;

  async function handleSaveSnapshot() {
    const payloadAssets = assets
      .filter((item) => item.value)
      .map((item) => ({
        category: item.category,
        label: item.label.trim() || defaultLabelForAsset(item),
        value: Number(item.value),
        currency: "BDT",
        liquidity_tier: item.liquidity_tier,
        metadata: buildAssetMetadata(item),
      }));

    const payloadLiabilities = liabilities
      .filter((item) => item.balance)
      .map((item) => ({
        category: item.category,
        label: item.label.trim() || "Loan",
        balance: Number(item.balance),
        interest_rate: item.interest_rate ? Number(item.interest_rate) : null,
        monthly_emi: item.monthly_emi ? Number(item.monthly_emi) : null,
        remaining_months: item.remaining_months ? Number(item.remaining_months) : null,
        metadata: item.metadata,
      }));

    await patchSnapshot({
      monthly_savings: monthlySavings ? Number(monthlySavings) : null,
      assets: payloadAssets,
      liabilities: payloadLiabilities,
    });
    setSaveMessage("Money Snapshot updated.");
  }

  return (
    <section className="wealth-snapshot-page">
      <WealthSubNav />

      <header className="wealth-hero-card wealth-snapshot-hero">
        <p className="eyebrow">My Financial Picture</p>
        <h1>Money Snapshot</h1>
        <p>
          Start with a few broad numbers. Add dates, rates, and notes only when they help your future projections.
        </p>
      </header>

      <div className="wealth-metric-grid">
        <MetricCard label="Net Worth" tone="info" value={formatWealthCurrency(netWorth)} />
        <MetricCard label="Total Assets" tone="positive" value={formatWealthCurrency(totalAssets)} />
        <MetricCard label="Total Liabilities" tone="warning" value={formatWealthCurrency(totalLiabilities)} />
        <MetricCard
          helper="The more context you add, the richer your projections become."
          label="Clarity Score"
          tone="neutral"
          value={`${clarityScore}%`}
        />
      </div>

      <section className="wealth-panel wealth-snapshot-entry-panel">
        <div className="wealth-section-heading">
          <p className="eyebrow">Add gradually</p>
          <h2>What would you like to add?</h2>
        </div>
        <div className="wealth-add-card-grid">
          {ENTRY_OPTIONS.map((option) => (
            <button
              className={`wealth-add-card ${selectedOption.id === option.id ? "wealth-add-card-active" : ""}`}
              key={option.id}
              onClick={() => handleSelectOption(option)}
              type="button"
            >
              <span>{option.icon}</span>
              <strong>{option.title}</strong>
            </button>
          ))}
        </div>

        <div className="wealth-entry-drawer">
          <div className="wealth-entry-drawer-heading">
            <span>{selectedOption.icon}</span>
            <div>
              <h3>{selectedOption.title}</h3>
              <p>Start with the amount. You can improve projections now or later.</p>
            </div>
          </div>

          {selectedOption.kind === "asset" ? (
            <AssetDraftForm draft={assetDraft} onChange={setAssetDraft} option={selectedOption} />
          ) : (
            <LiabilityDraftForm draft={liabilityDraft} onChange={setLiabilityDraft} />
          )}

          <div className="wealth-entry-actions">
            {hasProjectionDetails ? (
              <button
                className="wealth-advanced-toggle wealth-projection-toggle"
                onClick={() => setShowProjectionDetails((current) => !current)}
                type="button"
              >
                {showProjectionDetails ? "Hide projection details" : "✨ Improve Projections"}
              </button>
            ) : (
              <span />
            )}
            <button className="wealth-primary-button wealth-add-entry-button" onClick={handleAddEntry} type="button">
              Add to list
            </button>
          </div>
          {showProjectionDetails && hasProjectionDetails ? (
            <div className="wealth-advanced-section">
              <p className="wealth-advanced-helper">
                These optional details unlock future value projections, maturity timelines, reminders, and smarter insights.
              </p>
              {selectedOption.kind === "asset" ? (
                <AssetProjectionForm draft={assetDraft} onChange={setAssetDraft} option={selectedOption} />
              ) : (
                <LiabilityProjectionForm draft={liabilityDraft} onChange={setLiabilityDraft} />
              )}
            </div>
          ) : null}

          {hasPendingEntries ? (
            <SnapshotEntryList
              assets={assets}
              liabilities={liabilities}
              onRemoveAsset={handleRemoveAsset}
              onRemoveLiability={handleRemoveLiability}
              onUpdateAsset={handleUpdateAsset}
              onUpdateLiability={handleUpdateLiability}
              renderAssetEditForm={(draft, onChange) => (
                <SnapshotAssetEditForm asset={draft} onChange={onChange} />
              )}
              renderLiabilityEditForm={(draft, onChange) => (
                <SnapshotLiabilityEditForm liability={draft} onChange={onChange} />
              )}
            />
          ) : null}
        </div>

        {isAuthenticated && hasPendingEntries ? (
          <div className="wealth-snapshot-save-bar">
            <div>
              <strong>Ready to save?</strong>
              <p className="wealth-muted-copy">Your list is stored here until you save it to your account.</p>
            </div>
            <button className="wealth-primary-button wealth-save-snapshot-button" disabled={isSaving} onClick={() => void handleSaveSnapshot()} type="button">
              {isSaving ? "Saving..." : "Save Money Snapshot"}
            </button>
          </div>
        ) : null}
        {!isAuthenticated ? (
          <p className="wealth-muted-copy wealth-signin-hint">
            <Link className="wealth-inline-link" href="/login">
              Sign in
            </Link>{" "}
            to save your snapshot to your account. Until then, items stay on this device only.
          </p>
        ) : null}
        {saveMessage ? <p className="wealth-local-note">{saveMessage}</p> : null}
      </section>

      <section className="wealth-snapshot-side-grid">
        <div className="wealth-panel">
          <h2>Upcoming Money Events</h2>
          {timelineEvents.length ? (
            <div className="wealth-money-event-list">
              {timelineEvents.map((event) => (
                <div className="wealth-money-event" key={`${event.label}-${event.dateLabel}`}>
                  <span>{event.dateLabel}</span>
                  <strong>{event.label}</strong>
                  <small>{event.value}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="wealth-muted-copy">Add a maturity date, purchase date, or EMI to see your financial timeline grow.</p>
          )}
        </div>

        <div className="wealth-panel">
          <h2>Monthly savings</h2>
          <p className="wealth-muted-copy">Optional. This improves your dashboard without becoming a full financial profile.</p>
          <label className="wealth-field">
            <span>How much do you usually save monthly?</span>
            <input inputMode="decimal" onChange={(event) => setMonthlySavings(event.target.value)} value={monthlySavings} />
          </label>
        </div>
      </section>

      {dashboard?.insights?.length ? (
        <div className="wealth-insight-grid">
          {dashboard.insights.map((insight) => (
            <WealthInsightCard insight={insight} key={insight.id} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AssetDraftForm({
  draft,
  onChange,
  option,
}: {
  draft: DraftAsset;
  onChange: (draft: DraftAsset) => void;
  option: SnapshotEntryOption;
}) {
  const essentialFields = getAssetEssentialFields(option.id);

  const formClassName = ["wealth-progressive-form"];
  if (["cash", "stocks", "property", "other"].includes(option.id)) {
    formClassName.push("wealth-progressive-form-inline");
  }

  return (
    <div className={formClassName.join(" ")}>
      {essentialFields.map((field) => (
        <AssetField
          asset={draft}
          field={field}
          key={field}
          onChange={onChange}
          option={option}
        />
      ))}
    </div>
  );
}

function AssetProjectionForm({
  draft,
  onChange,
  option,
}: {
  draft: DraftAsset;
  onChange: (draft: DraftAsset) => void;
  option: SnapshotEntryOption;
}) {
  const detailFields = getAssetDetailFields(option.id);

  if (option.id === "sanchayapatra") {
    return <SanchayapatraSnapshotDetailFields draft={draft} onChange={onChange} />;
  }

  return (
    <div className="wealth-progressive-form">
      {detailFields.map((field) => (
        <AssetField
          asset={draft}
          field={field}
          key={field}
          onChange={onChange}
          option={option}
        />
      ))}
    </div>
  );
}

function SanchayapatraSnapshotDetailFields({
  draft,
  onChange,
}: {
  draft: DraftAsset;
  onChange: (draft: DraftAsset) => void;
}) {
  const certificateType = metadataValue(draft.metadata, "certificate_type") || "family-savings";
  const config = getSanchayapatraConfig(certificateType);
  const sourceTaxPreset = metadataValue(draft.metadata, "source_tax_preset") || "10";

  return (
    <div className="wealth-sp-snapshot-details">
      <div className="wealth-form-row">
        <label className="wealth-field">
          <span>Certificate type</span>
          <select
            onChange={(event) => {
              const nextType = event.target.value;
              onChange({
                ...draft,
                metadata: { ...draft.metadata, ...buildSanchayapatraMetadata(nextType) },
              });
            }}
            value={certificateType}
          >
            {SANCHAYAPATRA_CERTIFICATE_OPTIONS.map((certificate) => (
              <option key={certificate.value} value={certificate.value}>
                {certificate.label}
              </option>
            ))}
          </select>
        </label>
        <label className="wealth-field">
          <span>Start date</span>
          <input
            onChange={(event) =>
              onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "purchase_date", event.target.value) })
            }
            type="date"
            value={metadataValue(draft.metadata, "purchase_date")}
          />
        </label>
        <label className="wealth-field wealth-field-optional">
          <span>End / maturity date (optional)</span>
          <input
            onChange={(event) =>
              onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "maturity_date", event.target.value) })
            }
            placeholder="Auto from certificate term"
            type="date"
            value={metadataValue(draft.metadata, "maturity_date")}
          />
        </label>
        <label className="wealth-field">
          <span>Source tax (%)</span>
          <select
            onChange={(event) =>
              onChange({
                ...draft,
                metadata: {
                  ...draft.metadata,
                  source_tax_preset: event.target.value,
                  source_tax_rate:
                    event.target.value === "custom" ? metadataValue(draft.metadata, "source_tax_rate") || "10" : event.target.value,
                },
              })
            }
            value={sourceTaxPreset}
          >
            <option value="10">10%</option>
            <option value="15">15%</option>
            <option value="custom">Custom</option>
          </select>
        </label>
      </div>

      <div className="wealth-government-rate-chip-row">
        <div className="wealth-government-rate-chip">
          <span>Default rate</span>
          <strong>{config.defaultRate}%</strong>
        </div>
        <small>Updated from configuration</small>
      </div>

      <div className="wealth-form-row">
        {sourceTaxPreset === "custom" ? (
          <label className="wealth-field wealth-field-optional">
            <span>Custom source tax (%)</span>
            <input
              inputMode="decimal"
              onChange={(event) =>
                onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "source_tax_rate", event.target.value) })
              }
              value={metadataValue(draft.metadata, "source_tax_rate")}
            />
          </label>
        ) : null}
        <label className="wealth-field wealth-field-optional">
          <span>Rate override (%) (optional)</span>
          <input
            inputMode="decimal"
            onChange={(event) =>
              onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "interest_rate", event.target.value) })
            }
            placeholder={config.defaultRate}
            value={metadataValue(draft.metadata, "interest_rate")}
          />
        </label>
        <label className="wealth-field">
          <span>Profit distribution</span>
          <select
            onChange={(event) =>
              onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "profit_distribution", event.target.value) })
            }
            value={metadataValue(draft.metadata, "profit_distribution") || config.profitDistribution}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="maturity">At maturity</option>
          </select>
        </label>
      </div>

      <div className="wealth-form-row wealth-form-row-optional">
        <label className="wealth-field wealth-field-optional">
          <span>Certificate / SP no. (optional)</span>
          <input
            onChange={(event) =>
              onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "account_identifier", event.target.value) })
            }
            placeholder="Optional reference"
            value={metadataValue(draft.metadata, "account_identifier")}
          />
        </label>
        <label className="wealth-field wealth-field-optional">
          <span>Name or label (optional)</span>
          <input onChange={(event) => onChange({ ...draft, label: event.target.value })} placeholder="Sanchayapatra" value={draft.label} />
        </label>
        <label className="wealth-field wealth-field-optional">
          <span>Notes (optional)</span>
          <input
            onChange={(event) => onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "notes", event.target.value) })}
            value={metadataValue(draft.metadata, "notes")}
          />
        </label>
      </div>
    </div>
  );
}

type AssetFieldKey =
  | "value"
  | "label"
  | "interest_rate"
  | "account_identifier"
  | "payment_count"
  | "profit_distribution"
  | "certificate_type"
  | "purchase_date"
  | "start_date"
  | "maturity_date"
  | "gold_weight"
  | "gold_weight_unit"
  | "source_tax_preset"
  | "source_tax_rate"
  | "government_rate"
  | "notes";

function getAssetEssentialFields(optionId: string): AssetFieldKey[] {
  switch (optionId) {
    case "fdr":
      return ["value", "interest_rate", "account_identifier", "label"];
    case "dps":
      return ["value", "interest_rate", "payment_count", "account_identifier", "label"];
    case "sanchayapatra":
      return ["value"];
    case "gold":
      return ["value", "gold_weight", "gold_weight_unit", "label", "notes"];
    case "cash":
    case "stocks":
    case "property":
    case "other":
      return ["value", "label", "notes"];
    default:
      return ["value", "label"];
  }
}

function getAssetDetailFields(optionId: string): AssetFieldKey[] {
  switch (optionId) {
    case "cash":
    case "stocks":
    case "property":
    case "other":
    case "gold":
      return [];
    case "fdr":
      return ["profit_distribution", "start_date", "maturity_date", "notes"];
    case "dps":
      return ["start_date", "maturity_date", "notes"];
    case "sanchayapatra":
      return ["certificate_type"];
    default:
      return [];
  }
}

function AssetField({
  asset: draft,
  field,
  onChange,
  option,
}: {
  asset: DraftAsset;
  field: AssetFieldKey;
  onChange: (draft: DraftAsset) => void;
  option: SnapshotEntryOption;
}) {
  if (field === "value") {
    return (
      <label className="wealth-field">
        <span>Amount</span>
        <input inputMode="decimal" onChange={(event) => onChange({ ...draft, value: event.target.value })} value={draft.value} />
      </label>
    );
  }

  if (field === "label") {
    return (
      <label className="wealth-field wealth-field-optional">
        <span>Name or label (optional)</span>
        <input onChange={(event) => onChange({ ...draft, label: event.target.value })} placeholder={option.title} value={draft.label} />
      </label>
    );
  }

  if (field === "payment_count") {
    return (
      <label className="wealth-field">
        <span>No. of payments</span>
        <input
          inputMode="numeric"
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "payment_count", event.target.value) })
          }
          placeholder="e.g. 60"
          value={metadataValue(draft.metadata, "payment_count")}
        />
      </label>
    );
  }

  if (field === "gold_weight") {
    return (
      <label className="wealth-field wealth-field-optional">
        <span>Weight (optional)</span>
        <input
          inputMode="decimal"
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "gold_weight", event.target.value) })
          }
          placeholder="e.g. 10"
          value={metadataValue(draft.metadata, "gold_weight")}
        />
      </label>
    );
  }

  if (field === "gold_weight_unit") {
    return (
      <label className="wealth-field wealth-field-optional">
        <span>Unit (optional)</span>
        <select
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "gold_weight_unit", event.target.value) })
          }
          value={metadataValue(draft.metadata, "gold_weight_unit") || "gram"}
        >
          {GOLD_WEIGHT_UNITS.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {unit.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field === "interest_rate") {
    const rateLabel = option.id === "sanchayapatra" ? "Rate override (%) (optional)" : "Interest rate (%)";
    return (
      <label className={`wealth-field ${option.id === "sanchayapatra" ? "wealth-field-optional" : ""}`}>
        <span>{rateLabel}</span>
        <input
          inputMode="decimal"
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "interest_rate", event.target.value) })
          }
          value={metadataValue(draft.metadata, "interest_rate")}
        />
      </label>
    );
  }

  if (field === "account_identifier") {
    return (
      <label className="wealth-field wealth-field-optional">
        <span>{identifierLabel(option.id)}</span>
        <input
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "account_identifier", event.target.value) })
          }
          placeholder="Optional reference number"
          value={metadataValue(draft.metadata, "account_identifier")}
        />
      </label>
    );
  }

  if (field === "profit_distribution" && option.id === "fdr") {
    return (
      <label className="wealth-field">
        <span>Profit sharing</span>
        <select
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "profit_distribution", event.target.value) })
          }
          value={metadataValue(draft.metadata, "profit_distribution") || "maturity"}
        >
          <option value="maturity">Compound at maturity</option>
          <option value="monthly">Monthly profit payout</option>
          <option value="quarterly">Quarterly profit payout</option>
          <option value="yearly">Yearly profit payout</option>
        </select>
      </label>
    );
  }

  if (field === "profit_distribution" && option.id === "sanchayapatra") {
    return (
      <label className="wealth-field">
        <span>Profit distribution</span>
        <select
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "profit_distribution", event.target.value) })
          }
          value={metadataValue(draft.metadata, "profit_distribution") || "monthly"}
        >
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
          <option value="maturity">At maturity</option>
        </select>
      </label>
    );
  }

  if (field === "government_rate") {
    const certificateType = metadataValue(draft.metadata, "certificate_type") || "family-savings";
    const config = getSanchayapatraConfig(certificateType);
    return (
      <div className="wealth-government-rate-card wealth-field-compact">
        <span>Government default rate</span>
        <strong>{config.defaultRate}%</strong>
        <small>Updated from configuration.</small>
      </div>
    );
  }

  if (field === "certificate_type") {
    return (
      <label className="wealth-field wealth-field-compact">
        <span>Certificate type</span>
        <select
          onChange={(event) => {
            const certificateType = event.target.value;
            onChange({
              ...draft,
              metadata: {
                ...draft.metadata,
                ...buildSanchayapatraMetadata(certificateType),
              },
            });
          }}
          value={metadataValue(draft.metadata, "certificate_type") || "family-savings"}
        >
          {SANCHAYAPATRA_CERTIFICATE_OPTIONS.map((certificate) => (
            <option key={certificate.value} title={certificate.label} value={certificate.value}>
              {certificate.shortLabel}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field === "source_tax_preset") {
    return (
      <label className="wealth-field wealth-field-compact">
        <span>Source tax (%)</span>
        <select
          onChange={(event) =>
            onChange({
              ...draft,
              metadata: {
                ...draft.metadata,
                source_tax_preset: event.target.value,
                source_tax_rate: event.target.value === "custom" ? metadataValue(draft.metadata, "source_tax_rate") || "10" : event.target.value,
              },
            })
          }
          value={metadataValue(draft.metadata, "source_tax_preset") || "10"}
        >
          <option value="10">10%</option>
          <option value="15">15%</option>
          <option value="custom">Custom</option>
        </select>
      </label>
    );
  }

  if (field === "source_tax_rate" && metadataValue(draft.metadata, "source_tax_preset") === "custom") {
    return (
      <label className="wealth-field wealth-field-compact">
        <span>Custom source tax (%)</span>
        <input
          inputMode="decimal"
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "source_tax_rate", event.target.value) })
          }
          value={metadataValue(draft.metadata, "source_tax_rate")}
        />
      </label>
    );
  }

  if (field === "source_tax_rate") {
    return null;
  }

  if (field === "purchase_date") {
    return (
      <label className="wealth-field">
        <span>Start date</span>
        <input
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "purchase_date", event.target.value) })
          }
          type="date"
          value={metadataValue(draft.metadata, "purchase_date")}
        />
      </label>
    );
  }

  if (field === "start_date") {
    return (
      <label className="wealth-field">
        <span>Start date</span>
        <input
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "start_date", event.target.value) })
          }
          type="date"
          value={metadataValue(draft.metadata, "start_date")}
        />
      </label>
    );
  }

  if (field === "maturity_date") {
    return (
      <label className="wealth-field">
        <span>End / maturity date</span>
        <input
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "maturity_date", event.target.value) })
          }
          type="date"
          value={metadataValue(draft.metadata, "maturity_date")}
        />
      </label>
    );
  }

  if (field === "notes") {
    return (
      <label className="wealth-field wealth-field-optional">
        <span>Notes (optional)</span>
        <input
          onChange={(event) => onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "notes", event.target.value) })}
          value={metadataValue(draft.metadata, "notes")}
        />
      </label>
    );
  }

  return null;
}

function LiabilityDraftForm({
  draft,
  onChange,
}: {
  draft: DraftLiability;
  onChange: (draft: DraftLiability) => void;
}) {
  return (
    <div className="wealth-progressive-form">
      <label className="wealth-field">
        <span>Outstanding balance</span>
        <input inputMode="decimal" onChange={(event) => onChange({ ...draft, balance: event.target.value })} value={draft.balance} />
      </label>
      <label className="wealth-field">
        <span>Interest rate (%)</span>
        <input
          inputMode="decimal"
          onChange={(event) => onChange({ ...draft, interest_rate: event.target.value })}
          value={draft.interest_rate}
        />
      </label>
      <label className="wealth-field wealth-field-optional">
        <span>EMI amount (optional)</span>
        <input
          inputMode="decimal"
          onChange={(event) => onChange({ ...draft, monthly_emi: event.target.value })}
          placeholder="Optional"
          value={draft.monthly_emi}
        />
      </label>
      <label className="wealth-field wealth-field-optional">
        <span>Loan name (optional)</span>
        <input onChange={(event) => onChange({ ...draft, label: event.target.value })} placeholder="Loan" value={draft.label} />
      </label>
    </div>
  );
}

function LiabilityProjectionForm({
  draft,
  onChange,
}: {
  draft: DraftLiability;
  onChange: (draft: DraftLiability) => void;
}) {
  return (
    <div className="wealth-progressive-form">
      <label className="wealth-field wealth-field-optional">
        <span>Loan account number (optional)</span>
        <input
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "account_identifier", event.target.value) })
          }
          placeholder="Optional reference number"
          value={metadataValue(draft.metadata, "account_identifier")}
        />
      </label>
      <label className="wealth-field">
        <span>Remaining months</span>
        <input
          inputMode="numeric"
          onChange={(event) => onChange({ ...draft, remaining_months: event.target.value })}
          value={draft.remaining_months}
        />
      </label>
      <label className="wealth-field wealth-field-optional">
        <span>Loan start date (optional)</span>
        <input
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "start_date", event.target.value) })
          }
          type="date"
          value={metadataValue(draft.metadata, "start_date")}
        />
      </label>
    </div>
  );
}

function SnapshotAssetEditForm({
  asset,
  onChange,
}: {
  asset: DraftAsset;
  onChange: (asset: DraftAsset) => void;
}) {
  const optionId = optionIdForAsset(asset);
  const option = ENTRY_OPTIONS.find((item) => item.id === optionId) ?? ENTRY_OPTIONS[0];
  const fields = getAssetEditFields(optionId);

  if (optionId === "sanchayapatra") {
    return (
      <div className="wealth-pending-entry-edit-form">
        <label className="wealth-field">
          <span>Amount</span>
          <input inputMode="decimal" onChange={(event) => onChange({ ...asset, value: event.target.value })} value={asset.value} />
        </label>
        <SanchayapatraSnapshotDetailFields draft={asset} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="wealth-pending-entry-edit-form">
      {fields.map((field) => (
        <AssetField asset={asset} field={field} key={field} onChange={onChange} option={option} />
      ))}
    </div>
  );
}

function SnapshotLiabilityEditForm({
  liability,
  onChange,
}: {
  liability: DraftLiability;
  onChange: (liability: DraftLiability) => void;
}) {
  return (
    <div className="wealth-pending-entry-edit-form">
      <LiabilityDraftForm draft={liability} onChange={onChange} />
      <LiabilityProjectionForm draft={liability} onChange={onChange} />
    </div>
  );
}

function getAssetEditFields(optionId: string): AssetFieldKey[] {
  return [...getAssetEssentialFields(optionId), ...getAssetDetailFields(optionId)];
}

function buildAssetMetadata(asset: DraftAsset) {
  const metadata = ensureAssetPlanningDates(asset);
  if (asset.category !== "SANCHAYAPATRA" && asset.category !== "DEPOSIT") {
    return metadata;
  }
  const periodicProfit = estimatePeriodicProfitValue({ ...asset, metadata });
  const distribution = metadataValue(metadata, "profit_distribution") || "monthly";
  const months = distribution === "quarterly" ? 3 : distribution === "yearly" ? 12 : distribution === "monthly" ? 1 : 0;
  const monthlyProfit = periodicProfit && months ? Math.round((periodicProfit * 12) / months) : null;
  return {
    ...metadata,
    ...(monthlyProfit ? { monthly_profit: monthlyProfit } : {}),
    ...(periodicProfit ? { periodic_profit: periodicProfit } : {}),
  };
}

function buildTimelineEvents(assets: DraftAsset[], liabilities: DraftLiability[]) {
  const events = assets.flatMap((asset) => {
    const planningMetadata = ensureAssetPlanningDates(asset);
    const startDate = resolveAssetStartDate(planningMetadata);
    const maturityDate = resolveAssetEndDate(planningMetadata);
    const periodicProfit = estimatePeriodicProfit({ ...asset, metadata: planningMetadata });
    const moneyEvents = [];
    if (startDate) {
      moneyEvents.push({ dateLabel: formatDateLabel(startDate), label: `${asset.label} started`, value: "Planning anchor" });
    }
    if ((asset.category === "SANCHAYAPATRA" || asset.category === "DEPOSIT") && periodicProfit) {
      moneyEvents.push({ dateLabel: nextPayoutLabel(asset), label: `${asset.label} profit`, value: periodicProfit });
    }
    if (maturityDate) {
      moneyEvents.push({
        dateLabel: formatDateLabel(maturityDate),
        label: `${asset.label} matures`,
        value: formatWealthCurrency(asset.value),
      });
    }
    return moneyEvents;
  });

  liabilities.forEach((liability) => {
    if (liability.monthly_emi) {
      events.push({ dateLabel: "15th", label: `${liability.label} EMI`, value: formatWealthCurrency(liability.monthly_emi) });
    }
    if (liability.remaining_months) {
      events.push({ dateLabel: `${liability.remaining_months} mo`, label: `${liability.label} completed`, value: "Debt free" });
    }
  });

  return events.slice(0, 6);
}

function estimatePeriodicProfit(asset: DraftAsset) {
  const periodicProfit = estimatePeriodicProfitValue(asset);
  return periodicProfit ? formatWealthCurrency(periodicProfit) : null;
}

function estimatePeriodicProfitValue(asset: DraftAsset) {
  if (asset.category !== "SANCHAYAPATRA" && asset.category !== "DEPOSIT") {
    return null;
  }
  const certificateType = metadataValue(asset.metadata, "certificate_type") || "family-savings";
  const certificateConfig = getSanchayapatraConfig(certificateType);
  const distribution =
    metadataValue(asset.metadata, "profit_distribution") ||
    (asset.category === "SANCHAYAPATRA" ? certificateConfig.profitDistribution : "monthly") ||
    "monthly";
  const months = distribution === "quarterly" ? 3 : distribution === "yearly" ? 12 : distribution === "maturity" ? 0 : 1;
  if (!months) {
    return null;
  }
  const amount = Number(asset.value);
  const rate = Number(
    asset.metadata.interest_rate ||
      (asset.category === "SANCHAYAPATRA" ? certificateConfig.defaultRate : undefined) ||
      9,
  );
  if (!amount || !rate) {
    return null;
  }
  return Math.round((amount * rate * months) / 1200);
}

function profitLabel(asset: DraftAsset) {
  const distribution = metadataValue(asset.metadata, "profit_distribution") || "monthly";
  if (distribution === "quarterly") {
    return "Quarterly Profit";
  }
  if (distribution === "yearly") {
    return "Yearly Profit";
  }
  return "Monthly Profit";
}

function nextPayoutLabel(asset: DraftAsset) {
  const distribution = metadataValue(asset.metadata, "profit_distribution") || "monthly";
  if (distribution === "quarterly") {
    return "Next quarter";
  }
  if (distribution === "yearly") {
    return "Next year";
  }
  return "Next month";
}

function defaultLabelForAsset(asset: DraftAsset) {
  const depositType = metadataValue(asset.metadata, "deposit_type");
  const option = ENTRY_OPTIONS.find((item) => item.id === depositType) ?? ENTRY_OPTIONS.find((item) => item.category === asset.category);
  return option?.title ?? asset.category;
}

function identifierLabel(optionId: string) {
  if (optionId === "fdr") {
    return "FDR account number (optional)";
  }
  if (optionId === "dps") {
    return "DPS account number (optional)";
  }
  return "Certificate / SP number (optional)";
}

