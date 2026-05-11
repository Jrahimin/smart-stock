"use client";

import { useRef, useState } from "react";

type FloatingRefreshButtonProps = {
  disabled?: boolean;
  disabledReason?: string;
  onRefresh: () => Promise<void> | void;
};

export function FloatingRefreshButton({ disabled = false, disabledReason, onRefresh }: FloatingRefreshButtonProps) {
  const [status, setStatus] = useState<"idle" | "refreshing" | "updated">("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleRefresh() {
    if (disabled || status === "refreshing") {
      return;
    }

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    setStatus("refreshing");
    await onRefresh();
    setStatus("updated");
    resetTimerRef.current = setTimeout(() => setStatus("idle"), 1400);
  }

  return (
    <button
      aria-label="Refresh data. Daily synced market data is cached for 2 hours."
      className={`floating-refresh-button floating-refresh-button-${status}`}
      disabled={disabled || status === "refreshing"}
      onClick={() => void handleRefresh()}
      title={disabledReason ?? "Daily synced market data is cached for 2 hours. Refresh after a manual sync or data correction."}
      type="button"
    >
      <span aria-hidden="true" />
      {disabled ? "Refresh Paused" : status === "refreshing" ? "Refreshing" : status === "updated" ? "Updated" : "Refresh Data"}
    </button>
  );
}
