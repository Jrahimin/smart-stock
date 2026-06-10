"use client";

import { Clock3, Search, Sparkles, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FocusEvent } from "react";

import { useStockSymbolSearch } from "@/hooks/stocks/use-stock-symbol-search";
import type { BackendStockDto } from "@/lib/api/backend-api-types";
import { EXPLORER_QUICK_ACTIONS, type ExplorerQuickAction } from "@/lib/stocks/stock-search-config";

type WorkspaceCommandSearchProps = {
  filterContextName?: string;
  onFilterTable?: (query: string) => void;
  showQuickActions?: boolean;
};

type SearchMenuItem =
  | { kind: "stock"; stock: Pick<BackendStockDto, "exchange" | "symbol" | "name">; meta?: string }
  | { kind: "filter"; query: string; label: string };

function useSearchShortcutLabel() {
  const [label, setLabel] = useState("Ctrl K");

  useEffect(() => {
    const isApplePlatform = /Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent);
    setLabel(isApplePlatform ? "⌘ K" : "Ctrl K");
  }, []);

  return label;
}

export function WorkspaceCommandSearch({
  filterContextName = "stock explorer",
  onFilterTable,
  showQuickActions = true,
}: WorkspaceCommandSearchProps) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const shortcutLabel = useSearchShortcutLabel();
  const {
    query,
    setQuery,
    results,
    recentSearches,
    popularStocks,
    isSearching,
    isSearchEnabled,
    navigateToStock,
    applyTableFilter,
    submitQuery,
    reset,
  } = useStockSymbolSearch({ onFilterTable });

  function applyFilterQuery(filterQuery: string) {
    if (onFilterTable) {
      applyTableFilter(filterQuery);
      return;
    }

    const params = new URLSearchParams({ search: filterQuery });
    router.push(`/stocks?${params.toString()}`);
    reset();
  }

  const menuItems = useMemo<SearchMenuItem[]>(() => {
    if (isSearchEnabled) {
      const stockItems: SearchMenuItem[] = results.map((stock) => ({
        kind: "stock",
        stock,
        meta: `${stock.exchange} · ${stock.sector ?? "Unclassified"}`,
      }));

      if (query.trim() && (stockItems.length !== 1 || stockItems[0]?.stock.symbol.toUpperCase() !== query.trim().toUpperCase())) {
        stockItems.push({
          kind: "filter",
          query: query.trim(),
          label: `Filter ${filterContextName} for “${query.trim()}”`,
        });
      }

      return stockItems;
    }

    const items: SearchMenuItem[] = [];

    for (const stock of recentSearches) {
      items.push({ kind: "stock", stock, meta: "Recent" });
    }

    for (const stock of popularStocks) {
      if (items.some((item) => item.kind === "stock" && item.stock.symbol === stock.symbol)) {
        continue;
      }

      items.push({ kind: "stock", stock, meta: "Popular" });
    }

    return items;
  }, [filterContextName, isSearchEnabled, popularStocks, query, recentSearches, results]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setActiveIndex(menuItems.length ? 0 : -1);
  }, [menuItems]);

  function closeMenu() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleSelect(item: SearchMenuItem) {
    if (item.kind === "stock") {
      navigateToStock(item.stock);
    } else {
      applyFilterQuery(item.query);
    }

    closeMenu();
  }

  function handleQuickAction(action: ExplorerQuickAction) {
    if (action.type === "stock") {
      navigateToStock(action);
      return;
    }

    applyFilterQuery(action.query);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (containerRef.current?.contains(event.relatedTarget as Node)) {
      return;
    }

    window.setTimeout(() => closeMenu(), 120);
  }

  const showMenu = isOpen && (isSearchEnabled || menuItems.length > 0);

  return (
    <div className="explorer-command-search" onBlur={handleBlur} ref={containerRef}>
      <div className={`explorer-command-input-shell ${isOpen ? "is-open" : ""}`}>
        <label className="explorer-command-search-icon" htmlFor={inputId}>
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">Search stocks</span>
        </label>
        <input
          aria-autocomplete="list"
          aria-controls={showMenu ? `${inputId}-results` : undefined}
          aria-expanded={showMenu}
          autoComplete="off"
          className="explorer-command-input"
          id={inputId}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!menuItems.length) {
                return;
              }
              setIsOpen(true);
              setActiveIndex((current) => (current + 1) % menuItems.length);
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (!menuItems.length) {
                return;
              }
              setIsOpen(true);
              setActiveIndex((current) => (current <= 0 ? menuItems.length - 1 : current - 1));
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              const selected = menuItems[activeIndex];
              if (selected) {
                handleSelect(selected);
                return;
              }

              if (submitQuery()) {
                closeMenu();
                return;
              }

              if (query.trim() && onFilterTable) {
                applyFilterQuery(query.trim());
                closeMenu();
              }
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              reset();
              closeMenu();
              inputRef.current?.blur();
            }
          }}
          placeholder="Search stocks, companies, sectors, or signals..."
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          value={query}
        />
        <kbd className="explorer-command-kbd" title="Focus stock search">
          {shortcutLabel}
        </kbd>
      </div>

      {showMenu ? (
        <div className="explorer-command-menu" id={`${inputId}-results`} role="listbox">
          {!isSearchEnabled ? (
            <>
              {recentSearches.length ? (
                <div className="explorer-command-section">
                  <div className="explorer-command-section-label">
                    <Clock3 aria-hidden="true" size={14} />
                    Recent
                  </div>
                  {menuItems.map((item, index) =>
                    item.kind === "stock" && item.meta === "Recent" ? (
                      <MenuOption
                        isActive={index === activeIndex}
                        item={item}
                        key={`recent-${item.stock.symbol}`}
                        onSelect={handleSelect}
                      />
                    ) : null,
                  )}
                </div>
              ) : null}
              <div className="explorer-command-section">
                <div className="explorer-command-section-label">
                  <TrendingUp aria-hidden="true" size={14} />
                  Popular stocks
                </div>
                {menuItems.map((item, index) =>
                  item.kind === "stock" && item.meta === "Popular" ? (
                    <MenuOption
                      isActive={index === activeIndex}
                      item={item}
                      key={`popular-${item.stock.symbol}`}
                      onSelect={handleSelect}
                    />
                  ) : null,
                )}
              </div>
            </>
          ) : (
            <div className="explorer-command-section">
              <div className="explorer-command-section-label">
                <Sparkles aria-hidden="true" size={14} />
                {isSearching ? "Searching…" : "Suggestions"}
              </div>
              {isSearching && !menuItems.length ? <div className="explorer-command-empty">Searching…</div> : null}
              {!isSearching && !menuItems.length ? <div className="explorer-command-empty">No matching symbol</div> : null}
              {menuItems.map((item, index) => (
                <MenuOption isActive={index === activeIndex} item={item} key={`${item.kind}-${index}`} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {showQuickActions ? (
        <div className="explorer-command-quick-actions" role="group" aria-label="Quick stock shortcuts">
          {EXPLORER_QUICK_ACTIONS.map((action) => (
            <button
              className="explorer-command-quick-chip"
              key={action.label}
              onClick={() => handleQuickAction(action)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type MenuOptionProps = {
  item: SearchMenuItem;
  isActive: boolean;
  onSelect: (item: SearchMenuItem) => void;
};

function MenuOption({ item, isActive, onSelect }: MenuOptionProps) {
  if (item.kind === "filter") {
    return (
      <button
        aria-selected={isActive}
        className={isActive ? "explorer-command-option is-active" : "explorer-command-option"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelect(item)}
        role="option"
        type="button"
      >
        <span className="explorer-command-option-filter">{item.label}</span>
      </button>
    );
  }

  return (
    <button
      aria-selected={isActive}
      className={isActive ? "explorer-command-option is-active" : "explorer-command-option"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(item)}
      role="option"
      type="button"
    >
      <strong>{item.stock.symbol}</strong>
      <span>
        {item.stock.name}
        {item.meta ? ` · ${item.meta}` : ""}
      </span>
    </button>
  );
}
