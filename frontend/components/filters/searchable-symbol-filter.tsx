"use client";

import { useMemo, useState } from "react";

type SymbolOption = {
  id: string;
  symbol: string;
  name: string;
};

type SearchableSymbolFilterProps = {
  id: string;
  label?: string;
  options: SymbolOption[];
  value: string;
  onChange: (value: string) => void;
};

export function SearchableSymbolFilter({
  id,
  label = "Symbol",
  options,
  value,
  onChange,
}: SearchableSymbolFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const filteredOptions = useMemo(() => {
    const query = value.trim().toUpperCase();
    return options
      .filter((option) => !query || option.symbol.includes(query) || option.name.toUpperCase().includes(query))
      .slice(0, 12);
  }, [options, value]);

  return (
    <div className="searchable-symbol-filter">
      <label htmlFor={id}>{label}</label>
      <input
        autoComplete="off"
        id={id}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        onFocus={() => setIsOpen(true)}
        placeholder="Search symbol..."
        value={value}
      />
      <button aria-label="Open symbol options" onClick={() => setIsOpen((current) => !current)} type="button">
        v
      </button>
      {value ? (
        <button aria-label="Clear symbol filter" onClick={() => onChange("")} type="button">
          Clear
        </button>
      ) : null}
      {isOpen ? (
        <div className="symbol-filter-menu" role="listbox">
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                key={option.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.symbol);
                  setIsOpen(false);
                }}
                role="option"
                type="button"
              >
                <strong>{option.symbol}</strong>
                <span>{option.name}</span>
              </button>
            ))
          ) : (
            <div className="symbol-filter-empty">No matching symbol</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
