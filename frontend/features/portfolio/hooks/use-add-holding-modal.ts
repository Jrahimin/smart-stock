"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyLatestQuoteToSelectedStock,
  buildAddHoldingPreview,
  isAddHoldingFormValid,
  parsePositiveDecimal,
  resolveExistingWatchlistState,
  selectedStockFromSearchResult,
  validateAddHoldingForm,
  type AddHoldingMode,
  type AddHoldingSelectedStock,
} from "@/features/portfolio/view-models/add-holding-preview";
import { useDebouncedStockSearch } from "@/hooks/stocks/use-debounced-stock-search";
import type {
  BackendPortfolioHoldingDto,
  MarketDataState,
} from "@/lib/api/backend-api-types";
import { listDailyPrices } from "@/lib/api/market-data-api";
import {
  addWatchlistItem,
  updateWatchlistItem,
} from "@/lib/api/watchlist-api";

const HIGHLIGHT_MS = 2800;

type UseAddHoldingModalOptions = {
  watchlistItems: BackendPortfolioHoldingDto[];
  publishedMarketDate: string | null;
  dataState: MarketDataState;
  exchange?: "DSE" | "CSE";
};

function normalizeNote(note: string) {
  const trimmed = note.trim();
  return trimmed || null;
}

export function useAddHoldingModal({
  watchlistItems,
  publishedMarketDate,
  dataState,
  exchange = "DSE",
}: UseAddHoldingModalOptions) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AddHoldingMode>("create");
  const [selectedStock, setSelectedStock] = useState<AddHoldingSelectedStock | null>(null);
  const [stockLocked, setStockLocked] = useState(false);
  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState("");
  const [averageBuyPrice, setAverageBuyPrice] = useState("");
  const [note, setNote] = useState("");
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [highlightedStockId, setHighlightedStockId] = useState<string | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);

  useEffect(() => {
    if (!highlightedStockId) return;
    const timeoutId = window.setTimeout(() => setHighlightedStockId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedStockId]);

  const {
    results: searchResults,
    isSearching,
    isSearchEnabled,
    isError: searchError,
  } = useDebouncedStockSearch({
    query,
    enabled: isOpen && !stockLocked,
    exchange,
    limit: 12,
  });

  const quoteQuery = useQuery({
    queryKey: ["stocks", "latest-quote", selectedStock?.stockId],
    queryFn: async () => {
      const rows = await listDailyPrices(selectedStock!.stockId, { limit: 1 });
      return rows[0] ?? null;
    },
    enabled: isOpen && Boolean(selectedStock?.stockId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const selectedStockWithQuote = useMemo(() => {
    if (!selectedStock) return null;
    if (!quoteQuery.data) return selectedStock;
    return applyLatestQuoteToSelectedStock(
      selectedStock,
      quoteQuery.data,
      publishedMarketDate,
      dataState,
    );
  }, [dataState, publishedMarketDate, quoteQuery.data, selectedStock]);

  const resetForm = useCallback(() => {
    setSelectedStock(null);
    setStockLocked(false);
    setQuery("");
    setQuantity("");
    setAverageBuyPrice("");
    setNote("");
    setNoteExpanded(false);
    setShowValidation(false);
    setActiveOptionIndex(-1);
    setMode("create");
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    resetForm();
  }, [resetForm]);

  const openCreate = useCallback(() => {
    resetForm();
    setMode("create");
    setIsOpen(true);
  }, [resetForm]);

  const selectStock = useCallback((stock: AddHoldingSelectedStock, displayQuery?: string) => {
    const existing = resolveExistingWatchlistState(watchlistItems, stock.stockId);
    setSelectedStock(stock);
    setStockLocked(true);
    setQuery(displayQuery ?? `${stock.symbol} — ${stock.name}`);
    setActiveOptionIndex(-1);
    if (existing.isHolding && existing.existing) {
      setMode("edit");
      setQuantity(existing.existing.quantity ?? "");
      setAverageBuyPrice(existing.existing.average_buy_price ?? "");
      setNote(existing.existing.note ?? "");
      setNoteExpanded(Boolean(existing.existing.note));
      return;
    }
    if (existing.isWatched) {
      setMode("complete");
      return;
    }
    setMode("create");
  }, [watchlistItems]);

  const selectSearchResult = useCallback((stock: (typeof searchResults)[number]) => {
    selectStock(selectedStockFromSearchResult(stock, publishedMarketDate, dataState));
  }, [dataState, publishedMarketDate, selectStock]);

  const clearSelectedStock = useCallback(() => {
    setSelectedStock(null);
    setStockLocked(false);
    setQuery("");
    setActiveOptionIndex(-1);
    setMode("create");
    setQuantity("");
    setAverageBuyPrice("");
    setNote("");
    setNoteExpanded(false);
  }, []);

  const existingState = useMemo(
    () => resolveExistingWatchlistState(watchlistItems, selectedStockWithQuote?.stockId ?? null),
    [selectedStockWithQuote?.stockId, watchlistItems],
  );

  const quantityValue = parsePositiveDecimal(quantity);
  const averageBuyPriceValue = parsePositiveDecimal(averageBuyPrice);

  const preview = useMemo(
    () => buildAddHoldingPreview(
      quantityValue,
      averageBuyPriceValue,
      selectedStockWithQuote?.latestPrice ?? null,
      selectedStockWithQuote?.priceStatus ?? "UNAVAILABLE",
    ),
    [averageBuyPriceValue, quantityValue, selectedStockWithQuote],
  );

  const validation = useMemo(
    () => validateAddHoldingForm({
      stockId: selectedStockWithQuote?.stockId ?? null,
      quantity,
      averageBuyPrice,
    }),
    [averageBuyPrice, quantity, selectedStockWithQuote?.stockId],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStockWithQuote || !isAddHoldingFormValid(validation)) {
        throw new Error("Invalid holding form");
      }
      const quantityNumber = parsePositiveDecimal(quantity);
      const buyPriceNumber = parsePositiveDecimal(averageBuyPrice);
      if (quantityNumber == null || buyPriceNumber == null) {
        throw new Error("Invalid holding numbers");
      }

      if (!existingState.isWatched) {
        await addWatchlistItem(selectedStockWithQuote.stockId);
      }

      return updateWatchlistItem(selectedStockWithQuote.stockId, {
        is_holding: true,
        quantity: quantityNumber,
        buy_price: buyPriceNumber,
        note: normalizeNote(note),
      });
    },
    onSuccess: () => {
      const stockId = selectedStockWithQuote?.stockId ?? null;
      void queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      void queryClient.invalidateQueries({
        queryKey: ["portfolio"],
        refetchType: "active",
      });
      close();
      if (stockId) setHighlightedStockId(stockId);
    },
  });

  const submit = useCallback(() => {
    setShowValidation(true);
    if (!isAddHoldingFormValid(validation)) return;
    saveMutation.mutate();
  }, [saveMutation, validation]);

  return {
    isOpen,
    mode,
    openCreate,
    close,
    query,
    setQuery,
    selectedStock: selectedStockWithQuote,
    stockLocked,
    stockPickerLocked: false,
    clearSelectedStock,
    selectSearchResult,
    searchResults,
    isSearching,
    isSearchEnabled,
    searchError,
    activeOptionIndex,
    setActiveOptionIndex,
    quantity,
    setQuantity,
    averageBuyPrice,
    setAverageBuyPrice,
    note,
    setNote,
    noteExpanded,
    setNoteExpanded,
    showValidation,
    validation,
    preview,
    existingState,
    submit,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.isError,
    highlightedStockId,
  };
}

export type AddHoldingModalController = ReturnType<typeof useAddHoldingModal>;
