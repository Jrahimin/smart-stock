"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { MetricCard } from "@/components/ui/metric-card";
import { SnapshotAssetAllocation } from "@/features/wealth/components/snapshot-asset-allocation";
import { SnapshotCompletenessCard } from "@/features/wealth/components/snapshot-completeness-card";
import { SnapshotEntryList } from "@/features/wealth/components/snapshot-entry-list";
import { WealthInsightCard } from "@/features/wealth/components/wealth-insight-card";
import { WealthSubNav } from "@/features/wealth/components/wealth-sub-nav";
import { getCalculatorAccountIdentifierLabel } from "@/features/wealth/lib/calculator-snapshot";
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
  metadataValue,
  optionIdForAsset,
  setMetadataValue,
  type SnapshotDraftAsset,
  type SnapshotDraftLiability,
} from "@/features/wealth/lib/snapshot-entry-helpers";
import {
  buildAssetAllocation,
  buildUpcomingMoneyEventGroups,
  computeSnapshotCompleteness,
  estimatePeriodicProfitValue,
} from "@/features/wealth/lib/snapshot-dashboard-helpers";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { useAuth } from "@/features/auth/context/auth-context";
import {
  getWealthSnapshotLanguage,
  localizeSnapshotAllocationLabel,
  localizeUpcomingEventLabel,
  type SnapshotEntryId,
} from "@/features/wealth/wealth-snapshot-language";
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

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

export function MoneySnapshotDashboardView({ locale }: { locale: AppLocale }) {
  const copy = getWealthSnapshotLanguage(locale);
  const toolsCopy = getWealthToolsLanguage(locale);
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

  const snapshotCompleteness = useMemo(
    () => computeSnapshotCompleteness(assets, liabilities, monthlySavings),
    [assets, liabilities, monthlySavings],
  );
  const assetAllocation = useMemo(() => buildAssetAllocation(assets), [assets]);
  const upcomingEventGroups = useMemo(() => buildUpcomingMoneyEventGroups(assets, liabilities), [assets, liabilities]);
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
    setSaveMessage(copy.addSection.saved);
  }

  return (
    <section className="wealth-snapshot-page">
      <WealthSubNav locale={locale} />

      <header className="wealth-hero-card wealth-snapshot-hero">
        <p className="eyebrow">{copy.hero.eyebrow}</p>
        <h1>{copy.hero.title}</h1>
        <p>{copy.hero.description}</p>
      </header>

      <div className="wealth-metric-grid wealth-snapshot-summary-grid">
        <MetricCard label={copy.metrics.netWorth} tone="info" value={formatWealthCurrency(netWorth)} />
        <MetricCard label={copy.metrics.totalAssets} tone="positive" value={formatWealthCurrency(totalAssets)} />
        <MetricCard label={copy.metrics.totalLiabilities} tone="warning" value={formatWealthCurrency(totalLiabilities)} />
        <SnapshotCompletenessCard completeness={snapshotCompleteness} locale={locale} />
      </div>

      <section className="wealth-panel wealth-snapshot-entry-panel">
        <div className="wealth-section-heading">
          <p className="eyebrow">{copy.addSection.eyebrow}</p>
          <h2>{copy.addSection.title}</h2>
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
              <strong>{copy.entryOptions[option.id as SnapshotEntryId]}</strong>
            </button>
          ))}
        </div>

        <div className="wealth-entry-drawer">
          <div className="wealth-entry-drawer-heading">
            <span>{selectedOption.icon}</span>
            <div>
              <h3>{copy.entryOptions[selectedOption.id as SnapshotEntryId]}</h3>
              <p>{copy.addSection.drawerHint}</p>
            </div>
          </div>

          {selectedOption.kind === "asset" ? (
            <AssetDraftForm copy={copy} draft={assetDraft} locale={locale} onChange={setAssetDraft} option={selectedOption} toolsCopy={toolsCopy} />
          ) : (
            <LiabilityDraftForm copy={copy} draft={liabilityDraft} locale={locale} onChange={setLiabilityDraft} toolsCopy={toolsCopy} />
          )}

          <div className="wealth-entry-actions">
            {hasProjectionDetails ? (
              <button
                className="wealth-advanced-toggle wealth-projection-toggle"
                onClick={() => setShowProjectionDetails((current) => !current)}
                type="button"
              >
                {showProjectionDetails ? copy.addSection.hideDetails : copy.addSection.improveProjections}
              </button>
            ) : (
              <span />
            )}
            <button className="wealth-primary-button wealth-add-entry-button" onClick={handleAddEntry} type="button">
              {copy.addSection.addToList}
            </button>
          </div>
          {showProjectionDetails && hasProjectionDetails ? (
            <div className="wealth-advanced-section">
              <p className="wealth-advanced-helper">{copy.addSection.advancedHelper}</p>
              {selectedOption.kind === "asset" ? (
                <AssetProjectionForm copy={copy} draft={assetDraft} locale={locale} onChange={setAssetDraft} option={selectedOption} toolsCopy={toolsCopy} />
              ) : (
                <LiabilityProjectionForm copy={copy} draft={liabilityDraft} locale={locale} onChange={setLiabilityDraft} toolsCopy={toolsCopy} />
              )}
            </div>
          ) : null}

          {hasPendingEntries ? (
            <SnapshotEntryList
              assets={assets}
              liabilities={liabilities}
              locale={locale}
              onRemoveAsset={handleRemoveAsset}
              onRemoveLiability={handleRemoveLiability}
              onUpdateAsset={handleUpdateAsset}
              onUpdateLiability={handleUpdateLiability}
              renderAssetEditForm={(draft, onChange) => (
                <SnapshotAssetEditForm asset={draft} copy={copy} locale={locale} onChange={onChange} toolsCopy={toolsCopy} />
              )}
              renderLiabilityEditForm={(draft, onChange) => (
                <SnapshotLiabilityEditForm copy={copy} liability={draft} locale={locale} onChange={onChange} toolsCopy={toolsCopy} />
              )}
            />
          ) : null}
        </div>

        {isAuthenticated && hasPendingEntries ? (
          <div className="wealth-snapshot-save-bar">
            <div>
              <strong>{copy.addSection.readyToSave}</strong>
              <p className="wealth-muted-copy">{copy.addSection.readyHint}</p>
            </div>
            <button className="wealth-primary-button wealth-save-snapshot-button" disabled={isSaving} onClick={() => void handleSaveSnapshot()} type="button">
              {isSaving ? copy.addSection.saving : copy.addSection.save}
            </button>
          </div>
        ) : null}
        {!isAuthenticated ? (
          <p className="wealth-muted-copy wealth-signin-hint">
            <Link className="wealth-inline-link" href="/login">
              {copy.addSection.signIn}
            </Link>{" "}
            {copy.addSection.signInHint}
          </p>
        ) : null}
        {saveMessage ? <p className="wealth-local-note">{saveMessage}</p> : null}
      </section>

      <section className="wealth-snapshot-bottom-grid">
        <div className="wealth-panel wealth-snapshot-events-panel">
          <h2>{copy.upcoming.title}</h2>
          {upcomingEventGroups.length ? (
            <div className="wealth-money-event-groups">
              {upcomingEventGroups.map((group) => (
                <div className="wealth-money-event-group" key={group.id}>
                  <h3>{group.id === "30-days" ? copy.upcoming.next30Days : copy.upcoming.next12Months}</h3>
                  <div className="wealth-money-event-list wealth-money-event-list-expanded">
                    {group.events.map((event) => (
                      <div
                        className={`wealth-money-event wealth-money-event-${event.kind}`}
                        key={`${group.id}-${event.kind}-${event.label}-${event.dateLabel}`}
                      >
                        <span>{event.dateLabel}</span>
                        <strong>{localizeUpcomingEventLabel(event.label, locale)}</strong>
                        <small>{event.value}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="wealth-snapshot-empty-state">
              <span aria-hidden="true" className="wealth-snapshot-empty-icon">
                ◷
              </span>
              <p className="wealth-muted-copy">{copy.upcoming.empty}</p>
            </div>
          )}
        </div>

        <div className="wealth-panel wealth-snapshot-savings-panel wealth-snapshot-compact-panel">
          <div className="wealth-snapshot-compact-panel-head">
            <h2>{copy.monthlySavings.title}</h2>
            <p className="wealth-muted-copy">{copy.monthlySavings.hint}</p>
          </div>
          <label className="wealth-field wealth-snapshot-savings-field">
            <span>{copy.monthlySavings.label}</span>
            <input inputMode="decimal" onChange={(event) => setMonthlySavings(event.target.value)} value={monthlySavings} />
          </label>
        </div>

        <SnapshotAssetAllocation locale={locale} slices={assetAllocation} />
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
  copy,
  draft,
  locale,
  onChange,
  option,
  toolsCopy,
}: {
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  draft: DraftAsset;
  locale: AppLocale;
  onChange: (draft: DraftAsset) => void;
  option: SnapshotEntryOption;
  toolsCopy: ReturnType<typeof getWealthToolsLanguage>;
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
          copy={copy}
          field={field}
          key={field}
          locale={locale}
          onChange={onChange}
          option={option}
          toolsCopy={toolsCopy}
        />
      ))}
    </div>
  );
}

function AssetProjectionForm({
  copy,
  draft,
  locale,
  onChange,
  option,
  toolsCopy,
}: {
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  draft: DraftAsset;
  locale: AppLocale;
  onChange: (draft: DraftAsset) => void;
  option: SnapshotEntryOption;
  toolsCopy: ReturnType<typeof getWealthToolsLanguage>;
}) {
  const detailFields = getAssetDetailFields(option.id);

  if (option.id === "sanchayapatra") {
    return <SanchayapatraSnapshotDetailFields copy={copy} draft={draft} locale={locale} onChange={onChange} toolsCopy={toolsCopy} />;
  }

  return (
    <div className="wealth-progressive-form">
      {detailFields.map((field) => (
        <AssetField
          asset={draft}
          copy={copy}
          field={field}
          key={field}
          locale={locale}
          onChange={onChange}
          option={option}
          toolsCopy={toolsCopy}
        />
      ))}
    </div>
  );
}

function SanchayapatraSnapshotDetailFields({
  copy,
  draft,
  locale,
  onChange,
  toolsCopy,
}: {
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  draft: DraftAsset;
  locale: AppLocale;
  onChange: (draft: DraftAsset) => void;
  toolsCopy: ReturnType<typeof getWealthToolsLanguage>;
}) {
  const certificateType = metadataValue(draft.metadata, "certificate_type") || "family-savings";
  const config = getSanchayapatraConfig(certificateType);
  const sourceTaxPreset = metadataValue(draft.metadata, "source_tax_preset") || "10";

  return (
    <div className="wealth-sp-snapshot-details">
      <div className="wealth-form-row">
        <label className="wealth-field">
          <span>{copy.fields.certificateType}</span>
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
          <span>{copy.fields.startDate}</span>
          <input
            onChange={(event) =>
              onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "purchase_date", event.target.value) })
            }
            type="date"
            value={metadataValue(draft.metadata, "purchase_date")}
          />
        </label>
        <label className="wealth-field wealth-field-optional">
          <span>{copy.fields.maturityDateOptional}</span>
          <input
            onChange={(event) =>
              onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "maturity_date", event.target.value) })
            }
            placeholder={copy.fields.autoMaturity}
            type="date"
            value={metadataValue(draft.metadata, "maturity_date")}
          />
        </label>
        <label className="wealth-field">
          <span>{copy.fields.sourceTax}</span>
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
            <option value="custom">{toolsCopy.common.custom}</option>
          </select>
        </label>
      </div>

      <div className="wealth-government-rate-chip-row">
        <div className="wealth-government-rate-chip">
          <span>{copy.fields.defaultRate}</span>
          <strong>{config.defaultRate}%</strong>
        </div>
        <small>{copy.fields.governmentRateHint}</small>
      </div>

      <div className="wealth-form-row">
        {sourceTaxPreset === "custom" ? (
          <label className="wealth-field wealth-field-optional">
            <span>{copy.fields.customSourceTax}</span>
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
          <span>{copy.fields.rateOverride}</span>
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
          <span>{copy.fields.profitDistribution}</span>
          <select
            onChange={(event) =>
              onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "profit_distribution", event.target.value) })
            }
            value={metadataValue(draft.metadata, "profit_distribution") || config.profitDistribution}
          >
            <option value="monthly">{copy.profitDistribution.monthly}</option>
            <option value="quarterly">{copy.profitDistribution.quarterly}</option>
            <option value="yearly">{copy.profitDistribution.yearly}</option>
            <option value="maturity">{copy.profitDistribution.atMaturity}</option>
          </select>
        </label>
      </div>

      <div className="wealth-form-row wealth-form-row-optional">
        <label className="wealth-field wealth-field-optional">
          <span>{copy.fields.certificateNumber}</span>
          <input
            onChange={(event) =>
              onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "account_identifier", event.target.value) })
            }
            placeholder={copy.fields.optionalReference}
            value={metadataValue(draft.metadata, "account_identifier")}
          />
        </label>
        <label className="wealth-field wealth-field-optional">
          <span>{copy.fields.labelOptional}</span>
          <input onChange={(event) => onChange({ ...draft, label: event.target.value })} placeholder={copy.entryOptions.sanchayapatra} value={draft.label} />
        </label>
        <label className="wealth-field wealth-field-optional">
          <span>{copy.fields.notesOptional}</span>
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
  copy,
  field,
  locale,
  onChange,
  option,
  toolsCopy,
}: {
  asset: DraftAsset;
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  field: AssetFieldKey;
  locale: AppLocale;
  onChange: (draft: DraftAsset) => void;
  option: SnapshotEntryOption;
  toolsCopy: ReturnType<typeof getWealthToolsLanguage>;
}) {
  const entryTitle = copy.entryOptions[option.id as SnapshotEntryId] ?? option.title;

  if (field === "value") {
    return (
      <label className="wealth-field">
        <span>{copy.fields.amount}</span>
        <input inputMode="decimal" onChange={(event) => onChange({ ...draft, value: event.target.value })} value={draft.value} />
      </label>
    );
  }

  if (field === "label") {
    return (
      <label className="wealth-field wealth-field-optional">
        <span>{copy.fields.labelOptional}</span>
        <input onChange={(event) => onChange({ ...draft, label: event.target.value })} placeholder={entryTitle} value={draft.label} />
      </label>
    );
  }

  if (field === "payment_count") {
    return (
      <label className="wealth-field">
        <span>{copy.fields.paymentCount}</span>
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
        <span>{copy.fields.weightOptional}</span>
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
        <span>{copy.fields.unitOptional}</span>
        <select
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "gold_weight_unit", event.target.value) })
          }
          value={metadataValue(draft.metadata, "gold_weight_unit") || "gram"}
        >
          {GOLD_WEIGHT_UNITS.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {copy.goldUnits[unit.value] ?? unit.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field === "interest_rate") {
    const rateLabel = option.id === "sanchayapatra" ? copy.fields.rateOverride : copy.fields.interestRate;
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
        <span>{identifierLabel(option.id, locale)}</span>
        <input
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "account_identifier", event.target.value) })
          }
          placeholder={copy.fields.optionalReference}
          value={metadataValue(draft.metadata, "account_identifier")}
        />
      </label>
    );
  }

  if (field === "profit_distribution" && option.id === "fdr") {
    return (
      <label className="wealth-field">
        <span>{copy.fields.profitSharing}</span>
        <select
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "profit_distribution", event.target.value) })
          }
          value={metadataValue(draft.metadata, "profit_distribution") || "maturity"}
        >
          <option value="maturity">{copy.profitDistribution.maturity}</option>
          <option value="monthly">{copy.profitDistribution.monthly}</option>
          <option value="quarterly">{copy.profitDistribution.quarterly}</option>
          <option value="yearly">{copy.profitDistribution.yearly}</option>
        </select>
      </label>
    );
  }

  if (field === "profit_distribution" && option.id === "sanchayapatra") {
    return (
      <label className="wealth-field">
        <span>{copy.fields.profitDistribution}</span>
        <select
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "profit_distribution", event.target.value) })
          }
          value={metadataValue(draft.metadata, "profit_distribution") || "monthly"}
        >
          <option value="monthly">{copy.profitDistribution.monthly}</option>
          <option value="quarterly">{copy.profitDistribution.quarterly}</option>
          <option value="yearly">{copy.profitDistribution.yearly}</option>
          <option value="maturity">{copy.profitDistribution.atMaturity}</option>
        </select>
      </label>
    );
  }

  if (field === "government_rate") {
    const certificateType = metadataValue(draft.metadata, "certificate_type") || "family-savings";
    const config = getSanchayapatraConfig(certificateType);
    return (
      <div className="wealth-government-rate-card wealth-field-compact">
        <span>{copy.fields.governmentRate}</span>
        <strong>{config.defaultRate}%</strong>
        <small>{copy.fields.governmentRateHint}</small>
      </div>
    );
  }

  if (field === "certificate_type") {
    return (
      <label className="wealth-field wealth-field-compact">
        <span>{copy.fields.certificateType}</span>
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
        <span>{copy.fields.sourceTax}</span>
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
          <option value="custom">{toolsCopy.common.custom}</option>
        </select>
      </label>
    );
  }

  if (field === "source_tax_rate" && metadataValue(draft.metadata, "source_tax_preset") === "custom") {
    return (
      <label className="wealth-field wealth-field-compact">
        <span>{copy.fields.customSourceTax}</span>
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
        <span>{copy.fields.startDate}</span>
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
        <span>{copy.fields.startDate}</span>
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
        <span>{copy.fields.maturityDate}</span>
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
        <span>{copy.fields.notesOptional}</span>
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
  copy,
  draft,
  locale,
  onChange,
  toolsCopy,
}: {
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  draft: DraftLiability;
  locale: AppLocale;
  onChange: (draft: DraftLiability) => void;
  toolsCopy: ReturnType<typeof getWealthToolsLanguage>;
}) {
  return (
    <div className="wealth-progressive-form">
      <label className="wealth-field">
        <span>{copy.fields.outstandingBalance}</span>
        <input inputMode="decimal" onChange={(event) => onChange({ ...draft, balance: event.target.value })} value={draft.balance} />
      </label>
      <label className="wealth-field">
        <span>{copy.fields.interestRate}</span>
        <input
          inputMode="decimal"
          onChange={(event) => onChange({ ...draft, interest_rate: event.target.value })}
          value={draft.interest_rate}
        />
      </label>
      <label className="wealth-field wealth-field-optional">
        <span>{copy.fields.emiOptional}</span>
        <input
          inputMode="decimal"
          onChange={(event) => onChange({ ...draft, monthly_emi: event.target.value })}
          placeholder={toolsCopy.common.optional}
          value={draft.monthly_emi}
        />
      </label>
      <label className="wealth-field wealth-field-optional">
        <span>{copy.fields.loanNameOptional}</span>
        <input onChange={(event) => onChange({ ...draft, label: event.target.value })} placeholder={copy.entryOptions.loan} value={draft.label} />
      </label>
    </div>
  );
}

function LiabilityProjectionForm({
  copy,
  draft,
  locale,
  onChange,
  toolsCopy,
}: {
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  draft: DraftLiability;
  locale: AppLocale;
  onChange: (draft: DraftLiability) => void;
  toolsCopy: ReturnType<typeof getWealthToolsLanguage>;
}) {
  return (
    <div className="wealth-progressive-form">
      <label className="wealth-field wealth-field-optional">
        <span>{copy.fields.loanAccountOptional}</span>
        <input
          onChange={(event) =>
            onChange({ ...draft, metadata: setMetadataValue(draft.metadata, "account_identifier", event.target.value) })
          }
          placeholder={copy.fields.optionalReference}
          value={metadataValue(draft.metadata, "account_identifier")}
        />
      </label>
      <label className="wealth-field">
        <span>{copy.fields.remainingMonths}</span>
        <input
          inputMode="numeric"
          onChange={(event) => onChange({ ...draft, remaining_months: event.target.value })}
          value={draft.remaining_months}
        />
      </label>
      <label className="wealth-field wealth-field-optional">
        <span>{copy.fields.loanStartOptional}</span>
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
  copy,
  locale,
  onChange,
  toolsCopy,
}: {
  asset: DraftAsset;
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  locale: AppLocale;
  onChange: (asset: DraftAsset) => void;
  toolsCopy: ReturnType<typeof getWealthToolsLanguage>;
}) {
  const optionId = optionIdForAsset(asset);
  const option = ENTRY_OPTIONS.find((item) => item.id === optionId) ?? ENTRY_OPTIONS[0];
  const fields = getAssetEditFields(optionId);

  if (optionId === "sanchayapatra") {
    return (
      <div className="wealth-pending-entry-edit-form">
        <label className="wealth-field">
          <span>{copy.fields.amount}</span>
          <input inputMode="decimal" onChange={(event) => onChange({ ...asset, value: event.target.value })} value={asset.value} />
        </label>
        <SanchayapatraSnapshotDetailFields copy={copy} draft={asset} locale={locale} onChange={onChange} toolsCopy={toolsCopy} />
      </div>
    );
  }

  return (
    <div className="wealth-pending-entry-edit-form">
      {fields.map((field) => (
        <AssetField asset={asset} copy={copy} field={field} key={field} locale={locale} onChange={onChange} option={option} toolsCopy={toolsCopy} />
      ))}
    </div>
  );
}

function SnapshotLiabilityEditForm({
  copy,
  liability,
  locale,
  onChange,
  toolsCopy,
}: {
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  liability: DraftLiability;
  locale: AppLocale;
  onChange: (liability: DraftLiability) => void;
  toolsCopy: ReturnType<typeof getWealthToolsLanguage>;
}) {
  return (
    <div className="wealth-pending-entry-edit-form">
      <LiabilityDraftForm copy={copy} draft={liability} locale={locale} onChange={onChange} toolsCopy={toolsCopy} />
      <LiabilityProjectionForm copy={copy} draft={liability} locale={locale} onChange={onChange} toolsCopy={toolsCopy} />
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

function defaultLabelForAsset(asset: DraftAsset) {
  const depositType = metadataValue(asset.metadata, "deposit_type");
  const option = ENTRY_OPTIONS.find((item) => item.id === depositType) ?? ENTRY_OPTIONS.find((item) => item.category === asset.category);
  return option?.title ?? asset.category;
}

function identifierLabel(optionId: string, locale: AppLocale) {
  return getCalculatorAccountIdentifierLabel(optionId, locale) ?? "Reference (optional)";
}

