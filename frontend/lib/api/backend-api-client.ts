import { frontendConfig } from "@/lib/frontend-config";
import type { ApiResponse } from "@/lib/api/backend-api-types";

export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

type QueryValue = string | number | boolean | null | undefined;
const API_CACHE_DATABASE = "smart-stock-api-cache";
const API_CACHE_STORE = "responses";
const API_CACHE_VERSION = 1;

export function buildQueryString(params?: Record<string, QueryValue>) {
  if (!params) {
    return "";
  }

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

type CachedApiPayload<T> = {
  cacheKey: string;
  expiresAt: number;
  data: T;
};

function getCacheKey(url: string) {
  return url;
}

function openApiCacheDatabase() {
  if (typeof window === "undefined" || !window.indexedDB) {
    return null;
  }

  return new Promise<IDBDatabase | null>((resolve) => {
    const request = window.indexedDB.open(API_CACHE_DATABASE, API_CACHE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(API_CACHE_STORE)) {
        database.createObjectStore(API_CACHE_STORE, { keyPath: "cacheKey" });
      }
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readCachedApiResponse<T>(url: string): Promise<T | null> {
  const database = await openApiCacheDatabase();
  if (!database) {
    return null;
  }

  return new Promise((resolve) => {
    const transaction = database.transaction(API_CACHE_STORE, "readonly");
    const store = transaction.objectStore(API_CACHE_STORE);
    const request = store.get(getCacheKey(url));

    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const cachedPayload = request.result as CachedApiPayload<T> | undefined;
      if (!cachedPayload) {
        resolve(null);
        return;
      }

      if (cachedPayload.expiresAt <= Date.now()) {
        database
          .transaction(API_CACHE_STORE, "readwrite")
          .objectStore(API_CACHE_STORE)
          .delete(getCacheKey(url));
        resolve(null);
        return;
      }

      resolve(cachedPayload.data);
    };
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      resolve(null);
    };
  });
}

async function writeCachedApiResponse<T>(url: string, data: T) {
  const database = await openApiCacheDatabase();
  if (!database) {
    return;
  }

  return new Promise<void>((resolve) => {
    const expiresAt = Date.now() + frontendConfig.cacheHours * 60 * 60 * 1000;
    const transaction = database.transaction(API_CACHE_STORE, "readwrite");
    transaction.objectStore(API_CACHE_STORE).put({ cacheKey: getCacheKey(url), expiresAt, data });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      resolve();
    };
  });
}

export async function clearBackendApiCache() {
  const database = await openApiCacheDatabase();
  if (!database) {
    if (typeof window !== "undefined") {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("smart-stock-api-cache:"))
        .forEach((key) => window.localStorage.removeItem(key));
    }
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(API_CACHE_STORE, "readwrite");
    transaction.objectStore(API_CACHE_STORE).clear();
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      resolve();
    };
  });
}

export async function backendApiGet<T>(
  path: string,
  params?: Record<string, QueryValue>,
  init?: RequestInit,
): Promise<T> {
  const url = `${frontendConfig.apiBaseUrl}${path}${buildQueryString(params)}`;
  const shouldUsePersistentCache = init?.cache !== "no-store" && frontendConfig.cacheHours > 0;
  const cachedData = shouldUsePersistentCache ? await readCachedApiResponse<T>(url) : null;
  if (cachedData !== null) {
    return cachedData;
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new BackendApiError("Backend request failed", response.status);
  }

  const envelope = (await response.json()) as ApiResponse<T>;

  if (!envelope.success) {
    throw new BackendApiError(envelope.message || "Backend request failed", response.status);
  }

  if (shouldUsePersistentCache) {
    await writeCachedApiResponse(url, envelope.data);
  }

  return envelope.data;
}

