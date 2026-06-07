"use client";

import { Check, X } from "lucide-react";

type WatchlistNotePopoverProps = {
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function WatchlistNotePopover({
  noteDraft,
  onNoteDraftChange,
  onSave,
  onCancel,
}: WatchlistNotePopoverProps) {
  return (
    <div className="watchlist-note-popover" role="dialog" aria-label="Edit note">
      <textarea
        autoFocus
        onChange={(event) => onNoteDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
        }}
        placeholder="Personal note..."
        rows={2}
        value={noteDraft}
      />
      <div className="watchlist-note-popover-actions">
        <button className="watchlist-inline-text-btn watchlist-inline-text-btn-primary" onClick={onSave} type="button">
          <Check size={14} />
          Save
        </button>
        <button className="watchlist-inline-text-btn" onClick={onCancel} type="button">
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}
