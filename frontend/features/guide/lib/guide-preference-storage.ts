import type { GuideCompletion, GuidePreference } from "@/features/guide/types/guide-types";

const STORAGE_KEY = "smart-stock-guide-dashboard-sidebar-v1";
const REPLAY_SESSION_KEY = "smart-stock-guide-dashboard-sidebar-replay";

export function readGuidePreference(version: number): GuidePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

export function isGuideReplaySessionActive() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem(REPLAY_SESSION_KEY) === "1";
}

export function markGuideReplaySession() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(REPLAY_SESSION_KEY, "1");
}

export function clearGuideReplaySession() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(REPLAY_SESSION_KEY);
}

export function shouldAutoStartGuide(version: number) {
  if (isGuideReplaySessionActive()) {
    return true;
  }

  return readGuidePreference(version) === null;
}

export function clearGuidePreference() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function writeGuidePreference(
  version: number,
  completion: GuideCompletion,
  options?: { preserveReplaySession?: boolean },
): GuidePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!options?.preserveReplaySession) {
    clearGuideReplaySession();
  }

  const preference: GuidePreference = {
    version,
    status: completion.status,
    completedAt: new Date().toISOString(),
    suppressContextualPrompts: completion.suppressContextualPrompts,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
    return preference;
  } catch {
    return preference;
  }
}
