import Link from "next/link";
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthSaveSnapshotCardProps = {
  description?: string;
  helperText?: string;
  onSave: () => void;
  saveLabel?: string;
  saveMessage?: string | null;
  title?: string;
  locale?: AppLocale;
};

export function WealthSaveSnapshotCard({
  title,
  description,
  helperText,
  saveLabel,
  onSave,
  saveMessage,
  locale,
}: WealthSaveSnapshotCardProps) {
  const copy = getWealthToolsLanguage(locale).common;
  const resolvedTitle = title ?? "Track this certificate, future profit payments, and maturity automatically.";
  return (
    <div className="wealth-sp-save-card">
      <p className="eyebrow">{description ?? copy.snapshotEyebrow}</p>
      <h3>{resolvedTitle}</h3>
      <div className="wealth-sp-save-actions">
        <button className="wealth-primary-button" onClick={onSave} type="button">
          {saveLabel ?? copy.saveToSnapshot}
        </button>
        <Link className="wealth-inline-link" href="/wealth/snapshot">
          {copy.openSnapshot}
        </Link>
      </div>
      <p className="wealth-sp-save-helper">{helperText ?? copy.snapshotHelper}</p>
      {saveMessage ? <p className="wealth-local-note">{saveMessage}</p> : null}
    </div>
  );
}
