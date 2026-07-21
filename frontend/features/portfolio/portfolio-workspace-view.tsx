"use client";

import {
  AlertTriangle, ArrowRight, BriefcaseBusiness, CheckCircle2, ChevronDown,
  CircleAlert, Eye, Layers3, Mail, Pencil, Search, ShieldAlert,
  StickyNote, TrendingDown, TrendingUp, WalletCards, X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { MarketDataFreshnessBar } from "@/components/layout/market-data-freshness-bar";
import { DashboardLocaleSwitcher } from "@/features/market-dashboard/components/dashboard-locale-switcher";
import { usePortfolioEmailPreference } from "@/features/portfolio/hooks/use-portfolio-email-preference";
import { usePortfolioWorkspace } from "@/features/portfolio/hooks/use-portfolio-workspace";
import { portfolioLanguage } from "@/features/portfolio/portfolio-language";
import {
  attentionFilterForCode,
  countCompletedHoldings,
  countIncompleteHoldings,
  filterPortfolioHoldings,
  financialTone,
  formatPortfolioMoney,
  formatPortfolioNumber,
  formatPortfolioPercent,
  formatPortfolioPriceState,
  formatSignedPercent,
  getPortfolioSignalMeta,
  getPortfolioWhatNextCopy,
  isPortfolioReviewRow,
  sortPortfolioGroupRows,
  type PortfolioHoldingFilter,
} from "@/features/portfolio/view-models/portfolio-view-model";
import { useWatchlistItemRemove } from "@/features/watchlist/hooks/use-watchlist-item-remove";
import { useWatchlistItemUpdate } from "@/features/watchlist/hooks/use-watchlist-item-update";
import type {
  BackendPortfolioHoldingDto,
  BackendPortfolioPositionReferenceDto,
  BackendPortfolioWorkspaceDto,
  ExchangeCode,
  PortfolioAttentionCode,
} from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";

type PortfolioWorkspaceViewProps = { locale: AppLocale };

function Value({ value, locale, percent = false }: { value: string | null; locale: AppLocale; percent?: boolean }) {
  return <span className={`portfolio-financial is-${financialTone(value)}`}>{percent ? formatSignedPercent(value) : formatPortfolioMoney(value, locale)}</span>;
}

function StockSymbolTile({ exchange, symbol, name }: { exchange: ExchangeCode; symbol: string; name: string }) {
  return (
    <Link className="portfolio-symbol-tile" href={buildStockDetailPath(exchange, symbol)}>
      <strong>{symbol}</strong>
      <span>{name}</span>
    </Link>
  );
}

function PortfolioHero({
  data,
  locale,
  incompleteCount,
  reviewCount,
  onCompleteHoldings,
}: {
  data: BackendPortfolioWorkspaceDto;
  locale: AppLocale;
  incompleteCount: number;
  reviewCount: number;
  onCompleteHoldings: () => void;
}) {
  const t = portfolioLanguage[locale];
  const dataStateLabel = data.pulse.current_value_is_complete ? t.chipDataState : t.estimated;

  return (
    <header className="portfolio-header portfolio-header-v2">
      <div className="portfolio-header-main">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
        <div className="portfolio-hero-chips">
          <span className="portfolio-chip is-violet">{t.chipHoldings(data.meta.holding_count)}</span>
          <span className="portfolio-chip">{t.chipWatched(data.meta.total_watchlisted)}</span>
          {incompleteCount > 0 && <span className="portfolio-chip is-warning">{t.chipIncomplete(incompleteCount)}</span>}
          {reviewCount > 0 && <span className="portfolio-chip is-amber">{t.chipReview(reviewCount)}</span>}
          <span className={`portfolio-chip ${data.meta.is_provisional ? "is-live" : "is-positive"}`}>{dataStateLabel}</span>
        </div>
        {/* {incompleteCount > 0 && (
          <button className="portfolio-hero-cta" onClick={onCompleteHoldings} type="button">
            {t.completeHoldings}
            <ArrowRight size={14} />
          </button>
        )} */}
      </div>
      <div className="portfolio-header-context">
        <div className="portfolio-header-utilities">
          <MarketDataFreshnessBar exchange={data.meta.exchange} locale={locale} variant="inline" />
          <DashboardLocaleSwitcher ariaLabel="Portfolio language" locale={locale} variant="compact" />
        </div>
      </div>
    </header>
  );
}

function PortfolioPulse({
  data,
  locale,
  completedCount,
  onCompleteHoldings,
}: {
  data: BackendPortfolioWorkspaceDto;
  locale: AppLocale;
  completedCount: number;
  onCompleteHoldings: () => void;
}) {
  const t = portfolioLanguage[locale];
  const { pulse } = data;
  const setupRatio = pulse.holding_count > 0 ? (completedCount / pulse.holding_count) * 100 : 0;
  const needsSetup = completedCount < pulse.holding_count;

  return (
    <section className="portfolio-panel portfolio-pulse portfolio-pulse-v2" aria-labelledby="portfolio-pulse-title">
      <div className="portfolio-section-heading">
        <div className="portfolio-section-icon is-pulse"><WalletCards size={17} /></div>
        <h2 id="portfolio-pulse-title">{t.pulse}</h2>
      </div>

      <div className="portfolio-pulse-hero">
        <div className="portfolio-pulse-primary">
          <span className="portfolio-metric-label">
            {!pulse.current_value_is_complete ? <i className="portfolio-known-dot" /> : null}
            {t.knownValue}
          </span>
          <strong className={`portfolio-pulse-value is-${financialTone(pulse.known_current_value)}`}>
            {formatPortfolioMoney(pulse.known_current_value, locale)}
          </strong>
        </div>
        <div className="portfolio-pulse-secondary">
          <div className="portfolio-pulse-stat">
            <span>{t.unrealized}</span>
            <strong className={`is-${financialTone(pulse.known_unrealized_gain_amount)}`}>
              {formatPortfolioMoney(pulse.known_unrealized_gain_amount, locale)}
            </strong>
            <small className={`is-${financialTone(pulse.known_unrealized_gain_percent)}`}>
              {formatSignedPercent(pulse.known_unrealized_gain_percent)}
            </small>
          </div>
          <div className="portfolio-pulse-stat">
            <span>{t.dailyMovement}</span>
            <strong className={`is-${financialTone(pulse.estimated_daily_change_amount)}`}>
              {formatPortfolioMoney(pulse.estimated_daily_change_amount, locale)}
            </strong>
            <small className={`is-${financialTone(pulse.estimated_daily_change_percent)}`}>
              {formatSignedPercent(pulse.estimated_daily_change_percent)}
            </small>
          </div>
        </div>
      </div>

      <div className="portfolio-pulse-meta">
        <div className="portfolio-pulse-tertiary">
          <span><em>{t.knownInvestment}</em> {formatPortfolioMoney(pulse.known_invested_amount, locale)}</span>
          <span><em>{t.holdingCount}</em> {pulse.holding_count} · {data.meta.total_watchlisted} {t.watched.toLowerCase()}</span>
        </div>
        {needsSetup && (
          <div className="portfolio-setup-progress">
            <div className="portfolio-setup-progress-copy">
              <span>{t.setupProgress(completedCount, pulse.holding_count)}</span>
              <button onClick={onCompleteHoldings} type="button">{t.completeHoldings}</button>
            </div>
            <div className="portfolio-setup-progress-bar" role="presentation">
              <i style={{ width: `${setupRatio}%` }} />
            </div>
          </div>
        )}
        {data.meta.is_provisional ? (
          <p className="portfolio-pulse-provisional">{t.provisional}</p>
        ) : null}
      </div>
    </section>
  );
}

const attentionIcons: Record<PortfolioAttentionCode, typeof AlertTriangle> = {
  SUPPORT_BREAK: ShieldAlert,
  SELL_OR_REDUCE: TrendingDown,
  PRICE_QUALITY: CircleAlert,
  ELEVATED_RISK: AlertTriangle,
  INCOMPLETE_HOLDING: CircleAlert,
  HIGH_CONCENTRATION: AlertTriangle,
  WATCH_RESISTANCE: Eye,
  UNUSUAL_VOLUME: TrendingDown,
  IMPORTANT_EVENT: CircleAlert,
};

function PortfolioAttention({
  data,
  locale,
  selectedCode,
  onSelect,
}: {
  data: BackendPortfolioWorkspaceDto;
  locale: AppLocale;
  selectedCode: string | null;
  onSelect: (code: PortfolioAttentionCode | null, ids: string[]) => void;
}) {
  const t = portfolioLanguage[locale];
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? data.attention : data.attention.slice(0, 3);

  return (
    <section className="portfolio-panel portfolio-attention portfolio-attention-v2" aria-labelledby="portfolio-attention-title">
      <div className="portfolio-section-heading">
        <div className="portfolio-section-icon is-warning"><AlertTriangle size={17} /></div>
        <h2 id="portfolio-attention-title">{t.attention}</h2>
      </div>
      {!data.attention.length ? (
        <div className="portfolio-positive-state">
          <CheckCircle2 size={24} />
          <strong>{t.noAttention}</strong>
          <p>{t.noAttentionDetail}</p>
        </div>
      ) : (
        <>
          <div className="portfolio-attention-list">
            {visible.map((item) => {
              const Icon = attentionIcons[item.code];
              return (
                <button
                  aria-pressed={selectedCode === item.code}
                  className={`portfolio-attention-item severity-${item.severity.toLowerCase()} ${selectedCode === item.code ? "is-selected" : ""}`}
                  key={item.code}
                  onClick={() => onSelect(selectedCode === item.code ? null : item.code, item.stock_ids)}
                  type="button"
                >
                  <span className="portfolio-attention-icon"><Icon size={15} /></span>
                  <span className="portfolio-attention-copy">
                    <strong>{t.attentionLabels[item.code]}</strong>
                    <small>
                      {item.symbols.slice(0, 3).map((symbol) => <i key={symbol}>{symbol}</i>)}
                      {item.count > 3 ? ` +${item.count - 3}` : ""}
                    </small>
                  </span>
                  <span className="portfolio-attention-action">{t.filterAttention}<ArrowRight size={13} /></span>
                </button>
              );
            })}
          </div>
          {data.attention.length > 3 && (
            <button className="portfolio-text-button" onClick={() => setExpanded((value) => !value)} type="button">
              {expanded ? t.showLess : t.viewAll}
              <ChevronDown className={expanded ? "is-rotated" : ""} size={14} />
            </button>
          )}
        </>
      )}
    </section>
  );
}

function InlineNumber({
  item,
  field,
  locale,
  compact = false,
}: {
  item: BackendPortfolioHoldingDto;
  field: "quantity" | "average_buy_price";
  locale: AppLocale;
  compact?: boolean;
}) {
  const t = portfolioLanguage[locale];
  const update = useWatchlistItemUpdate();
  const initial = item[field];
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const label = field === "quantity" ? t.quantity : t.averagePrice;
  const emptyLabel = field === "quantity" ? t.addQuantityAction : t.addAveragePriceAction;

  const save = () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    update.mutate({ stockId: item.stock_id, payload: { [field]: parsed } }, { onSuccess: () => setOpen(false) });
  };

  return (
    <span className={`portfolio-inline-edit ${compact ? "is-compact" : ""}`}>
      {!compact && <span className="portfolio-inline-label">{label}</span>}
      <button
        className={`portfolio-inline-value ${initial == null ? "is-empty" : ""}`}
        onClick={() => { setValue(initial ?? ""); setOpen(true); }}
        type="button"
      >
        {initial == null ? `+ ${emptyLabel}` : field === "quantity" ? formatPortfolioNumber(initial, 4) : formatPortfolioMoney(initial, locale)}
        {initial != null && <Pencil size={11} />}
      </button>
      {open && (
        <span className="portfolio-inline-popover">
          <input
            aria-label={label}
            autoFocus
            inputMode="decimal"
            min="0.0001"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") save(); if (event.key === "Escape") setOpen(false); }}
            step="0.0001"
            type="number"
            value={value}
          />
          <span>
            <button disabled={update.isPending} onClick={save} type="button">{t.save}</button>
            <button onClick={() => setOpen(false)} type="button">{t.cancel}</button>
          </span>
        </span>
      )}
    </span>
  );
}

function NoteAction({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const update = useWatchlistItemUpdate();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(item.note ?? "");

  return (
    <span className="portfolio-note-action">
      <button
        aria-label={item.note ? t.note : t.addNote}
        className={item.note ? "has-note" : ""}
        onClick={() => { setNote(item.note ?? ""); setOpen(true); }}
        title={item.note ? t.note : t.addNote}
        type="button"
      >
        <StickyNote size={16} />
      </button>
      {open && (
        <span className="portfolio-note-popover">
          <textarea
            autoFocus
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
            placeholder={t.note}
            rows={3}
            value={note}
          />
          <span>
            <button disabled={update.isPending} onClick={() => update.mutate({ stockId: item.stock_id, payload: { note: note.trim() || null } }, { onSuccess: () => setOpen(false) })} type="button">{t.save}</button>
            <button onClick={() => setOpen(false)} type="button">{t.cancel}</button>
          </span>
        </span>
      )}
    </span>
  );
}

function RowActions({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const remove = useWatchlistItemRemove();

  return (
    <div className="portfolio-row-actions portfolio-icon-rail">
      <button
        aria-label={t.removeWatchlist}
        className="portfolio-action-icon is-watched"
        onClick={() => { if (window.confirm(t.removeWatchlistConfirm)) remove.mutate(item.stock_id); }}
        title={t.watched}
        type="button"
      >
        <StarIcon />
      </button>
      <NoteAction item={item} locale={locale} />
    </div>
  );
}

function HoldToggle({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const update = useWatchlistItemUpdate();

  const toggleHolding = () => {
    if (item.is_holding) {
      if (window.confirm(t.removeHoldingConfirm)) {
        update.mutate({ stockId: item.stock_id, payload: { is_holding: false } });
      }
      return;
    }
    update.mutate({ stockId: item.stock_id, payload: { is_holding: true } });
  };

  return (
    <button
      aria-label={item.is_holding ? t.removeHolding : t.markAsHolding}
      aria-pressed={item.is_holding}
      className={`portfolio-hold-toggle ${item.is_holding ? "is-held" : "is-unheld"}`}
      disabled={update.isPending}
      onClick={toggleHolding}
      title={item.is_holding ? t.holding : t.markAsHolding}
      type="button"
    >
      <BriefcaseBusiness fill={item.is_holding ? "currentColor" : "none"} size={18} />
    </button>
  );
}

function StarIcon() {
  return (
    <svg aria-hidden fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
      <path d="M12 2l2.9 6.9 7.4.6-5.6 4.9 1.7 7.2L12 18.8 5.6 21.6l1.7-7.2L1.7 9.5l7.4-.6L12 2z" />
    </svg>
  );
}

function QuantityCell({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  if (!item.is_holding) return <span className="portfolio-muted-dash">—</span>;
  return <InlineNumber compact field="quantity" item={item} locale={locale} />;
}

function AveragePriceCell({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  if (!item.is_holding) return <span className="portfolio-muted-dash">—</span>;
  return <InlineNumber compact field="average_buy_price" item={item} locale={locale} />;
}

function MarketCell({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const priceState = formatPortfolioPriceState(item.price_status, locale);
  const hasChange = item.price_status === "FINALIZED" || item.price_status === "PROVISIONAL";

  return (
    <div className="portfolio-market-cell">
      <strong>{formatPortfolioMoney(item.current_price, locale)}</strong>
      {hasChange ? (
        <small className={`is-${financialTone(item.price_change_percent)}`}>{formatSignedPercent(item.price_change_percent)}</small>
      ) : (
        <small className="portfolio-price-quality">{priceState ?? t.priceStatus[item.price_status]}</small>
      )}
    </div>
  );
}

function ValuePlCell({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  if (!item.is_holding) return <span className="portfolio-muted-dash">—</span>;
  return (
    <div className="portfolio-value-pl-cell">
      <strong>{formatPortfolioMoney(item.current_value, locale)}</strong>
      <span className="portfolio-value-pl-row">
        <Value locale={locale} value={item.unrealized_gain_amount} />
        <small className={`is-${financialTone(item.unrealized_gain_percent)}`}>{formatSignedPercent(item.unrealized_gain_percent)}</small>
      </span>
    </div>
  );
}

function SignalCell({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const signal = getPortfolioSignalMeta(item, t);
  const priceState = formatPortfolioPriceState(item.price_status, locale);

  return (
    <div className="portfolio-signal portfolio-signal-v2">
      <span className={`portfolio-status action-${item.action.toLowerCase()}`}>{item.action.replaceAll("_", " ")}</span>
      <small>{signal.summary}</small>
      {priceState && (item.price_status === "STALE_LAST_KNOWN" || item.price_status === "SUSPICIOUS" || item.price_status === "SUSPENDED") && (
        <small className="portfolio-price-flag">{priceState}</small>
      )}
    </div>
  );
}

function Row({ item, locale }: { item: BackendPortfolioHoldingDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const guidance = getPortfolioWhatNextCopy(item, t);

  return (
    <tr className={`${item.is_holding ? "is-holding" : "is-watching"} ${item.requires_attention ? "needs-review" : ""}`}>
      <td className="portfolio-actions-cell"><RowActions item={item} locale={locale} /></td>
      <td className="portfolio-hold-cell"><HoldToggle item={item} locale={locale} /></td>
      <td className="portfolio-stock-col"><StockSymbolTile exchange={item.exchange} name={item.name} symbol={item.symbol} /></td>
      <td><QuantityCell item={item} locale={locale} /></td>
      <td><AveragePriceCell item={item} locale={locale} /></td>
      <td><MarketCell item={item} locale={locale} /></td>
      <td><ValuePlCell item={item} locale={locale} /></td>
      <td><SignalCell item={item} locale={locale} /></td>
      <td className="portfolio-guidance-cell">{guidance}</td>
    </tr>
  );
}

function HoldingsWorkspace({
  items,
  locale,
  selectedStockIds,
  selectedCode,
  filter,
  onFilterChange,
  onClearAttention,
  sectionRef,
}: {
  items: BackendPortfolioHoldingDto[];
  locale: AppLocale;
  selectedStockIds: Set<string> | null;
  selectedCode: string | null;
  filter: PortfolioHoldingFilter;
  onFilterChange: (filter: PortfolioHoldingFilter) => void;
  onClearAttention: () => void;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const t = portfolioLanguage[locale];
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("ALL");
  const [trend, setTrend] = useState("ALL");

  const filtered = useMemo(
    () => filterPortfolioHoldings(items, { search, filter, action, trend, selectedStockIds }),
    [action, filter, items, search, selectedStockIds, trend],
  );
  const holdings = sortPortfolioGroupRows(filtered.filter((item) => item.is_holding));
  const watching = sortPortfolioGroupRows(filtered.filter((item) => !item.is_holding));
  const actions = [...new Set(items.map((item) => item.action))];
  const trends = [...new Set(items.map((item) => item.trend))];
  const options: Array<[PortfolioHoldingFilter, string]> = [
    ["ALL", t.all], ["HOLDINGS", t.holdingsOnly], ["WATCHLIST", t.watchlistOnly],
    ["REVIEW", t.review], ["STABLE", t.stable], ["INCOMPLETE", t.incomplete],
  ];

  return (
    <section className="portfolio-panel portfolio-holdings portfolio-holdings-v2" aria-labelledby="portfolio-holdings-title" ref={sectionRef}>
      <div className="portfolio-holdings-head">
        <div className="portfolio-section-heading">
          <div className="portfolio-section-icon"><WalletCards size={17} /></div>
          <h2 id="portfolio-holdings-title">{t.holdings}</h2>
        </div>
        <div className="portfolio-search">
          <Search size={16} />
          <input aria-label={t.search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} type="search" value={search} />
        </div>
      </div>
      <div className="portfolio-toolbar">
        <div className="portfolio-segmented" role="group">
          {options.map(([value, label]) => (
            <button aria-pressed={filter === value} className={filter === value ? "is-active" : ""} key={value} onClick={() => onFilterChange(value)} type="button">
              {label}
            </button>
          ))}
        </div>
        <label className="portfolio-select">{t.action}<select onChange={(event) => setAction(event.target.value)} value={action}><option value="ALL">{t.all}</option>{actions.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label className="portfolio-select">{t.trend}<select onChange={(event) => setTrend(event.target.value)} value={trend}><option value="ALL">{t.all}</option>{trends.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        {selectedStockIds && (
          <button className="portfolio-filter-clear" onClick={onClearAttention} type="button">
            <X size={13} />
            {selectedCode ? t.attentionLabels[selectedCode as PortfolioAttentionCode] : t.attention}
          </button>
        )}
      </div>
      <p aria-live="polite" className="sr-only">{t.filtersAnnouncement(filtered.length)}</p>
      <div className="portfolio-table-wrap">
        <table className="portfolio-table portfolio-unified-table portfolio-unified-table-v2">
          <thead>
            <tr>
              <th className="portfolio-th-actions">{t.actionsColumn}</th>
              <th className="portfolio-th-hold">{t.holding}</th>
              <th>{t.stock}</th>
              <th>{t.quantity}</th>
              <th>{t.averagePrice}</th>
              <th>{t.market}</th>
              <th>{t.valueAndPL}</th>
              <th>{t.signal}</th>
              <th>{t.whatNext}</th>
            </tr>
          </thead>
          <tbody>
            {holdings.length > 0 && <tr className="portfolio-group-row"><td colSpan={9}>{t.groupHoldings(holdings.length)}</td></tr>}
            {holdings.map((item) => <Row item={item} key={item.stock_id} locale={locale} />)}
            {watching.length > 0 && <tr className="portfolio-group-row"><td colSpan={9}>{t.groupWatching(watching.length)}</td></tr>}
            {watching.map((item) => <Row item={item} key={item.stock_id} locale={locale} />)}
          </tbody>
        </table>
      </div>
      <div className="portfolio-mobile-holdings">
        {filtered.map((item) => {
          const guidance = getPortfolioWhatNextCopy(item, t);
          return (
            <article className={`portfolio-holding-card ${item.is_holding ? "is-holding" : "is-watching"} ${item.requires_attention ? "needs-review" : ""}`} key={item.stock_id}>
              <div className="portfolio-holding-card-head">
                <div className="portfolio-mobile-stock-row">
                  <RowActions item={item} locale={locale} />
                  <HoldToggle item={item} locale={locale} />
                  <StockSymbolTile exchange={item.exchange} name={item.name} symbol={item.symbol} />
                </div>
                <span className={`portfolio-status action-${item.action.toLowerCase()}`}>{item.action.replaceAll("_", " ")}</span>
              </div>
              {item.is_holding && (
                <div className="portfolio-mobile-position">
                  <QuantityCell item={item} locale={locale} />
                  <AveragePriceCell item={item} locale={locale} />
                </div>
              )}
              <div className="portfolio-holding-card-value">
                <span>{t.market}<strong>{formatPortfolioMoney(item.current_price, locale)}</strong></span>
                <span>{t.valueAndPL}<strong>{item.is_holding ? formatPortfolioMoney(item.current_value, locale) : "—"}</strong></span>
                <span>{t.unrealized}<Value locale={locale} value={item.is_holding ? item.unrealized_gain_amount : null} /></span>
              </div>
              <p>{guidance}</p>
            </article>
          );
        })}
      </div>
      {!filtered.length && <div className="portfolio-table-empty">{t.emptyTitle}</div>}
    </section>
  );
}

function PositionExposureBars({
  rows,
  locale,
  title,
}: {
  rows: BackendPortfolioWorkspaceDto["shape"]["position_exposure"];
  locale: AppLocale;
  title: string;
}) {
  const items = rows.slice(0, 6);
  if (!items.length) return null;

  return (
    <div className="portfolio-position-bars">
      <h3>{title}</h3>
      <ul>
        {items.map((row) => {
          const weight = Math.max(0, Math.min(100, Number(row.weight_percent) || 0));
          return (
            <li key={row.label}>
              <div className="portfolio-position-bar-head">
                <span>{row.label}</span>
                <strong>{formatPortfolioPercent(row.weight_percent)}</strong>
              </div>
              <div className="portfolio-position-bar-track" aria-hidden>
                <i style={{ width: `${weight}%` }} />
              </div>
              <small>{formatPortfolioMoney(row.current_value, locale)}</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ActionGroupBadges({
  groups,
  title,
}: {
  groups: BackendPortfolioWorkspaceDto["shape"]["action_groups"];
  title: string;
}) {
  const items = groups.filter((group) => group.count > 0).slice(0, 5);
  if (!items.length) return null;

  return (
    <div className="portfolio-action-groups">
      <h3>{title}</h3>
      <div className="portfolio-action-group-list">
        {items.map((group) => (
          <span className={`portfolio-action-group action-${group.action.toLowerCase()}`} key={group.action}>
            <strong>{group.action.replaceAll("_", " ")}</strong>
            <em>{group.count}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function PortfolioEmailSummary({ locale }: { locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const { enabled, ready, toggle } = usePortfolioEmailPreference();

  return (
    <section className="portfolio-panel portfolio-email-summary" aria-labelledby="portfolio-email-title">
      <div className="portfolio-section-heading">
        <div className="portfolio-section-icon"><Mail size={17} /></div>
        <div>
          <p>{t.emailSummary}</p>
          <h2 id="portfolio-email-title">{enabled ? t.emailSummaryEnabled : t.emailSummaryDisabled}</h2>
        </div>
      </div>
      <p className="portfolio-email-copy">{t.emailSummaryDetail}</p>
      <label className="portfolio-email-toggle">
        <input
          checked={ready ? enabled : false}
          disabled={!ready}
          onChange={(event) => toggle(event.target.checked)}
          type="checkbox"
        />
        <span className="portfolio-email-toggle-track" aria-hidden />
        <span className="portfolio-email-toggle-label">{enabled ? t.emailSummaryEnabled : t.emailSummaryDisabled}</span>
      </label>
      <p className="portfolio-email-note">{t.emailSummaryNote}</p>
    </section>
  );
}

function PortfolioInsightTile({
  icon,
  label,
  value,
  locale,
  signed,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: BackendPortfolioPositionReferenceDto | null;
  locale: AppLocale;
  signed?: boolean;
  tone?: "positive" | "negative" | "neutral";
}) {
  if (!value) return null;
  return (
    <article className={`portfolio-insight-tile ${tone ? `is-${tone}` : ""}`}>
      <div className="portfolio-insight-tile-icon" aria-hidden>{icon}</div>
      <div className="portfolio-insight-tile-copy">
        <span>{label}</span>
        <strong>{value.symbol}</strong>
        <small>
          {value.percent != null
            ? (signed ? formatSignedPercent(value.percent) : formatPortfolioPercent(value.percent))
            : formatPortfolioMoney(value.amount, locale)}
        </small>
      </div>
    </article>
  );
}

function PortfolioInsights({ data, locale }: { data: BackendPortfolioWorkspaceDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const riskFocus = data.shape.worst_daily_contributor ?? data.shape.weakest_position;
  const tiles = [
    { icon: <WalletCards size={16} />, label: t.largest, value: data.shape.largest_holding, tone: "neutral" as const },
    { icon: <TrendingUp size={16} />, label: t.strongest, value: data.shape.strongest_position, signed: true, tone: "positive" as const },
    { icon: <TrendingDown size={16} />, label: t.weakest, value: data.shape.weakest_position, signed: true, tone: "negative" as const },
    { icon: <ShieldAlert size={16} />, label: t.highestRisk, value: riskFocus, signed: true, tone: "negative" as const },
  ].filter((tile) => tile.value);

  if (!tiles.length) return null;

  return (
    <section className="portfolio-panel portfolio-insights-strip" aria-labelledby="portfolio-insights-title">
      <div className="portfolio-section-heading">
        <div className="portfolio-section-icon"><Layers3 size={17} /></div>
        <h2 id="portfolio-insights-title">{t.insights}</h2>
      </div>
      <div className="portfolio-insight-strip-grid">
        {tiles.map((tile) => (
          <PortfolioInsightTile
            icon={tile.icon}
            key={tile.label}
            label={tile.label}
            locale={locale}
            signed={"signed" in tile ? tile.signed : false}
            tone={tile.tone}
            value={tile.value}
          />
        ))}
      </div>
    </section>
  );
}

function ExposureRing({
  rows,
  totalLabel,
  locale,
}: {
  rows: BackendPortfolioWorkspaceDto["shape"]["sector_exposure"];
  totalLabel: string;
  locale: AppLocale;
}) {
  const segments = rows.slice(0, 6);
  const colors = ["#7c6cff", "#20c997", "#f0b429", "#ff6b8a", "#4dabf7", "#a78bfa"];
  let offset = 0;

  return (
    <div className="portfolio-exposure-ring-wrap">
      <svg aria-hidden className="portfolio-exposure-ring" viewBox="0 0 120 120">
        <circle className="portfolio-exposure-ring-track" cx="60" cy="60" r="46" />
        {segments.map((row, index) => {
          const value = Math.max(0, Number(row.weight_percent));
          const dash = (value / 100) * 289;
          const circle = (
            <circle
              className="portfolio-exposure-ring-segment"
              cx="60"
              cy="60"
              key={row.label}
              r="46"
              stroke={colors[index % colors.length]}
              strokeDasharray={`${dash} 289`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <div className="portfolio-exposure-ring-center">
        <span>{totalLabel}</span>
        <strong>{formatPortfolioMoney(rows.reduce((sum, row) => sum + (Number(row.current_value) || 0), 0).toString(), locale)}</strong>
      </div>
      <ul className="portfolio-exposure-legend">
        {segments.map((row, index) => (
          <li key={row.label}>
            <i style={{ background: colors[index % colors.length] }} />
            <span>{row.label}</span>
            <strong>{formatPortfolioPercent(row.weight_percent)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PortfolioShape({ data, locale }: { data: BackendPortfolioWorkspaceDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const exposureTitle = data.pulse.current_value_is_complete ? t.sectorExposure : t.knownSectorExposure;
  const positionTitle = data.pulse.current_value_is_complete ? t.positionExposure : t.knownPositionExposure;

  return (
    <section className="portfolio-panel portfolio-shape portfolio-shape-v3" aria-labelledby="portfolio-shape-title">
      <div className="portfolio-section-heading">
        <div className="portfolio-section-icon"><Layers3 size={17} /></div>
        <h2 id="portfolio-shape-title">{t.shape}</h2>
      </div>
      <div className="portfolio-shape-body">
        <ExposureRing
          locale={locale}
          rows={data.shape.sector_exposure}
          totalLabel={exposureTitle}
        />
        <PositionExposureBars locale={locale} rows={data.shape.position_exposure} title={positionTitle} />
        <ActionGroupBadges groups={data.shape.action_groups} title={t.actionGroups} />
      </div>
      {!data.pulse.current_value_is_complete && <p className="portfolio-partial-note">{t.partialExposure}</p>}
    </section>
  );
}

function WatchlistToReview({ data, locale }: { data: BackendPortfolioWorkspaceDto; locale: AppLocale }) {
  const t = portfolioLanguage[locale];
  const items = data.watchlist_to_review.slice(0, 4);

  return (
    <section className="portfolio-panel portfolio-watchlist-review portfolio-watchlist-review-v2" aria-labelledby="portfolio-watchlist-title">
      <div className="portfolio-section-heading">
        <div className="portfolio-section-icon"><Eye size={17} /></div>
        <h2 id="portfolio-watchlist-title">{t.watchlist}</h2>
      </div>
      {items.length ? (
        <div className="portfolio-ideas portfolio-ideas-v2">
          {items.map((item) => (
            <Link className="portfolio-idea" href={buildStockDetailPath(item.exchange, item.symbol)} key={item.stock_id}>
              <div className="portfolio-idea-head">
                <span className="portfolio-symbol-tile is-compact">
                  <strong>{item.symbol}</strong>
                  <span>{item.name}</span>
                </span>
              </div>
              <p>{t.reasonLabels[item.reason_code] ?? item.reason_code.replaceAll("_", " ")}</p>
              <footer>
                <span className={`portfolio-status action-${item.action.toLowerCase()}`}>{item.action.replaceAll("_", " ")}</span>
                <span className={`portfolio-idea-change is-${financialTone(item.price_change_percent)}`}>{formatSignedPercent(item.price_change_percent)}</span>
                <span>{formatPortfolioMoney(item.current_price, locale)}</span>
                <em>{t.viewStock}<ArrowRight size={13} /></em>
              </footer>
            </Link>
          ))}
        </div>
      ) : (
        <div className="portfolio-quiet-empty">{t.watchlistEmpty}</div>
      )}
    </section>
  );
}

export function PortfolioWorkspaceContent({
  data,
  locale,
}: PortfolioWorkspaceViewProps & { data: BackendPortfolioWorkspaceDto }) {
  const t = portfolioLanguage[locale];
  const holdingsRef = useRef<HTMLElement | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string> | null>(null);
  const [tableFilter, setTableFilter] = useState<PortfolioHoldingFilter>("ALL");

  const completedCount = useMemo(() => countCompletedHoldings(data.watchlist_items), [data.watchlist_items]);
  const incompleteCount = useMemo(() => countIncompleteHoldings(data.watchlist_items), [data.watchlist_items]);
  const reviewCount = useMemo(
    () => data.watchlist_items.filter((item) => isPortfolioReviewRow(item)).length,
    [data.watchlist_items],
  );

  const scrollToHoldings = useCallback(() => {
    holdingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const focusIncomplete = useCallback(() => {
    setSelectedCode(null);
    setSelectedStockIds(null);
    setTableFilter("INCOMPLETE");
    scrollToHoldings();
  }, [scrollToHoldings]);

  const handleAttentionSelect = useCallback((code: PortfolioAttentionCode | null, ids: string[]) => {
    if (!code) {
      setSelectedCode(null);
      setSelectedStockIds(null);
      setTableFilter("ALL");
      return;
    }
    setSelectedCode(code);
    setSelectedStockIds(new Set(ids));
    setTableFilter(attentionFilterForCode(code));
    scrollToHoldings();
  }, [scrollToHoldings]);

  return (
    <div className="portfolio-page portfolio-page-v2">
      <PortfolioHero
        data={data}
        incompleteCount={incompleteCount}
        locale={locale}
        onCompleteHoldings={focusIncomplete}
        reviewCount={reviewCount}
      />
      <div className="portfolio-summary-grid portfolio-summary-grid-v3">
        <PortfolioPulse
          completedCount={completedCount}
          data={data}
          locale={locale}
          onCompleteHoldings={focusIncomplete}
        />
        <PortfolioAttention
          data={data}
          locale={locale}
          onSelect={handleAttentionSelect}
          selectedCode={selectedCode}
        />
        <PortfolioEmailSummary locale={locale} />
      </div>
      <HoldingsWorkspace
        filter={tableFilter}
        items={data.watchlist_items}
        locale={locale}
        onClearAttention={() => { setSelectedCode(null); setSelectedStockIds(null); setTableFilter("ALL"); }}
        onFilterChange={setTableFilter}
        sectionRef={holdingsRef}
        selectedCode={selectedCode}
        selectedStockIds={selectedStockIds}
      />
      <PortfolioInsights data={data} locale={locale} />
      <div className="portfolio-support-grid">
        <PortfolioShape data={data} locale={locale} />
        <WatchlistToReview data={data} locale={locale} />
      </div>
    </div>
  );
}

export function PortfolioWorkspaceView({ locale }: PortfolioWorkspaceViewProps) {
  const t = portfolioLanguage[locale];
  const query = usePortfolioWorkspace("DSE");

  if (query.isLoading) {
    return (
      <div className="portfolio-page">
        <div className="portfolio-loading"><span /><p>{t.loading}</p></div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="portfolio-page">
        <div className="portfolio-error">
          <AlertTriangle size={24} />
          <h1>{t.error}</h1>
          <button onClick={() => void query.refetch()} type="button">{t.retry}</button>
        </div>
      </div>
    );
  }

  return <PortfolioWorkspaceContent data={query.data} locale={locale} />;
}
