import type { ApiResponse } from "@/lib/api/backend-api-types";
import { frontendConfig } from "@/lib/frontend-config";

export async function fetchServerApiData<T>(path: string, revalidateSeconds = 300): Promise<T | null> {
  try {
    const response = await fetch(`${frontendConfig.apiBaseUrl}${path}`, {
      next: { revalidate: revalidateSeconds },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiResponse<T>;
    return payload.data ?? null;
  } catch {
    return null;
  }
}
