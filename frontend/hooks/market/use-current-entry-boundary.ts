"use client";

import { useEffect, useRef, useState } from "react";
import { onlineManager, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { BackendMarketFreshnessDto } from "@/lib/api/backend-api-types";
import { currentEntryEvidenceTime, earliestCurrentEntryDeadline, expiredCurrentEntryKeys, fenceCurrentEntryPayload, type CurrentEntryInstrument } from "@/lib/market/current-entry-contract";

/** One deadline on the owning request; resumed permission requires two successful reads. */
export function useCurrentEntryBoundary<T>(data: T, freshness: BackendMarketFreshnessDto | undefined, queryKey: QueryKey, instrument?: CurrentEntryInstrument) {
  const client = useQueryClient();
  const [, renderClock] = useState(0);
  const key = JSON.stringify(queryKey);
  const watermark = useRef({ key, time: 0 });
  const attempted = useRef(new Set<string>());
  const checkpoint = useRef<{ key: string; owner: number; freshness: number } | null>(null);
  if (watermark.current.key !== key) {
    // A fallback is another cached owner, not a successful read for this resume.
    // Retain/rebind the gate even if the previous owner's request just completed.
    checkpoint.current ??= { key: watermark.current.key, owner: 0, freshness: 0 };
    watermark.current = { key, time: 0 };
    attempted.current.clear();
  }
  const evidenceTime = currentEntryEvidenceTime(data);
  const outOfOrder = evidenceTime > 0 && evidenceTime < watermark.current.time;
  watermark.current.time = Math.max(watermark.current.time, evidenceTime);
  const deadline = earliestCurrentEntryDeadline(data, freshness);
  const overdue = expiredCurrentEntryKeys(data, freshness).filter((id) => !attempted.current.has(id)).join("|");
  useEffect(() => {
    const ownerKey: QueryKey = JSON.parse(key);
    const freshnessKey = ["market-freshness", freshness?.exchange ?? "DSE"];
    const complete = () => {
      const pending = checkpoint.current;
      if (!pending || watermark.current.key !== key || pending.key !== key || !onlineManager.isOnline()) return;
      const owner = client.getQueryCache().find({ queryKey: ownerKey, exact: true })?.state;
      const fresh = client.getQueryCache().find({ queryKey: freshnessKey, exact: true })?.state;
      if (owner && fresh && owner.dataUpdateCount > pending.owner && fresh.dataUpdateCount > pending.freshness &&
          owner.status === "success" && fresh.status === "success" && owner.fetchStatus === "idle" && fresh.fetchStatus === "idle") {
        checkpoint.current = null;
        renderClock((clock) => clock + 1);
      }
    };
    const unsubscribe = client.getQueryCache().subscribe(complete);
    const refresh = () => {
      for (const id of expiredCurrentEntryKeys(data, freshness)) attempted.current.add(id);
      checkpoint.current = {
        key,
        owner: client.getQueryCache().find({ queryKey: ownerKey, exact: true })?.state.dataUpdateCount ?? 0,
        freshness: client.getQueryCache().find({ queryKey: freshnessKey, exact: true })?.state.dataUpdateCount ?? 0,
      };
      renderClock((clock) => clock + 1);
      // A paused offline invalidation resolves without a read; only cache success counts above release the fence.
      void client.invalidateQueries({ queryKey: ownerKey, exact: true }, { throwOnError: true }).catch(() => {});
      void client.invalidateQueries({ queryKey: freshnessKey, exact: true }, { throwOnError: true }).catch(() => {});
    };
    const resume = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", resume);
    const remaining = deadline === null ? 0 : deadline - Date.now();
    const timer = remaining > 0 ? window.setTimeout(refresh, remaining) : undefined;
    if (overdue || checkpoint.current && checkpoint.current.key !== key) refresh();
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", resume);
      window.clearTimeout(timer);
    };
  }, [client, data, deadline, freshness, key, overdue]);
  return fenceCurrentEntryPayload(data, freshness, Date.now(), instrument, outOfOrder || !!checkpoint.current);
}
