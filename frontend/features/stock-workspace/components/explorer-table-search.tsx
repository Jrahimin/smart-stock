"use client";

import { Search, X } from "lucide-react";
import {
  startTransition,
  useEffect,
  useId,
  useState,
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
  debounceMs = 200,
}: ExplorerTableSearchProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        onChange(draft);
      });
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [debounceMs, draft, onChange, value]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setDraft(event.target.value);
  }

  function clear() {
    setDraft("");
    startTransition(() => {
      onChange("");
    });
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
