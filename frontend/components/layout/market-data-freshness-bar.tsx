"use client";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { useMarketCacheRefresh } from "@/hooks/market/use-market-cache-coordinator";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
export type MarketDataFreshnessBarProps = { variant?: "inline" | "embedded" | "status"; exchange?: ExchangeCode; className?: string; locale?: AppLocale };
/** Retain the internal subscription and manual recovery, without freshness UI. */
export function MarketDataFreshnessBar({exchange="DSE",className,locale}:MarketDataFreshnessBarProps) {
  useMarketDataFreshness(exchange);
  const refresh=useMarketCacheRefresh();
  const [refreshing,setRefreshing]=useState(false);
  const label=locale==="bn"?"বাজারের তথ্য আবার আনুন":"Refresh market data";
  return <button aria-label={label} title={label} type="button" className={["market-freshness-refresh-button",className].filter(Boolean).join(" ")} disabled={refreshing}
    onClick={()=>{setRefreshing(true);void refresh().finally(()=>setRefreshing(false));}}>
    <RefreshCw aria-hidden="true" size={12} className={refreshing?"market-freshness-refresh-icon-spinning":undefined}/>
  </button>;
}
