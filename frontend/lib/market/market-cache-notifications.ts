type StaleMarketCacheHandler = (url: string) => Promise<void>;

let staleMarketCacheHandler: StaleMarketCacheHandler | null = null;

export function registerStaleMarketCacheHandler(handler: StaleMarketCacheHandler | null) {
  staleMarketCacheHandler = handler;
}

export async function notifyStaleMarketCacheEntry(url: string) {
  if (!staleMarketCacheHandler) {
    return;
  }

  await staleMarketCacheHandler(url);
}
