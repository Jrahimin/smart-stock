import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GUIDE_LAUNCHER_PROMINENCE_MS,
  GUIDE_NUDGE_COOLDOWN_MS,
  GUIDE_NUDGE_MAX_COUNT,
} from "@/features/guide/lib/guide-preference-constants";
import {
  clearGuidePreference,
  getGuidePreferenceStorageKey,
  hasGuideAutoStartedThisSession,
  isGuideAutoStartEligible,
  isGuideHardDismissed,
  isGuideLauncherProminent,
  isGuideNudgeEligible,
  markGuideAutoStartedThisSession,
  markGuideAutoStartShown,
  mergeServerPreference,
  readGuidePreference,
  recordGuideHardDismiss,
  recordGuideNudgeShown,
  writeGuidePreference,
} from "@/features/guide/lib/guide-preference-storage";

const VERSION = 2;
const STORAGE_KEY = getGuidePreferenceStorageKey(VERSION);
const SESSION_KEY = "smart-stock-guide-dashboard-auto-started-v2";
const WEALTH_DESKTOP_SCOPE = { journey: "wealth" as const, surface: "desktop" as const, version: 1 };
const WEALTH_MOBILE_SCOPE = { journey: "wealth" as const, surface: "mobile" as const, version: 1 };

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("guide preference storage", () => {
  let localStorageMock: ReturnType<typeof createMemoryStorage>;
  let sessionStorageMock: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));

    localStorageMock = createMemoryStorage();
    sessionStorageMock = createMemoryStorage();

    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("sessionStorage", sessionStorageMock);
    vi.stubGlobal("window", {
      ...(globalThis.window ?? {}),
      localStorage: localStorageMock,
      sessionStorage: sessionStorageMock,
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    clearGuidePreference(VERSION);
    sessionStorageMock.removeItem(SESSION_KEY);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("treats a missing preference as auto-start eligible for guests", () => {
    expect(isGuideAutoStartEligible(VERSION)).toBe(true);
    expect(isGuideNudgeEligible(VERSION)).toBe(false);
    expect(isGuideLauncherProminent(VERSION)).toBe(true);
  });

  it("keeps Wealth desktop and mobile preferences in independent scopes", () => {
    expect(getGuidePreferenceStorageKey(WEALTH_DESKTOP_SCOPE)).toBe("smart-stock-guide-wealth-overview-desktop-v1");
    expect(getGuidePreferenceStorageKey(WEALTH_MOBILE_SCOPE)).toBe("smart-stock-guide-wealth-overview-mobile-v1");
    writeGuidePreference(WEALTH_DESKTOP_SCOPE, { status: "completed", suppressContextualPrompts: false });
    expect(readGuidePreference(WEALTH_MOBILE_SCOPE)).toBeNull();
    clearGuidePreference(WEALTH_DESKTOP_SCOPE);
  });

  it("blocks auto-start after auto-start has been shown once", () => {
    markGuideAutoStartShown(VERSION);

    expect(isGuideAutoStartEligible(VERSION)).toBe(false);
    expect(readGuidePreference(VERSION)?.autoStartShown).toBe(true);
  });

  it("blocks auto-start for completed, skipped, and hard-dismissed states", () => {
    writeGuidePreference(VERSION, { status: "completed", suppressContextualPrompts: false });
    expect(isGuideAutoStartEligible(VERSION)).toBe(false);

    clearGuidePreference(VERSION);
    writeGuidePreference(VERSION, { status: "skipped", suppressContextualPrompts: false });
    expect(isGuideAutoStartEligible(VERSION)).toBe(false);

    clearGuidePreference(VERSION);
    recordGuideHardDismiss(VERSION);
    expect(isGuideAutoStartEligible(VERSION)).toBe(false);
    expect(isGuideHardDismissed(VERSION)).toBe(true);
  });

  it("respects server COMPLETED and DISMISSED before local state exists", () => {
    expect(isGuideAutoStartEligible(VERSION, { serverState: "COMPLETED" })).toBe(false);
    expect(isGuideAutoStartEligible(VERSION, { serverState: "DISMISSED" })).toBe(false);
    expect(isGuideHardDismissed(VERSION, { serverState: "DISMISSED" })).toBe(true);
  });

  it("blocks auto-start for the current session after it has already fired", () => {
    markGuideAutoStartedThisSession(VERSION);

    expect(hasGuideAutoStartedThisSession(VERSION)).toBe(true);
    expect(isGuideAutoStartEligible(VERSION)).toBe(false);
  });

  it("keeps mascot prominence during the first seven days for skipped users", () => {
    writeGuidePreference(VERSION, { status: "skipped", suppressContextualPrompts: false });
    const preference = readGuidePreference(VERSION);
    if (!preference) {
      throw new Error("expected preference");
    }

    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...preference,
        firstSeenAt: daysAgo(2),
        updatedAt: daysAgo(2),
      }),
    );

    expect(isGuideLauncherProminent(VERSION)).toBe(true);

    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...preference,
        firstSeenAt: daysAgo(8),
        updatedAt: daysAgo(8),
      }),
    );

    expect(isGuideLauncherProminent(VERSION)).toBe(false);
  });

  it("does not show mascot prominence after completion or hard dismiss", () => {
    writeGuidePreference(VERSION, { status: "completed", suppressContextualPrompts: false });
    expect(isGuideLauncherProminent(VERSION)).toBe(false);

    clearGuidePreference(VERSION);
    recordGuideHardDismiss(VERSION);
    expect(isGuideLauncherProminent(VERSION)).toBe(false);
  });

  it("allows nudges only after the cooldown for skipped users", () => {
    writeGuidePreference(VERSION, { status: "skipped", suppressContextualPrompts: false });
    const preference = readGuidePreference(VERSION);
    if (!preference) {
      throw new Error("expected preference");
    }

    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...preference,
        firstSeenAt: daysAgo(8),
        updatedAt: daysAgo(8),
      }),
    );

    expect(isGuideNudgeEligible(VERSION)).toBe(true);
  });

  it("stops nudging after max count or hard dismiss", () => {
    markGuideAutoStartShown(VERSION);
    const preference = readGuidePreference(VERSION);
    if (!preference) {
      throw new Error("expected preference");
    }

    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...preference,
        firstSeenAt: daysAgo(8),
        updatedAt: daysAgo(8),
        nudgeCount: GUIDE_NUDGE_MAX_COUNT,
      }),
    );

    expect(isGuideNudgeEligible(VERSION)).toBe(false);

    clearGuidePreference(VERSION);
    recordGuideHardDismiss(VERSION);
    expect(isGuideNudgeEligible(VERSION)).toBe(false);
  });

  it("records nudge display and increments the nudge count", () => {
    markGuideAutoStartShown(VERSION);
    const preference = readGuidePreference(VERSION);
    if (!preference) {
      throw new Error("expected preference");
    }

    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...preference,
        firstSeenAt: daysAgo(8),
        updatedAt: daysAgo(8),
      }),
    );

    recordGuideNudgeShown(VERSION);

    expect(readGuidePreference(VERSION)?.nudgeCount).toBe(1);
    expect(readGuidePreference(VERSION)?.lastNudgeAt).toBe("2026-07-10T12:00:00.000Z");
  });

  it("merges server DISMISSED over local skipped or completed state", () => {
    writeGuidePreference(VERSION, { status: "skipped", suppressContextualPrompts: false });
    mergeServerPreference(VERSION, "DISMISSED");

    const merged = readGuidePreference(VERSION);
    expect(merged?.status).toBe("dismissed");
    expect(merged?.suppressContextualPrompts).toBe(true);
    expect(isGuideLauncherProminent(VERSION)).toBe(false);
    expect(isGuideNudgeEligible(VERSION)).toBe(false);

    clearGuidePreference(VERSION);
    writeGuidePreference(VERSION, { status: "completed", suppressContextualPrompts: false });
    mergeServerPreference(VERSION, "DISMISSED");

    expect(readGuidePreference(VERSION)?.status).toBe("dismissed");
    expect(isGuideHardDismissed(VERSION)).toBe(true);
  });

  it("does not downgrade local skipped to server COMPLETED", () => {
    writeGuidePreference(VERSION, { status: "skipped", suppressContextualPrompts: false });
    mergeServerPreference(VERSION, "COMPLETED");

    expect(readGuidePreference(VERSION)?.status).toBe("skipped");
  });

  it("writes server COMPLETED when no local preference exists", () => {
    mergeServerPreference(VERSION, "COMPLETED");

    expect(readGuidePreference(VERSION)?.status).toBe("completed");
    expect(isGuideAutoStartEligible(VERSION)).toBe(false);
  });

  it("returns null for corrupted storage payloads", () => {
    localStorageMock.setItem(STORAGE_KEY, "{not-json");
    expect(readGuidePreference(VERSION)).toBeNull();
    expect(isGuideAutoStartEligible(VERSION)).toBe(true);
  });

  it("uses seven-day windows for launcher prominence and nudge cooldown constants", () => {
    expect(GUIDE_LAUNCHER_PROMINENCE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(GUIDE_NUDGE_COOLDOWN_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("uses separate storage keys per guide surface", () => {
    writeGuidePreference({ surface: "mobile", version: 1 }, { status: "completed", suppressContextualPrompts: false });

    expect(window.localStorage.getItem("smart-stock-guide-mobile-intro-v1")).toBeTruthy();
    expect(readGuidePreference({ surface: "mobile", version: 1 })?.status).toBe("completed");
    expect(readGuidePreference(VERSION)).toBeNull();
  });
});
