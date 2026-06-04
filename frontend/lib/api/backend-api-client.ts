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
const REFRESH_TOKEN_STORAGE_KEY = "smart-stock-refresh-token";

type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

type BackendApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  params?: Record<string, QueryValue>;
  body?: unknown;
  init?: RequestInit;
  skipAuthRefresh?: boolean;
};

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let authFailureHandler: (() => void) | null = null;

export function setBackendAccessToken(token: string | null) {
  accessToken = token;
}

export function getBackendAccessToken() {
  return accessToken;
}

export function setBackendAuthFailureHandler(handler: (() => void) | null) {
  authFailureHandler = handler;
}

export function getStoredRefreshToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function setStoredRefreshToken(token: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
  }
}

export function clearStoredAuthTokens() {
  accessToken = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}

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

function resolveHeaders(initHeaders?: HeadersInit, hasBody = false) {
  const headers = new Headers(initHeaders);
  headers.set("Accept", "application/json");
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

async function refreshAccessToken() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = fetch(`${frontendConfig.apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(async (response) => {
        if (!response.ok) {
          clearStoredAuthTokens();
          return null;
        }
        const envelope = (await response.json()) as ApiResponse<TokenPair>;
        if (!envelope.success || !envelope.data) {
          clearStoredAuthTokens();
          return null;
        }
        setBackendAccessToken(envelope.data.access_token);
        setStoredRefreshToken(envelope.data.refresh_token);
        return envelope.data.access_token;
      })
      .catch(() => {
        clearStoredAuthTokens();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function fetchBackend(
  url: string,
  options: BackendApiRequestOptions,
  hasRetried = false,
): Promise<Response> {
  const hasBody = options.body !== undefined;
  const response = await fetch(url, {
    ...options.init,
    method: options.method ?? "GET",
    headers: resolveHeaders(options.init?.headers, hasBody),
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  if (response.status !== 401 || options.skipAuthRefresh || hasRetried) {
    return response;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    authFailureHandler?.();
    return response;
  }

  return fetchBackend(url, options, true);
}

export async function backendApiRequest<T>(
  path: string,
  options: BackendApiRequestOptions = {},
): Promise<T> {
  const url = `${frontendConfig.apiBaseUrl}${path}${buildQueryString(options.params)}`;
  const response = await fetchBackend(url, options);

  if (!response.ok) {
    throw new BackendApiError("Backend request failed", response.status);
  }

  const envelope = (await response.json()) as ApiResponse<T>;
  if (!envelope.success) {
    throw new BackendApiError(envelope.message || "Backend request failed", response.status);
  }

  return envelope.data;
}

export async function backendApiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return backendApiRequest<T>(path, { method: "POST", body, init });
}

export async function backendApiPatch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return backendApiRequest<T>(path, { method: "PATCH", body, init });
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

  const response = await fetchBackend(url, { method: "GET", init });

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

