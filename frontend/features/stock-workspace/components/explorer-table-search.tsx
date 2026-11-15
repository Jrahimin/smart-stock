"use client";

import { Search, X } from "lucide-react";
import {
  useId,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

type ExplorerTableSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  clearAriaLabel: string;
  debounceMs?: number;
};

export function ExplorerTableSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearAriaLabel,
}: ExplorerTableSearchProps) {
  const inputId = useId();
  const draft = value;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  function clear() {
    onChange("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (draft) {
        clear();
      }
    }
  }

  return (
    <div className="explorer-table-search">
      <label className="explorer-table-search-icon" htmlFor={inputId}>
        <Search aria-hidden="true" size={15} strokeWidth={2} />
        <span className="sr-only">{ariaLabel}</span>
      </label>
      <input
        aria-label={ariaLabel}
        autoComplete="off"
        className="explorer-table-search-input"
        enterKeyHint="search"
        id={inputId}
        inputMode="search"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        type="text"
        value={draft}
      />
      {draft ? (
        <button
          aria-label={clearAriaLabel}
          className="explorer-table-search-clear"
          onClick={clear}
          type="button"
        >
          <X aria-hidden="true" size={13} strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}
