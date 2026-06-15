"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/context/auth-context";
import { useWealthDashboard } from "@/features/wealth/hooks/use-wealth-dashboard";
import { readLocalMoneySnapshot } from "@/features/wealth/lib/local-money-snapshot";
import { readDismissedWealthInsightIds } from "@/features/wealth/lib/wealth-nav-insight-storage";

const MATURITY_WINDOW_DAYS = 60;

export function useWealthWorkspaceInsightIndicator() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { dashboard } = useWealthDashboard();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    setDismissedIds(readDismissedWealthInsightIds());
  }, [pathname]);

  return useMemo(() => {
    const hasUnreadInsights =
      isAuthenticated &&
      (dashboard?.insights ?? []).some((insight) => !dismissedIds.includes(insight.id));

    if (hasUnreadInsights) {
      return true;
    }

    const snapshot = readLocalMoneySnapshot();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hasApproachingMaturity = snapshot.assets.some((asset) => {
      const maturityDate = asset.metadata?.maturity_date;
      if (typeof maturityDate !== "string") {
        return false;
      }

      const date = new Date(maturityDate);
      if (Number.isNaN(date.getTime())) {
        return false;
      }

      const daysUntil = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= MATURITY_WINDOW_DAYS;
    });

    return hasApproachingMaturity;
  }, [dashboard?.insights, dismissedIds, isAuthenticated, pathname]);
}
