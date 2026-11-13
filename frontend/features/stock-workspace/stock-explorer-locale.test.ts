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
    ).toBe("8 of 413 stocks · 8 shown · Prices for 413 of 428 listed stocks");
  });
  it.each(["en", "bn"] as const)("keeps the complete list subtitle compact and count-based (%s)", locale => {
    const copy = getStockExplorerLanguage(locale).hero;
    expect(copy.readySubtitle({ filteredCount: 426, listedStockCount: 426, loadedPriceCount: 426, visibleCount: 120, isTableFiltered: false }))
      .toBe(locale === "en" ? "426 stocks · 120 shown" : "426টি শেয়ার · 120টি দেখানো");
    expect(copy.loadingSubtitle).not.toMatch(/426|120/);
  });
});
