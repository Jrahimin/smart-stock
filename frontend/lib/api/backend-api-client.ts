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

export async function backendApiGet<T>(
  path: string,
  params?: Record<string, QueryValue>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${frontendConfig.apiBaseUrl}${path}${buildQueryString(params)}`, {
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

  return envelope.data;
}

