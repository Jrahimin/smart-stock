import Link from "next/link";

type WealthSaveSnapshotCardProps = {
  description?: string;
  helperText?: string;
  onSave: () => void;
  saveLabel?: string;
  saveMessage?: string | null;
  title?: string;
};

export function WealthSaveSnapshotCard({
  title = "Track this certificate, future profit payments, and maturity automatically.",
  description = "Save to Money Snapshot",
  helperText = "The more financial information you save, the richer future projections become.",
  saveLabel = "Save to Snapshot",
  onSave,
  saveMessage,
}: WealthSaveSnapshotCardProps) {
  return (
    <div className="wealth-sp-save-card">
      <p className="eyebrow">{description}</p>
      <h3>{title}</h3>
      <div className="wealth-sp-save-actions">
        <button className="wealth-primary-button" onClick={onSave} type="button">
          {saveLabel}
        </button>
        <Link className="wealth-inline-link" href="/wealth/snapshot">
          Open Money Snapshot
        </Link>
      </div>
      <p className="wealth-sp-save-helper">{helperText}</p>
      {saveMessage ? <p className="wealth-local-note">{saveMessage}</p> : null}
    </div>
  );
}
