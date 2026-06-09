import type { LocalMoneySnapshotDraft } from "@/features/wealth/types/wealth-types";

const STORAGE_KEY = "smart-stock-local-money-snapshot";

const EMPTY_DRAFT: LocalMoneySnapshotDraft = {
  assets: [],
  liabilities: [],
  savedScenarioTitles: [],
};

export function readLocalMoneySnapshot(): LocalMoneySnapshotDraft {
  if (typeof window === "undefined") {
    return EMPTY_DRAFT;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_DRAFT;
    }
    return { ...EMPTY_DRAFT, ...JSON.parse(raw) } as LocalMoneySnapshotDraft;
  } catch {
    return EMPTY_DRAFT;
  }
}

export function writeLocalMoneySnapshot(draft: LocalMoneySnapshotDraft) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function appendLocalScenarioTitle(title: string) {
  const draft = readLocalMoneySnapshot();
  if (!draft.savedScenarioTitles.includes(title)) {
    draft.savedScenarioTitles = [title, ...draft.savedScenarioTitles].slice(0, 12);
    writeLocalMoneySnapshot(draft);
  }
}

export function saveLocalMoneySnapshotDraft(
  draft: Pick<LocalMoneySnapshotDraft, "monthly_savings" | "assets" | "liabilities">,
) {
  const current = readLocalMoneySnapshot();
  writeLocalMoneySnapshot({
    ...current,
    monthly_savings: draft.monthly_savings,
    assets: draft.assets,
    liabilities: draft.liabilities,
  });
}
