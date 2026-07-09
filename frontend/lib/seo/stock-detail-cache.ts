/**
 * Stock detail page cache policy.
 *
 * Cross-day: backend Redis keys include latest_trade_date (hard bust).
 * Same-day: Redis TTL + browser market cache follow dashboard_cache_ttl_seconds
 * from GET /market/freshness (default 600s). Do not use a shorter magic ISR
 * that fights IndexedDB / TanStack market TTL.
 *
 * Keep `export const revalidate` in page.tsx as a literal matching this value.
 */
export const STOCK_DETAIL_REVALIDATE_SECONDS = 600;

export const STOCK_DETAIL_STALE_TIME_MS = STOCK_DETAIL_REVALIDATE_SECONDS * 1000;
