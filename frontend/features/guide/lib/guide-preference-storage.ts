import {
  GUIDE_LAUNCHER_PROMINENCE_MS,
  GUIDE_NUDGE_COOLDOWN_MS,
  GUIDE_NUDGE_MAX_COUNT,
} from "@/features/guide/lib/guide-preference-constants";
import type { GuideCompletion, GuidePreference } from "@/features/guide/types/guide-types";

export type GuideServerState = "COMPLETED" | "DISMISSED";

const LEGACY_STORAGE_KEY = "smart-stock-guide-dashboard-sidebar-v1";
const SESSION_AUTO_START_KEY = "smart-stock-guide-dashboard-auto-started";

function storageKeyForVersion(version: number) {
  return `smart-stock-guide-dashboard-sidebar-v${version}`;
}

function sessionAutoStartKey(version: number) {
  return `${SESSION_AUTO_START_KEY}-v${version}`;
}

function nowIso() {
  return new Date().toISOString();
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCooldownElapsed(since: string | null | undefined, cooldownMs: number) {
  const timestamp = parseTimestamp(since);
  if (timestamp === null) {
    return true;
  }

  return Date.now() - timestamp >= cooldownMs;
}

function isWithinWindow(since: string | null | undefined, windowMs: number) {
  const timestamp = parseTimestamp(since);
  if (timestamp === null) {
    return true;
  }

  return Date.now() - timestamp < windowMs;
}

export function getGuidePreferenceStorageKey(version: number) {
  return storageKeyForVersion(version);
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

type LegacyGuidePreference = {
  version: number;
  status: "completed" | "dismissed";
  completedAt: string;
  suppressContextualPrompts: boolean;
};

function migrateLegacyPreference(parsed: LegacyGuidePreference, version: number): GuidePreference | null {
  if (parsed.version !== version) {
    return null;
  }

  if (parsed.status !== "completed" && parsed.status !== "dismissed") {
    return null;
  }

  if (typeof parsed.completedAt !== "string" || typeof parsed.suppressContextualPrompts !== "boolean") {
    return null;
  }

  if (parsed.suppressContextualPrompts) {
    return {
      version,
      autoStartShown: true,
      status: "dismissed",
      firstSeenAt: parsed.completedAt,
      updatedAt: parsed.completedAt,
      suppressContextualPrompts: true,
      lastNudgeAt: null,
      nudgeCount: 0,
    };
  }

  if (parsed.status === "dismissed") {
    return {
      version,
      autoStartShown: true,
      status: "skipped",
      firstSeenAt: parsed.completedAt,
      updatedAt: parsed.completedAt,
      suppressContextualPrompts: false,
      lastNudgeAt: null,
      nudgeCount: 0,
    };
  }

  return {
    version,
    autoStartShown: true,
    status: "completed",
    firstSeenAt: parsed.completedAt,
    updatedAt: parsed.completedAt,
    suppressContextualPrompts: false,
    lastNudgeAt: null,
    nudgeCount: 0,
  };
}

function isValidGuideStatus(status: unknown): status is GuidePreference["status"] {
  return status === null || status === "completed" || status === "skipped" || status === "dismissed";
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

    const parsed = JSON.parse(raw) as Partial<GuidePreference & LegacyGuidePreference>;
    if (typeof parsed.autoStartShown !== "boolean") {
      return migrateLegacyPreference(parsed as LegacyGuidePreference, version);
    }

    if (
      parsed.version !== version ||
      typeof parsed.firstSeenAt !== "string" ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.suppressContextualPrompts !== "boolean" ||
      typeof parsed.nudgeCount !== "number" ||
      !isValidGuideStatus(parsed.status ?? null)
    ) {
      return null;
    }

    return {
      version,
      autoStartShown: parsed.autoStartShown,
      status: parsed.status ?? null,
      firstSeenAt: parsed.firstSeenAt,
      updatedAt: parsed.updatedAt,
      suppressContextualPrompts: parsed.suppressContextualPrompts,
      lastNudgeAt: parsed.lastNudgeAt ?? null,
      nudgeCount: parsed.nudgeCount,
    };
  } catch {
    return null;
  }
}

export function readGuidePreference(version: number): GuidePreference | null {
  purgeLegacyGuidePreference();
  return readRawPreference(version);
}

function persistGuidePreference(preference: GuidePreference) {
  if (typeof window === "undefined") {
    return preference;
  }

  try {
    window.localStorage.setItem(storageKeyForVersion(preference.version), JSON.stringify(preference));
    window.dispatchEvent(new Event("dashboard-sidebar-guide:preference-changed"));
  } catch {
    // Ignore storage failures.
  }

  return preference;
}

function createPreference(version: number, input: Partial<GuidePreference> = {}): GuidePreference {
  const timestamp = nowIso();
  return {
    version,
    autoStartShown: input.autoStartShown ?? false,
    status: input.status ?? null,
    firstSeenAt: input.firstSeenAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    suppressContextualPrompts: input.suppressContextualPrompts ?? false,
    lastNudgeAt: input.lastNudgeAt ?? null,
    nudgeCount: input.nudgeCount ?? 0,
  };
}

export function resolveGuideCompletion(
  version: number,
  options?: { serverState?: GuideServerState | null },
): GuideCompletion | null {
  const local = readGuidePreference(version);
  if (local?.status) {
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

export function isGuideHardDismissed(version: number, options?: { serverState?: GuideServerState | null }) {
  const local = readGuidePreference(version);
  if (local?.suppressContextualPrompts || local?.status === "dismissed") {
    return true;
  }

  return options?.serverState === "DISMISSED";
}

export function isGuideAutoStartEligible(
  version: number,
  options?: { serverState?: GuideServerState | null },
) {
  if (typeof window !== "undefined" && hasGuideAutoStartedThisSession(version)) {
    return false;
  }

  if (isGuideHardDismissed(version, options)) {
    return false;
  }

  const local = readGuidePreference(version);
  if (local?.autoStartShown || local?.status) {
    return false;
  }

  if (options?.serverState === "COMPLETED" || options?.serverState === "DISMISSED") {
    return false;
  }

  return true;
}

export function isGuideNudgeEligible(version: number, options?: { serverState?: GuideServerState | null }) {
  if (isGuideHardDismissed(version, options)) {
    return false;
  }

  const local = readGuidePreference(version);
  if (!local) {
    return false;
  }

  if (local.status === "completed" || local.status === "dismissed") {
    return false;
  }

  if (local.nudgeCount >= GUIDE_NUDGE_MAX_COUNT) {
    return false;
  }

  const anchorAt = local.status === "skipped" ? local.updatedAt : local.firstSeenAt;
  if (!isCooldownElapsed(anchorAt, GUIDE_NUDGE_COOLDOWN_MS)) {
    return false;
  }

  if (!isCooldownElapsed(local.lastNudgeAt, GUIDE_NUDGE_COOLDOWN_MS)) {
    return false;
  }

  return local.autoStartShown || local.status === "skipped";
}

export function isGuideLauncherProminent(version: number) {
  if (isGuideHardDismissed(version)) {
    return false;
  }

  const local = readGuidePreference(version);
  if (!local) {
    return true;
  }

  if (local.status === "completed") {
    return false;
  }

  return isWithinWindow(local.firstSeenAt, GUIDE_LAUNCHER_PROMINENCE_MS);
}

export function hasGuideAutoStartedThisSession(version: number) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(sessionAutoStartKey(version)) === "true";
  } catch {
    return false;
  }
}

export function markGuideAutoStartedThisSession(version: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(sessionAutoStartKey(version), "true");
  } catch {
    // Ignore storage failures.
  }
}

export function markGuideAutoStartShown(version: number) {
  const existing = readGuidePreference(version);
  const timestamp = nowIso();

  return persistGuidePreference(
    createPreference(version, {
      ...existing,
      autoStartShown: true,
      firstSeenAt: existing?.firstSeenAt ?? timestamp,
      updatedAt: timestamp,
      lastNudgeAt: existing?.lastNudgeAt ?? null,
      nudgeCount: existing?.nudgeCount ?? 0,
      status: existing?.status ?? null,
      suppressContextualPrompts: existing?.suppressContextualPrompts ?? false,
    }),
  );
}

export function writeGuidePreference(version: number, completion: GuideCompletion): GuidePreference | null {
  const existing = readGuidePreference(version);
  const timestamp = nowIso();

  return persistGuidePreference(
    createPreference(version, {
      ...existing,
      autoStartShown: true,
      status: completion.status,
      firstSeenAt: existing?.firstSeenAt ?? timestamp,
      updatedAt: timestamp,
      suppressContextualPrompts: completion.suppressContextualPrompts,
      lastNudgeAt: existing?.lastNudgeAt ?? null,
      nudgeCount: existing?.nudgeCount ?? 0,
    }),
  );
}

export function recordGuideNudgeShown(version: number) {
  const existing = readGuidePreference(version);
  if (!existing) {
    return null;
  }

  const timestamp = nowIso();
  return persistGuidePreference({
    ...existing,
    lastNudgeAt: timestamp,
    nudgeCount: existing.nudgeCount + 1,
    updatedAt: timestamp,
  });
}

export function recordGuideNudgeSnooze(version: number) {
  const existing = readGuidePreference(version);
  if (!existing) {
    return null;
  }

  const timestamp = nowIso();
  return persistGuidePreference({
    ...existing,
    lastNudgeAt: timestamp,
    updatedAt: timestamp,
  });
}

export function recordGuideHardDismiss(version: number) {
  const existing = readGuidePreference(version);
  const timestamp = nowIso();

  return persistGuidePreference(
    createPreference(version, {
      ...existing,
      autoStartShown: true,
      status: "dismissed",
      firstSeenAt: existing?.firstSeenAt ?? timestamp,
      updatedAt: timestamp,
      suppressContextualPrompts: true,
      lastNudgeAt: existing?.lastNudgeAt ?? null,
      nudgeCount: existing?.nudgeCount ?? 0,
    }),
  );
}

export function toServerGuideState(completion: GuideCompletion): GuideServerState {
  return completion.suppressContextualPrompts || completion.status === "dismissed" ? "DISMISSED" : "COMPLETED";
}

export function serverStateToCompletion(state: GuideServerState): GuideCompletion {
  if (state === "DISMISSED") {
    return { status: "dismissed", suppressContextualPrompts: true };
  }

  return { status: "completed", suppressContextualPrompts: false };
}

export function mergeServerPreference(
  version: number,
  serverState: GuideServerState | null,
): GuidePreference | null {
  const local = readGuidePreference(version);

  if (!serverState) {
    return local;
  }

  if (serverState === "DISMISSED") {
    return applyServerHardDismiss(version, local);
  }

  if (!local) {
    return writeGuidePreference(version, serverStateToCompletion(serverState));
  }

  if (local.suppressContextualPrompts || local.status === "dismissed") {
    return local;
  }

  if (local.status === "skipped" || local.status === "completed") {
    return local;
  }

  if (!local.status) {
    return writeGuidePreference(version, serverStateToCompletion(serverState));
  }

  return local;
}

function applyServerHardDismiss(version: number, local: GuidePreference | null) {
  const timestamp = nowIso();

  return persistGuidePreference(
    createPreference(version, {
      ...local,
      autoStartShown: true,
      status: "dismissed",
      firstSeenAt: local?.firstSeenAt ?? timestamp,
      updatedAt: timestamp,
      suppressContextualPrompts: true,
      lastNudgeAt: local?.lastNudgeAt ?? null,
      nudgeCount: local?.nudgeCount ?? 0,
    }),
  );
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
