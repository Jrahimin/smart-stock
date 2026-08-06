import { describe, expect, it } from "vitest";

import { getStockExplorerLanguage } from "@/features/stock-workspace/stock-explorer-language";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

describe("stock explorer language", () => {
  it("defaults to bn explorer copy", () => {
    const language = getStockExplorerLanguage(DEFAULT_LOCALE);

    expect(language.search.globalPlaceholder).toContain("শেয়ার");
    expect(language.search.tablePlaceholder).toContain("Symbol");
    expect(language.search.globalAriaLabel).toBe("Global stock search");
    expect(language.search.tableAriaLabel).toBe("Filter Explorer table");
  });

  it("keeps English discovery and table-filter placeholders distinct", () => {
    const language = getStockExplorerLanguage("en");

    expect(language.search.globalPlaceholder).toBe("Search any stock…");
    expect(language.search.tablePlaceholder).toBe("Filter symbol or company…");
    expect(language.states.emptySearchTitle("GP")).toBe("No Explorer rows match ‘GP’.");
  });

  it("reports filtered count copy when table filters are active", () => {
    const language = getStockExplorerLanguage("en");

    expect(
      language.hero.readySubtitle({
        filteredCount: 8,
        listedStockCount: 428,
        loadedPriceCount: 413,
        visibleCount: 8,
        isTableFiltered: true,
      }),
    ).toBe("Showing 8 of 413 session-backed stocks (428 listed).");
  });
});
