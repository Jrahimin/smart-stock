import { getSanchayapatraConfig } from "@/features/wealth/catalog/sanchayapatra-catalog";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";

export type SnapshotDraftAsset = {
  category: string;
  label: string;
  value: string;
  liquidity_tier: string;
  metadata: Record<string, unknown>;
};

export type SnapshotDraftLiability = {
  category: string;
  label: string;
  balance: string;
  interest_rate: string;
  monthly_emi: string;
  remaining_months: string;
  metadata: Record<string, unknown>;
};

export function metadataValue(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return value == null ? "" : String(value);
}

export function setMetadataValue(metadata: Record<string, unknown>, key: string, value: string) {
  return { ...metadata, [key]: value };
}

export function maskIdentifier(value: string) {
  if (value.length <= 4) {
    return value;
  }
  return `****${value.slice(-4)}`;
}

export function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-BD", { month: "short", year: "numeric" }).format(date);
}

export function resolveAssetStartDate(metadata: Record<string, unknown>) {
  return metadataValue(metadata, "start_date") || metadataValue(metadata, "purchase_date");
}

export function resolveAssetEndDate(metadata: Record<string, unknown>) {
  return metadataValue(metadata, "maturity_date");
}

export function formatDateRange(startDate: string, endDate: string) {
  if (startDate && endDate) {
    return `${formatDateLabel(startDate)}–${formatDateLabel(endDate)}`;
  }
  if (endDate) {
    return `→ ${formatDateLabel(endDate)}`;
  }
  if (startDate) {
    return `from ${formatDateLabel(startDate)}`;
  }
  return null;
}

export function computeSanchayapatraMaturityDate(metadata: Record<string, unknown>) {
  const purchaseDate = metadataValue(metadata, "purchase_date");
  if (!purchaseDate) {
    return "";
  }
  const certificateType = metadataValue(metadata, "certificate_type") || "family-savings";
  const config = getSanchayapatraConfig(certificateType);
  const start = new Date(purchaseDate);
  if (Number.isNaN(start.getTime())) {
    return "";
  }
  start.setFullYear(start.getFullYear() + config.durationYears);
  return start.toISOString().slice(0, 10);
}

export function ensureAssetPlanningDates(asset: SnapshotDraftAsset) {
  if (asset.category !== "SANCHAYAPATRA") {
    return asset.metadata;
  }
  if (metadataValue(asset.metadata, "maturity_date")) {
    return asset.metadata;
  }
  const computedMaturity = computeSanchayapatraMaturityDate(asset.metadata);
  if (!computedMaturity) {
    return asset.metadata;
  }
  return { ...asset.metadata, maturity_date: computedMaturity };
}

export function buildAssetMetaLine(asset: SnapshotDraftAsset) {
  const metadata = ensureAssetPlanningDates(asset);
  const interestRate = metadataValue(metadata, "interest_rate");
  const paymentCount = metadataValue(metadata, "payment_count");
  const goldWeight = metadataValue(metadata, "gold_weight");
  const goldUnit = metadataValue(metadata, "gold_weight_unit");
  const accountIdentifier = metadataValue(metadata, "account_identifier");
  const dateRange = formatDateRange(resolveAssetStartDate(metadata), resolveAssetEndDate(metadata));

  return [
    interestRate ? `${interestRate}%` : null,
    paymentCount ? `${paymentCount} pymts` : null,
    goldWeight ? `${goldWeight} ${goldUnit || "g"}` : null,
    dateRange,
    accountIdentifier ? `Ref ${maskIdentifier(accountIdentifier)}` : null,
  ].filter(Boolean);
}

export function buildLiabilityMetaLine(liability: SnapshotDraftLiability) {
  const accountIdentifier = metadataValue(liability.metadata, "account_identifier");
  const startDate = metadataValue(liability.metadata, "start_date");

  return [
    liability.interest_rate ? `${liability.interest_rate}%` : null,
    liability.monthly_emi ? `EMI ${formatWealthCurrency(liability.monthly_emi)}` : null,
    liability.remaining_months ? `${liability.remaining_months} mo` : null,
    startDate ? `from ${formatDateLabel(startDate)}` : null,
    accountIdentifier ? `Ref ${maskIdentifier(accountIdentifier)}` : null,
  ].filter(Boolean);
}

export function assetIconForDraft(asset: SnapshotDraftAsset, entryIcons: Record<string, string>) {
  const depositType = metadataValue(asset.metadata, "deposit_type");
  if (depositType && entryIcons[depositType]) {
    return entryIcons[depositType];
  }
  if (asset.category === "SANCHAYAPATRA") {
    return entryIcons.sanchayapatra ?? "🇧🇩";
  }
  const categoryIcon = entryIcons[asset.category.toLowerCase()];
  return categoryIcon ?? "📦";
}

export function optionIdForAsset(asset: SnapshotDraftAsset) {
  const depositType = metadataValue(asset.metadata, "deposit_type");
  if (depositType) {
    return depositType;
  }
  if (asset.category === "SANCHAYAPATRA") {
    return "sanchayapatra";
  }
  if (asset.category === "CASH") {
    return "cash";
  }
  if (asset.category === "STOCK") {
    return "stocks";
  }
  if (asset.category === "GOLD") {
    return "gold";
  }
  if (asset.category === "PROPERTY") {
    return "property";
  }
  return "other";
}
