"use client";

import { useState, type ReactNode } from "react";

import {
  assetIconForDraft,
  buildAssetMetaLine,
  buildLiabilityMetaLine,
  metadataValue,
  optionIdForAsset,
  type SnapshotDraftAsset,
  type SnapshotDraftLiability,
} from "@/features/wealth/lib/snapshot-entry-helpers";
import { formatAssetProjectionLine } from "@/features/wealth/lib/snapshot-dashboard-helpers";
import { getWealthSnapshotLanguage } from "@/features/wealth/wealth-snapshot-language";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import type { AppLocale } from "@/lib/locale/app-locale";

const ENTRY_ICONS: Record<string, string> = {
  cash: "💵",
  fdr: "🏦",
  dps: "📅",
  sanchayapatra: "🇧🇩",
  stocks: "📈",
  stock: "📈",
  gold: "🟡",
  property: "🏠",
  other: "📦",
  loan: "💳",
};

type SnapshotEntryListProps = {
  assets: SnapshotDraftAsset[];
  liabilities: SnapshotDraftLiability[];
  locale: AppLocale;
  onUpdateAsset: (index: number, asset: SnapshotDraftAsset) => void;
  onUpdateLiability: (index: number, liability: SnapshotDraftLiability) => void;
  onRemoveAsset: (index: number) => void;
  onRemoveLiability: (index: number) => void;
  renderAssetEditForm: (asset: SnapshotDraftAsset, onChange: (asset: SnapshotDraftAsset) => void) => ReactNode;
  renderLiabilityEditForm: (
    liability: SnapshotDraftLiability,
    onChange: (liability: SnapshotDraftLiability) => void,
  ) => ReactNode;
};

export function SnapshotEntryList({
  assets,
  liabilities,
  locale,
  onUpdateAsset,
  onUpdateLiability,
  onRemoveAsset,
  onRemoveLiability,
  renderAssetEditForm,
  renderLiabilityEditForm,
}: SnapshotEntryListProps) {
  const copy = getWealthSnapshotLanguage(locale);
  const totalCount = assets.length + liabilities.length;

  if (!totalCount) {
    return null;
  }

  return (
    <div className="wealth-pending-entry-panel">
      <div className="wealth-pending-entry-panel-heading">
        <strong>{copy.entryList.savedItems(totalCount)}</strong>
        {totalCount > 4 ? <span className="wealth-pending-entry-scroll-hint">{copy.entryList.scrollHint}</span> : null}
      </div>
      <div className="wealth-pending-entry-scroll">
        {assets.map((asset, index) => (
          <SnapshotAssetRow
            asset={asset}
            copy={copy}
            index={index}
            key={`asset-${index}-${asset.label}-${metadataValue(asset.metadata, "account_identifier")}`}
            onRemove={() => onRemoveAsset(index)}
            onUpdate={(next) => onUpdateAsset(index, next)}
            renderEditForm={renderAssetEditForm}
          />
        ))}
        {liabilities.map((liability, index) => (
          <SnapshotLiabilityRow
            copy={copy}
            index={index}
            key={`liability-${index}-${liability.label}`}
            liability={liability}
            onRemove={() => onRemoveLiability(index)}
            onUpdate={(next) => onUpdateLiability(index, next)}
            renderEditForm={renderLiabilityEditForm}
          />
        ))}
      </div>
    </div>
  );
}

function SnapshotAssetRow({
  asset,
  copy,
  onUpdate,
  onRemove,
  renderEditForm,
}: {
  asset: SnapshotDraftAsset;
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  index: number;
  onUpdate: (asset: SnapshotDraftAsset) => void;
  onRemove: () => void;
  renderEditForm: (asset: SnapshotDraftAsset, onChange: (asset: SnapshotDraftAsset) => void) => ReactNode;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(asset);
  const metaParts = buildAssetMetaLine(asset);
  const projectionLine = formatAssetProjectionLine(asset);
  const icon = assetIconForDraft(asset, ENTRY_ICONS);

  function handleStartEdit() {
    setEditDraft(asset);
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setEditDraft(asset);
    setIsEditing(false);
  }

  function handleSaveEdit() {
    if (!editDraft.value) {
      return;
    }
    onUpdate({ ...editDraft, label: editDraft.label.trim() || asset.label });
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="wealth-pending-entry-row wealth-pending-entry-row-editing">
        <div className="wealth-pending-entry-edit-header">
          <span className="wealth-pending-entry-icon" aria-hidden="true">
            {icon}
          </span>
          <strong>{copy.entryList.editItem(asset.label)}</strong>
        </div>
        {renderEditForm(editDraft, setEditDraft)}
        <div className="wealth-pending-entry-edit-actions">
          <button className="wealth-chip wealth-chip-compact" onClick={handleCancelEdit} type="button">
            {copy.entryList.cancel}
          </button>
          <button className="wealth-primary-button wealth-chip-compact" onClick={handleSaveEdit} type="button">
            {copy.entryList.done}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wealth-pending-entry-row">
      <span className="wealth-pending-entry-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="wealth-pending-entry-main">
        <div className="wealth-pending-entry-title-row">
          <strong>{asset.label}</strong>
          <span className="wealth-pending-entry-amount">{formatWealthCurrency(asset.value)}</span>
        </div>
        {metaParts.length ? (
          <p className="wealth-pending-entry-meta">{metaParts.join(" · ")}</p>
        ) : (
          <p className="wealth-pending-entry-meta wealth-pending-entry-meta-muted">{optionIdForAsset(asset)}</p>
        )}
        {projectionLine ? <p className="wealth-pending-entry-projection">{projectionLine}</p> : null}
      </div>
      <div className="wealth-pending-entry-actions">
        <button
          aria-label={copy.entryList.editItem(asset.label)}
          className="wealth-pending-entry-action"
          onClick={handleStartEdit}
          type="button"
        >
          ✎
        </button>
        <button
          aria-label={copy.entryList.removeItem(asset.label)}
          className="wealth-pending-entry-action wealth-pending-entry-action-danger"
          onClick={onRemove}
          type="button"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function SnapshotLiabilityRow({
  liability,
  copy,
  onUpdate,
  onRemove,
  renderEditForm,
}: {
  liability: SnapshotDraftLiability;
  copy: ReturnType<typeof getWealthSnapshotLanguage>;
  index: number;
  onUpdate: (liability: SnapshotDraftLiability) => void;
  onRemove: () => void;
  renderEditForm: (
    liability: SnapshotDraftLiability,
    onChange: (liability: SnapshotDraftLiability) => void,
  ) => ReactNode;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(liability);
  const metaParts = buildLiabilityMetaLine(liability);

  function handleStartEdit() {
    setEditDraft(liability);
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setEditDraft(liability);
    setIsEditing(false);
  }

  function handleSaveEdit() {
    if (!editDraft.balance) {
      return;
    }
    onUpdate({ ...editDraft, label: editDraft.label.trim() || liability.label });
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="wealth-pending-entry-row wealth-pending-entry-row-editing wealth-pending-entry-row-liability">
        <div className="wealth-pending-entry-edit-header">
          <span className="wealth-pending-entry-icon" aria-hidden="true">
            💳
          </span>
          <strong>{copy.entryList.editItem(liability.label)}</strong>
        </div>
        {renderEditForm(editDraft, setEditDraft)}
        <div className="wealth-pending-entry-edit-actions">
          <button className="wealth-chip wealth-chip-compact" onClick={handleCancelEdit} type="button">
            {copy.entryList.cancel}
          </button>
          <button className="wealth-primary-button wealth-chip-compact" onClick={handleSaveEdit} type="button">
            {copy.entryList.done}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wealth-pending-entry-row wealth-pending-entry-row-liability">
      <span className="wealth-pending-entry-icon" aria-hidden="true">
        💳
      </span>
      <div className="wealth-pending-entry-main">
        <div className="wealth-pending-entry-title-row">
          <strong>{liability.label}</strong>
          <span className="wealth-pending-entry-amount">{formatWealthCurrency(liability.balance)}</span>
        </div>
        {metaParts.length ? <p className="wealth-pending-entry-meta">{metaParts.join(" · ")}</p> : null}
      </div>
      <div className="wealth-pending-entry-actions">
        <button
          aria-label={copy.entryList.editItem(liability.label)}
          className="wealth-pending-entry-action"
          onClick={handleStartEdit}
          type="button"
        >
          ✎
        </button>
        <button
          aria-label={copy.entryList.removeItem(liability.label)}
          className="wealth-pending-entry-action wealth-pending-entry-action-danger"
          onClick={onRemove}
          type="button"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
