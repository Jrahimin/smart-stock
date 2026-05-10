import { create } from "zustand";
import { persist } from "zustand/middleware";

type WorkspaceState = {
  sidebarCollapsed: boolean;
  activeWatchlistId: string;
  chartTimeframe: "1M" | "3M" | "6M" | "1Y";
  visibleIndicators: string[];
  toggleSidebar: () => void;
  setActiveWatchlistId: (watchlistId: string) => void;
  setChartTimeframe: (timeframe: WorkspaceState["chartTimeframe"]) => void;
  setVisibleIndicators: (indicators: string[]) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeWatchlistId: "default",
      chartTimeframe: "3M",
      visibleIndicators: ["SMA", "EMA", "RSI"],
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setActiveWatchlistId: (watchlistId) => set({ activeWatchlistId: watchlistId }),
      setChartTimeframe: (timeframe) => set({ chartTimeframe: timeframe }),
      setVisibleIndicators: (indicators) => set({ visibleIndicators: indicators }),
    }),
    {
      name: "smart-stock-workspace",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        activeWatchlistId: state.activeWatchlistId,
        chartTimeframe: state.chartTimeframe,
        visibleIndicators: state.visibleIndicators,
      }),
    },
  ),
);
