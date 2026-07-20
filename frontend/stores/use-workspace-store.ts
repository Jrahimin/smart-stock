import { create } from "zustand";
import { persist } from "zustand/middleware";

type WorkspaceState = {
  sidebarCollapsed: boolean;
  theme: "dark" | "light";
  activeWatchlistId: string;
  chartTimeframe: "1M" | "3M" | "6M" | "1Y";
  visibleIndicators: string[];
  toggleSidebar: () => void;
  collapseSidebar: () => void;
  setTheme: (theme: WorkspaceState["theme"]) => void;
  setActiveWatchlistId: (watchlistId: string) => void;
  setChartTimeframe: (timeframe: WorkspaceState["chartTimeframe"]) => void;
  setVisibleIndicators: (indicators: string[]) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      sidebarCollapsed: true,
      theme: "dark",
      activeWatchlistId: "default",
      chartTimeframe: "3M",
      visibleIndicators: ["SMA", "EMA", "RSI"],
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      collapseSidebar: () => set({ sidebarCollapsed: true }),
      setTheme: (theme) => set({ theme }),
      setActiveWatchlistId: (watchlistId) => set({ activeWatchlistId: watchlistId }),
      setChartTimeframe: (timeframe) => set({ chartTimeframe: timeframe }),
      setVisibleIndicators: (indicators) => set({ visibleIndicators: indicators }),
    }),
    {
      name: "smart-stock-workspace",
      version: 2,
      migrate: (persistedState) => {
        const previous = persistedState as Partial<WorkspaceState>;

        return {
          // The compact rail is now the default, including for existing workspaces.
          sidebarCollapsed: true,
          theme: previous.theme ?? "dark",
          activeWatchlistId: previous.activeWatchlistId ?? "default",
          chartTimeframe: previous.chartTimeframe ?? "3M",
          visibleIndicators: previous.visibleIndicators ?? ["SMA", "EMA", "RSI"],
        };
      },
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        activeWatchlistId: state.activeWatchlistId,
        chartTimeframe: state.chartTimeframe,
        visibleIndicators: state.visibleIndicators,
      }),
    },
  ),
);
