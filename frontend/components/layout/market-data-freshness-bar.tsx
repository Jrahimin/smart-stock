"use client";
import { Clock3, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { formatRelativeLastUpdated, useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { useMarketCacheRefresh } from "@/hooks/market/use-market-cache-coordinator";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
export type MarketDataFreshnessBarProps = { variant?: "inline" | "embedded" | "status"; exchange?: ExchangeCode; className?: string; locale?: AppLocale };
export function MarketDataFreshnessBar({ exchange = "DSE", className, locale = "en", variant = "inline" }: MarketDataFreshnessBarProps) {
  const { data, isError } = useMarketDataFreshness(exchange);
  const refresh=useMarketCacheRefresh();
  const [refreshing,setRefreshing]=useState(false);
  const [now, setNow] = useState<number | null>(null);
  const timestamp = data?.last_synced_at ?? null;
  useEffect(() => {
    if (!timestamp) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [timestamp]);
  const age = now === null || isError ? null : formatRelativeLastUpdated(timestamp, locale, now);
  const exact = age && timestamp ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(timestamp)) : undefined;
  const label = locale === "bn" ? "বাজারের তথ্য আবার দেখুন" : "Refresh market data";
  const hint = locale === "bn" ? "নতুন তথ্য এসেছে কি না দেখুন" : "Check for newer published market data";
  return <div className={`market-freshness-compact market-freshness-bar-${variant} ${className ?? ""}`}>
    {age && timestamp ? <time className="market-freshness-age" dateTime={timestamp} title={exact ? `${exact} · ${locale === "bn" ? "ঢাকা সময়" : "Dhaka time"}` : undefined}>
      <Clock3 aria-hidden="true" size={12} />
      {locale === "bn" ? `শেষ আপডেট ${age}` : `Last updated ${age}`}
    </time> : null}
    <button aria-label={label} title={hint} type="button" className="market-freshness-refresh-button" disabled={refreshing}
      onClick={()=>{setRefreshing(true);void refresh().finally(()=>setRefreshing(false));}}>
      <RefreshCw aria-hidden="true" size={12} className={refreshing?"market-freshness-refresh-icon-spinning":undefined}/>
    </button>
  </div>;
}
