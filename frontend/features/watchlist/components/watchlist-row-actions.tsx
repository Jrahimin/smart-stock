"use client";

import { WatchlistHoldingToggle } from "@/features/watchlist/components/watchlist-holding-toggle";
import { WatchlistNoteButton } from "@/features/watchlist/components/watchlist-note-button";
import { WatchlistNotePopover } from "@/features/watchlist/components/watchlist-note-popover";
import { WatchlistStarToggle } from "@/features/watchlist/components/watchlist-star-toggle";

type WatchlistRowActionsProps = {
  stockId: string;
  isHolding: boolean;
  hasNote: boolean;
  isNoteEditing: boolean;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: () => void;
  onCancelNote: () => void;
  onToggleNote: () => void;
};

export function WatchlistRowActions({
  stockId,
  isHolding,
  hasNote,
  isNoteEditing,
  noteDraft,
  onNoteDraftChange,
  onSaveNote,
  onCancelNote,
  onToggleNote,
}: WatchlistRowActionsProps) {
  return (
    <div className="watchlist-actions-wrap">
      <div className="watchlist-row-actions">
        <WatchlistStarToggle stockId={stockId} />
        <WatchlistHoldingToggle isHolding={isHolding} stockId={stockId} />
        <WatchlistNoteButton hasNote={hasNote} isEditing={isNoteEditing} onClick={onToggleNote} />
      </div>
      {isNoteEditing ? (
        <WatchlistNotePopover
          noteDraft={noteDraft}
          onCancel={onCancelNote}
          onNoteDraftChange={onNoteDraftChange}
          onSave={onSaveNote}
        />
      ) : null}
    </div>
  );
}
