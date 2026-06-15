const DISMISSED_KEY = "smart-stock-wealth-nav-insights-dismissed-v1";

export function readDismissedWealthInsightIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function dismissWealthInsightIds(ids: string[]) {
  if (typeof window === "undefined" || ids.length === 0) {
    return;
  }

  const current = new Set(readDismissedWealthInsightIds());
  ids.forEach((id) => current.add(id));
  window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...current]));
}
