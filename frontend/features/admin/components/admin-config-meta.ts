import type { AdminConfigCategory, ConfigValueType } from "@/features/admin/types/admin-types";

export type AdminConfigControl = "toggle" | "time" | "number" | "text";

export type AdminConfigMeta = {
  label: string;
  control: AdminConfigControl;
  unit?: string;
};

export const ADMIN_CONFIG_CATEGORY_LABELS: Record<AdminConfigCategory, string> = {
  SYSTEM: "Scheduler Settings",
  MARKET: "Market Settings",
  FEATURE_FLAG: "Feature Flags",
  EMAIL: "Email Settings",
  SCRAPER: "Scraping Settings",
};

export const ADMIN_CONFIG_META: Record<string, AdminConfigMeta> = {
  market_snapshot_scheduler_enabled: { label: "Market Snapshot Scheduler", control: "toggle" },
  daily_market_sync_scheduler_enabled: { label: "Daily Market Sync Scheduler", control: "toggle" },
  market_open_time: { label: "Market Open Time", control: "time" },
  market_close_time: { label: "Market Close Time", control: "time" },
  market_snapshot_interval_minutes: { label: "Snapshot Interval", control: "number", unit: "min" },
  daily_market_sync_time: { label: "Daily Sync Time", control: "time" },
  daily_market_stocknow_validation_enabled: { label: "StockNow Validation", control: "toggle" },
  daily_market_stocknow_fallback_enabled: { label: "StockNow Fallback", control: "toggle" },
  amarstock_news_ingestion_enabled: { label: "News Ingestion", control: "toggle" },
  amarstock_daily_latest_price_patch_enabled: { label: "Latest Price Patch", control: "toggle" },
  amarstock_index_summary_enabled: { label: "Index Summary Ingestion", control: "toggle" },
  amarstock_latest_price_stock_details_enabled: { label: "Stock Details Price Enrichment", control: "toggle" },
};

export function getConfigMeta(key: string, valueType: ConfigValueType): AdminConfigMeta {
  const known = ADMIN_CONFIG_META[key];
  if (known) return known;

  if (valueType === "BOOLEAN") return { label: humanizeKey(key), control: "toggle" };
  if (valueType === "INTEGER" || valueType === "FLOAT") return { label: humanizeKey(key), control: "number" };
  return { label: humanizeKey(key), control: "text" };
}

function humanizeKey(key: string) {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
