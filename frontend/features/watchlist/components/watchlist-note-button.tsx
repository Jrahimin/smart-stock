"use client";

import { FileText } from "lucide-react";

type WatchlistNoteButtonProps = {
  hasNote: boolean;
  isEditing: boolean;
  onClick: () => void;
  disabled?: boolean;
};

export function WatchlistNoteButton({ hasNote, isEditing, onClick, disabled = false }: WatchlistNoteButtonProps) {
  const tooltip = hasNote ? "Edit Note" : "Add Note";

  return (
    <button
      type="button"
      className={`watchlist-icon-btn watchlist-note-button ${hasNote ? "has-note" : ""} ${isEditing ? "is-editing" : ""}`}
      aria-label={tooltip}
      title={tooltip}
      aria-pressed={isEditing}
      disabled={disabled}
      onClick={onClick}
    >
      <FileText size={15} fill={hasNote ? "currentColor" : "none"} strokeWidth={2} />
    </button>
  );
}
