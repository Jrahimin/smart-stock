import type { GuideCompletion, GuidePreference } from "@/features/guide/types/guide-types";

export type GuideServerState = "COMPLETED" | "DISMISSED";

const LEGACY_STORAGE_KEY = "smart-stock-guide-dashboard-sidebar-v1";

function storageKeyForVersion(version: number) {
  return `smart-stock-guide-dashboard-sidebar-v${version}`;
}

export function purgeLegacyGuidePreference() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function readRawPreference(version: number): GuidePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForVersion(version));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<GuidePreference>;
    if (
      parsed.version !== version ||
      (parsed.status !== "completed" && parsed.status !== "dismissed") ||
      typeof parsed.completedAt !== "string" ||
      typeof parsed.suppressContextualPrompts !== "boolean"
    ) {
      return null;
    }

    return parsed as GuidePreference;
  } catch {
    return null;
  }
}

export function readGuidePreference(version: number): GuidePreference | null {
  purgeLegacyGuidePreference();
  return readRawPreference(version);
}

export function resolveGuideCompletion(
  version: number,
  options?: { serverState?: GuideServerState | null },
): GuideCompletion | null {
  const local = readGuidePreference(version);
  if (local) {
    return {
      status: local.status,
      suppressContextualPrompts: local.suppressContextualPrompts,
    };
  }

  if (options?.serverState === "COMPLETED") {
    return { status: "completed", suppressContextualPrompts: false };
  }

  if (options?.serverState === "DISMISSED") {
    return { status: "dismissed", suppressContextualPrompts: true };
  }

  return null;
}

export function isGuideAutoStartSuppressed(
  version: number,
  options?: { serverState?: GuideServerState | null },
): boolean {
  const local = readGuidePreference(version);
  if (local) {
    return local.status === "dismissed" || local.suppressContextualPrompts;
  }

  return options?.serverState === "DISMISSED";
}

export function isGuideAutoStartEligible(
  version: number,
  options?: { serverState?: GuideServerState | null },
) {
  return !isGuideAutoStartSuppressed(version, options);
}

export function writeGuidePreference(
  version: number,
  completion: GuideCompletion,
): GuidePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  const preference: GuidePreference = {
    version,
    status: completion.status,
    completedAt: new Date().toISOString(),
    suppressContextualPrompts: completion.suppressContextualPrompts,
  };

  try {
    window.localStorage.setItem(storageKeyForVersion(version), JSON.stringify(preference));
    return preference;
  } catch {
    return preference;
  }
}

export function clearGuidePreference(version: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(storageKeyForVersion(version));
  } catch {
    // Ignore storage failures.
  }
}
