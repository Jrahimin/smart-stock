import {
  GUIDE_LAUNCHER_PROMINENCE_MS,
  GUIDE_NUDGE_COOLDOWN_MS,
  GUIDE_NUDGE_MAX_COUNT,
} from "@/features/guide/lib/guide-preference-constants";
import type { GuideCompletion, GuidePreference } from "@/features/guide/types/guide-types";

export type GuideServerState = "COMPLETED" | "DISMISSED";

export type GuidePreferenceSurface = "desktop" | "mobile";

export type GuidePreferenceScope = {
  surface: GuidePreferenceSurface;
  version: number;
};

const LEGACY_STORAGE_KEY = "smart-stock-guide-dashboard-sidebar-v1";
const SESSION_AUTO_START_KEY = "smart-stock-guide-dashboard-auto-started";

function normalizeScope(versionOrScope: number | GuidePreferenceScope): GuidePreferenceScope {
  if (typeof versionOrScope === "number") {
    return { surface: "desktop", version: versionOrScope };
  }

  return versionOrScope;
}

function storageKeyForScope(scope: GuidePreferenceScope) {
  if (scope.surface === "desktop") {
    return `smart-stock-guide-dashboard-sidebar-v${scope.version}`;
  }

  return `smart-stock-guide-mobile-intro-v${scope.version}`;
}

function sessionAutoStartKeyForScope(scope: GuidePreferenceScope) {
  if (scope.surface === "desktop") {
    return `${SESSION_AUTO_START_KEY}-v${scope.version}`;
  }

  return `smart-stock-guide-mobile-auto-started-v${scope.version}`;
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

export function getGuidePreferenceStorageKey(versionOrScope: number | GuidePreferenceScope) {
  return storageKeyForScope(normalizeScope(versionOrScope));
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

function readRawPreference(versionOrScope: number | GuidePreferenceScope): GuidePreference | null {
  const scope = normalizeScope(versionOrScope);

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForScope(scope));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<GuidePreference & LegacyGuidePreference>;
    if (typeof parsed.autoStartShown !== "boolean") {
      if (scope.surface !== "desktop") {
        return null;
      }

      return migrateLegacyPreference(parsed as LegacyGuidePreference, scope.version);
    }

    if (
      parsed.version !== scope.version ||
      typeof parsed.firstSeenAt !== "string" ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.suppressContextualPrompts !== "boolean" ||
      typeof parsed.nudgeCount !== "number" ||
      !isValidGuideStatus(parsed.status ?? null)
    ) {
      return null;
    }

    return {
      version: scope.version,
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

export function readGuidePreference(versionOrScope: number | GuidePreferenceScope): GuidePreference | null {
  const scope = normalizeScope(versionOrScope);
  if (scope.surface === "desktop") {
    purgeLegacyGuidePreference();
  }

  return readRawPreference(scope);
}

function persistGuidePreference(preference: GuidePreference, scope: GuidePreferenceScope) {
  if (typeof window === "undefined") {
    return preference;
  }

  try {
    window.localStorage.setItem(storageKeyForScope(scope), JSON.stringify(preference));
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
  versionOrScope: number | GuidePreferenceScope,
  options?: { serverState?: GuideServerState | null },
): GuideCompletion | null {
  const local = readGuidePreference(versionOrScope);
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

export function isGuideHardDismissed(
  versionOrScope: number | GuidePreferenceScope,
  options?: { serverState?: GuideServerState | null },
) {
  const local = readGuidePreference(versionOrScope);
  if (local?.suppressContextualPrompts || local?.status === "dismissed") {
    return true;
  }

  return options?.serverState === "DISMISSED";
}

export function isGuideAutoStartEligible(
  versionOrScope: number | GuidePreferenceScope,
  options?: { serverState?: GuideServerState | null },
) {
  const scope = normalizeScope(versionOrScope);

  if (typeof window !== "undefined" && hasGuideAutoStartedThisSession(scope)) {
    return false;
  }

  if (isGuideHardDismissed(scope, options)) {
    return false;
  }

  const local = readGuidePreference(scope);
  if (local?.autoStartShown || local?.status) {
    return false;
  }

  if (options?.serverState === "COMPLETED" || options?.serverState === "DISMISSED") {
    return false;
  }

  return true;
}

export function isGuideNudgeEligible(
  versionOrScope: number | GuidePreferenceScope,
  options?: { serverState?: GuideServerState | null },
) {
  const scope = normalizeScope(versionOrScope);

  if (isGuideHardDismissed(scope, options)) {
    return false;
  }

  const local = readGuidePreference(scope);
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

export function isGuideLauncherProminent(versionOrScope: number | GuidePreferenceScope) {
  const scope = normalizeScope(versionOrScope);

  if (isGuideHardDismissed(scope)) {
    return false;
  }

  const local = readGuidePreference(scope);
  if (!local) {
    return true;
  }

  if (local.status === "completed") {
    return false;
  }

  return isWithinWindow(local.firstSeenAt, GUIDE_LAUNCHER_PROMINENCE_MS);
}

export function hasGuideAutoStartedThisSession(versionOrScope: number | GuidePreferenceScope) {
  const scope = normalizeScope(versionOrScope);

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(sessionAutoStartKeyForScope(scope)) === "true";
  } catch {
    return false;
  }
}

export function markGuideAutoStartedThisSession(versionOrScope: number | GuidePreferenceScope) {
  const scope = normalizeScope(versionOrScope);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(sessionAutoStartKeyForScope(scope), "true");
  } catch {
    // Ignore storage failures.
  }
}

export function markGuideAutoStartShown(versionOrScope: number | GuidePreferenceScope) {
  const scope = normalizeScope(versionOrScope);
  const existing = readGuidePreference(scope);
  const timestamp = nowIso();

  return persistGuidePreference(
    createPreference(scope.version, {
      ...existing,
      autoStartShown: true,
      firstSeenAt: existing?.firstSeenAt ?? timestamp,
      updatedAt: timestamp,
      lastNudgeAt: existing?.lastNudgeAt ?? null,
      nudgeCount: existing?.nudgeCount ?? 0,
      status: existing?.status ?? null,
      suppressContextualPrompts: existing?.suppressContextualPrompts ?? false,
    }),
    scope,
  );
}

export function writeGuidePreference(
  versionOrScope: number | GuidePreferenceScope,
  completion: GuideCompletion,
): GuidePreference | null {
  const scope = normalizeScope(versionOrScope);
  const existing = readGuidePreference(scope);
  const timestamp = nowIso();

  return persistGuidePreference(
    createPreference(scope.version, {
      ...existing,
      autoStartShown: true,
      status: completion.status,
      firstSeenAt: existing?.firstSeenAt ?? timestamp,
      updatedAt: timestamp,
      suppressContextualPrompts: completion.suppressContextualPrompts,
      lastNudgeAt: existing?.lastNudgeAt ?? null,
      nudgeCount: existing?.nudgeCount ?? 0,
    }),
    scope,
  );
}

export function recordGuideNudgeShown(versionOrScope: number | GuidePreferenceScope) {
  const scope = normalizeScope(versionOrScope);
  const existing = readGuidePreference(scope);
  if (!existing) {
    return null;
  }

  const timestamp = nowIso();
  return persistGuidePreference(
    {
      ...existing,
      lastNudgeAt: timestamp,
      nudgeCount: existing.nudgeCount + 1,
      updatedAt: timestamp,
    },
    scope,
  );
}

export function recordGuideNudgeSnooze(versionOrScope: number | GuidePreferenceScope) {
  const scope = normalizeScope(versionOrScope);
  const existing = readGuidePreference(scope);
  if (!existing) {
    return null;
  }

  const timestamp = nowIso();
  return persistGuidePreference(
    {
      ...existing,
      lastNudgeAt: timestamp,
      updatedAt: timestamp,
    },
    scope,
  );
}

export function recordGuideHardDismiss(versionOrScope: number | GuidePreferenceScope) {
  const scope = normalizeScope(versionOrScope);
  const existing = readGuidePreference(scope);
  const timestamp = nowIso();

  return persistGuidePreference(
    createPreference(scope.version, {
      ...existing,
      autoStartShown: true,
      status: "dismissed",
      firstSeenAt: existing?.firstSeenAt ?? timestamp,
      updatedAt: timestamp,
      suppressContextualPrompts: true,
      lastNudgeAt: existing?.lastNudgeAt ?? null,
      nudgeCount: existing?.nudgeCount ?? 0,
    }),
    scope,
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
  versionOrScope: number | GuidePreferenceScope,
  serverState: GuideServerState | null,
): GuidePreference | null {
  const scope = normalizeScope(versionOrScope);
  const local = readGuidePreference(scope);

  if (!serverState) {
    return local;
  }

  if (serverState === "DISMISSED") {
    return applyServerHardDismiss(scope, local);
  }

  if (!local) {
    return writeGuidePreference(scope, serverStateToCompletion(serverState));
  }

  if (local.suppressContextualPrompts || local.status === "dismissed") {
    return local;
  }

  if (local.status === "skipped" || local.status === "completed") {
    return local;
  }

  if (!local.status) {
    return writeGuidePreference(scope, serverStateToCompletion(serverState));
  }

  return local;
}

function applyServerHardDismiss(scope: GuidePreferenceScope, local: GuidePreference | null) {
  const timestamp = nowIso();

  return persistGuidePreference(
    createPreference(scope.version, {
      ...local,
      autoStartShown: true,
      status: "dismissed",
      firstSeenAt: local?.firstSeenAt ?? timestamp,
      updatedAt: timestamp,
      suppressContextualPrompts: true,
      lastNudgeAt: local?.lastNudgeAt ?? null,
      nudgeCount: local?.nudgeCount ?? 0,
    }),
    scope,
  );
}

export function clearGuidePreference(versionOrScope: number | GuidePreferenceScope) {
  const scope = normalizeScope(versionOrScope);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(storageKeyForScope(scope));
  } catch {
    // Ignore storage failures.
  }
}
