export type StockSectionId = "overview" | "technicals" | "fundamentals" | "ownership" | "events" | "related";

export type StockSectionDefinition = {
  id: StockSectionId;
  label: string;
  subtitle: string;
};

export const STOCK_SECTION_DEFINITIONS: StockSectionDefinition[] = [
  { id: "overview", label: "Overview", subtitle: "Price action and trading context" },
  { id: "technicals", label: "Technicals", subtitle: "Momentum, levels, and trade setup" },
  { id: "fundamentals", label: "Fundamentals", subtitle: "Earnings, valuation, and financial health" },
  { id: "ownership", label: "Ownership", subtitle: "Shareholder mix and free float" },
  { id: "events", label: "Events", subtitle: "Recent announcements and corporate actions" },
  { id: "related", label: "Related Stocks", subtitle: "Stocks worth comparing next" },
];
