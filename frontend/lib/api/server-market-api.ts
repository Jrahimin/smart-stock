import "server-only";

import type { ApiResponse } from "@/lib/api/backend-api-types";

export type ServerMarketApiResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; httpStatus?: number };

const LOCAL_DEV_SERVER_API_BASE_URL = "http://localhost:8000/api/v1";

/**
 * Internal backend URL for Next.js server-side market fetches.
 * Required in production — must not use the public browser API host.
 */
export function getServerApiBaseUrl(): string {
  const url = process.env.SERVER_API_BASE_URL?.trim();
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SERVER_API_BASE_URL is required in production");
    }
    return LOCAL_DEV_SERVER_API_BASE_URL;
  }
  return url.replace(/\/$/, "");
}

function buildServerMarketUrl(path: string, params?: Record<string, string>): string {
  const base = getServerApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * Server-only market GET. Uses cache: "no-store" — Redis remains the sole server-side cache.
 */
export async function fetchServerMarketApiNoStore<T>(
  path: string,
  options?: {
    params?: Record<string, string>;
    signal?: AbortSignal;
  },
): Promise<ServerMarketApiResult<T>> {
  try {
    const response = await fetch(buildServerMarketUrl(path, options?.params), {
      cache: "no-store",
      signal: options?.signal,
    });

    if (!response.ok) {
      return {
        status: "error",
        message: `Server market request failed (${response.status})`,
        httpStatus: response.status,
      };
    }

    const payload = (await response.json()) as ApiResponse<T>;
    if (payload.data === undefined || payload.data === null) {
      return {
        status: "error",
        message: "Server market request returned no data",
        httpStatus: response.status,
      };
    }

    return { status: "ok", data: payload.data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "error", message: "Server market request timed out" };
    }
    const message = error instanceof Error ? error.message : "Server market request failed";
    return { status: "error", message };
  }
}
