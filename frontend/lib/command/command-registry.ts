import type { CommandItem } from "@/lib/command/command-types";

export const coreCommandItems: CommandItem[] = [
  {
    id: "go-market-pulse",
    label: "Open Market Pulse",
    description: "The stocks and market shifts that deserve your attention.",
    category: "NAVIGATION",
    href: "/market-pulse",
    keywords: ["pulse", "focus", "briefing", "attention"],
  },
  {
    id: "go-dashboard",
    label: "Open Market Dashboard",
    description: "15-second read of market mood, breadth, signals, and events.",
    category: "NAVIGATION",
    href: "/dashboard",
    keywords: ["market", "overview", "dsex"],
  },
  {
    id: "go-stocks",
    label: "Open Stock Explorer",
    description: "Search and filter listed DSE/CSE stocks.",
    category: "NAVIGATION",
    href: "/stocks",
    keywords: ["screener", "research"],
  },
  {
    id: "go-scanner",
    label: "Open Market Scanner",
    description: "Jump to opportunity detection categories.",
    category: "SCANNER",
    href: "/scanner",
    keywords: ["breakout", "momentum", "volume"],
  },
  {
    id: "go-signals",
    label: "Open Signal Center",
    description: "Review institutional signal explanations.",
    category: "SIGNAL",
    href: "/signals",
    keywords: ["buy", "sell", "hold"],
  },
  {
    id: "go-watchlist",
    label: "Open Watchlist Intelligence",
    description: "Review grouped watchlists, heatmaps, and alerts.",
    category: "WATCHLIST",
    href: "/watchlist",
    keywords: ["alerts", "heatmap"],
  },
];
